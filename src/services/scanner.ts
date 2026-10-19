/**
 * 整個流程：列出老師資料夾 → 新照片找臉 → 判斷 → 確定的存進相簿。
 * 規則跟電腦版一樣；中途停止或被系統暫停也沒關係，下次會接著做。
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { buildReferences, decide, THRESHOLDS } from '../core/decide';
import * as DB from './db';
import * as Drive from './drive';
import { analyze, downloadModel, loadImage, modelReady } from './recognizer';
import { copyLocalToAlbum, isLocal } from './localClean';
import { bump, getState, setState } from './state';

let cancel = false;     // 停止找新照片（目前這張看完就停）
let hardCancel = false; // 連存相簿也馬上停（系統要收回背景執行時間時）
class Stopped extends Error {}
/** 按「停止」。找到的照片還是會先存好；hard = 連存照片也停（背景時間到）。 */
export const requestStop = (hard = false) => {
  if (hard) hardCancel = true;
  if (cancel) return;
  cancel = true;
  setState({ stopping: true, message: '停止中…目前這張看完就停，找到的照片會先存好' });
};

const PENDING = 'scan_pending';
/** 上次在 App 裡按的整理，是不是因為 App 被關掉而沒做完 */
export async function interruptedScan(): Promise<boolean> {
  if (getState().running) return false;
  return (await DB.getMeta(PENDING).catch(() => null)) === '1';
}

export async function refreshCounts() {
  setState({ counts: await DB.counts() });
}

/* ---------------------------------------------------------------- 參考照片 */

export async function referenceFeatures(): Promise<Float32Array[]> {
  const refs = await DB.listRefs();
  const { feats, results } = buildReferences(refs.map((r) => ({ id: r.id, faces: r.faces })));
  for (const r of results) {
    const old = refs.find((x) => x.id === r.id);
    if (old && (old.status !== r.status || old.chosen !== (r.chosen ?? null))) await DB.setRefStatus(r.id, r.status, r.chosen ?? null);
  }
  return feats;
}

/** 加入參考照片：複製到 App 裡、找臉（左右翻轉平均，比較準）。 */
export async function addReferencePhotos(uris: string[], onEach?: (i: number) => void): Promise<{ ok: number; noface: number }> {
  if (!modelReady()) throw new Error('請先下載辨識模型');
  const dir = new Directory(Paths.document, 'refs');
  if (!dir.exists) dir.create({ intermediates: true });
  let ok = 0, noface = 0;
  for (let i = 0; i < uris.length; i++) {
    onEach?.(i);
    const id = `${Date.now()}_${i}`;
    const dst = new File(dir, `${id}.jpg`);
    const img = await loadImage(uris[i], 2400);
    // 複製一份到 App 裡，之後顯示和重新計算都用這份
    new File(uris[i]).copy(dst);
    const faces = await analyze(img, { minFacePx: 24, flip: true });
    await DB.addRef(id, dst.uri, faces.map((f) => ({ size: f.size, emb: f.emb })));
    if (faces.length) ok++; else noface++;
  }
  await referenceFeatures();
  bump();
  return { ok, noface };
}

export async function removeReference(id: string, uri: string) {
  await DB.deleteRef(id);
  try { new File(uri).delete(); } catch {}
  await referenceFeatures();
  bump();
}

/* ---------------------------------------------------------------- 判斷 + 存相簿 */

async function judge() {
  const s = await DB.getSettings();
  const [m, r] = THRESHOLDS[s.strictness] || THRESHOLDS.standard;
  const refs = await referenceFeatures();
  const faces = await DB.loadFaces();
  const labels = await DB.loadLabels();
  const { decisions } = decide(faces, refs, labels, m, r);
  await DB.saveDecisions(decisions);
  return decisions;
}

async function album(name: string): Promise<MediaLibrary.Album | null> {
  return MediaLibrary.Album.get(name);
}

/** 確定的照片存進相簿（已經存過的不會重存）。只新增，不會刪掉手機裡的任何照片。 */
async function saveMatches(decisions: Map<string, { kind: string }>, onEach?: (i: number, n: number) => void): Promise<number> {
  const s = await DB.getSettings();
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('需要允許「加入照片」，才能把照片存進相簿');
  const saved = await DB.savedMap();
  const todo = [...decisions].filter(([k, d]) => d.kind === 'match' && !saved.has(k)).map(([k]) => k);
  let alb = await album(s.albumName);
  let n = 0;
  for (let i = 0; i < todo.length; i++) {
    if (hardCancel) break;
    onEach?.(i, todo.length);
    const f = await DB.fileById(todo[i]);
    if (!f) continue;
    if (isLocal(f.id)) { // 手機相簿（LINE 下載）的照片：直接複製一份
      try {
        const a = await copyLocalToAlbum(f.id, f.name, alb);
        if (!alb) alb = await MediaLibrary.Album.create(s.albumName, [a], true);
        await DB.markSaved(f.id, a.id);
        n++;
      } catch (e) { console.warn('save failed', f.name, e); }
      continue;
    }
    try {
      const local = await Drive.downloadOriginal(f.id, f.name);
      const asset = await MediaLibrary.Asset.create(local, alb || undefined);
      if (!alb) alb = await MediaLibrary.Album.create(s.albumName, [asset], true);
      await DB.markSaved(f.id, asset.id);
      try { new File(local).delete(); } catch {}
      n++;
    } catch (e) {
      console.warn('save failed', f.name, e);
    }
  }
  return n;
}

let applyTimer: ReturnType<typeof setTimeout> | null = null;
/** 家長按了「是／不是」：停手 4 秒後重新判斷全部照片。 */
export function scheduleApply() {
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => { applyTimer = null; applyNow().catch((e) => setState({ lastError: String(e?.message || e) })); }, 4000);
}

export async function applyNow() {
  if (getState().running) { scheduleApply(); return; }
  setState({ running: true, phase: 'decide', message: '正在套用你的變更…' });
  try {
    const d = await judge();
    setState({ phase: 'save' });
    await saveMatches(d, (i, n) => setState({ message: `存進相簿 ${i + 1} / ${n}` }));
  } finally {
    setState({ running: false, phase: 'idle', message: '' });
    await refreshCounts();
    bump();
  }
}

/* ---------------------------------------------------------------- 掃描 */

const fmtEta = (sec: number) => (sec < 90 ? '不到 2 分鐘' : sec < 3600 ? `約 ${Math.round(sec / 60)} 分鐘` : `約 ${(sec / 3600).toFixed(1)} 小時`);

async function videoFaces(id: string, name: string) {
  const local = await Drive.downloadOriginal(id, name);
  const out: { frame: number; box: number[]; emb: Float32Array }[] = [];
  let w = 0, h = 0;
  try {
    for (const t of [500, 2500, 5000, 8000, 12000, 16000, 22000, 30000]) {
      try {
        const th = await VideoThumbnails.getThumbnailAsync(local, { time: t, quality: 0.9 });
        const img = await loadImage(th.uri, 1600);
        w = img.w; h = img.h;
        for (const f of await analyze(img, { maxFaces: 12 })) out.push({ frame: t / 1000, box: f.box, emb: f.emb });
        try { new File(th.uri).delete(); } catch {}
      } catch { break; } // 影片比較短，後面的時間點沒有畫面
    }
  } finally {
    try { new File(local).delete(); } catch {}
  }
  return { out, w, h };
}

export type ScanResult = { scanned: number; saved: number; review: number; errors: number; stopped: boolean };

/**
 * mode: manual（在 App 裡按開始）/ background（系統排程）
 * budgetMs：背景執行時系統給的時間有限，時間快到就先收尾，下次接著做。
 */
const LIST_KEY = 'last_list'; // 上次完整看完老師資料夾：「資料夾ID|時間(ms)」
const LIST_RESUME = 'list_resume'; // 看資料夾看到一半的進度

/**
 * 多久之內看過資料夾就不用再看一次（資料夾有幾千個檔案時，光是看一遍就要好幾分鐘）：
 * 接著上次被關掉的整理 → 24 小時；在 App 裡再按一次 → 15 分鐘；背景自動 → 1 小時。
 */
const LIST_FRESH_MS = { resume: 24 * 3600e3, manual: 15 * 60e3, background: 3600e3 };

export async function runScan(mode: 'manual' | 'background', budgetMs = Infinity, opts: { resume?: boolean } = {}): Promise<ScanResult> {
  if (getState().running) return { scanned: 0, saved: 0, review: 0, errors: 0, stopped: true };
  const started = DB.now(), t0 = Date.now();
  cancel = false;
  hardCancel = false;
  // 記下「整理到一半」：App 被關掉的話，下次打開會接著做（已經看過的照片不會重看）
  if (mode === 'manual') await DB.setMeta(PENDING, '1').catch(() => {});
  setState({ running: true, stopping: false, phase: 'list', done: 0, total: 0, found: 0, eta: '', message: '正在看老師的資料夾…', lastError: null });
  if (mode === 'manual') await activateKeepAwakeAsync('scan').catch(() => {});
  let scanned = 0, errors = 0, saved = 0, review = 0;
  try {
    const s = await DB.getSettings();
    if (!s.folderId) throw new Error('還沒選老師的資料夾');
    if (!modelReady()) {
      setState({ phase: 'model', message: '正在下載辨識模型…' });
      await downloadModel((p) => setState({ modelProgress: p }));
    }
    let listed: Awaited<ReturnType<typeof Drive.listFolder>> = [];
    const [lastFolder, lastAt] = ((await DB.getMeta(LIST_KEY)) || '|0').split('|');
    const freshMs = opts.resume ? LIST_FRESH_MS.resume : LIST_FRESH_MS[mode];
    const pending = (await DB.filesToScan(s.videos)).length;
    const skipList = lastFolder === s.folderId && Date.now() - Number(lastAt) < freshMs && pending > 0;
    if (skipList) {
      setState({ message: `接著上次的進度，還有 ${pending} 張沒看過` });
    } else {
      try {
        // 看到一半被關掉的話，從上次看到的地方接著看（已經看到的檔案每一批都會先存好）
        const saved = JSON.parse((await DB.getMeta(LIST_RESUME)) || 'null') as { folderId: string; state: Drive.ListState } | null;
        const resume = saved && saved.folderId === s.folderId ? saved.state : null;
        if (resume) setState({ message: `接著看老師的資料夾…已經找到 ${resume.count} 個檔案` });
        const list = (from: Drive.ListState | null) => Drive.listFolder(s.folderId!, s.folderName || '老師的資料夾', (n) => {
          if (cancel) throw new Stopped(); // 資料夾很大時，看資料夾這一步也能停
          if (!getState().stopping) setState({ message: `正在看老師的資料夾…已經找到 ${n} 個檔案` });
        }, {
          resume: from,
          onWave: async (files, state) => {
            await DB.upsertListed(files.map(({ thumb, ...f }) => f));
            await DB.setMeta(LIST_RESUME, JSON.stringify({ folderId: s.folderId, state }));
          },
        });
        try {
          listed = await list(resume);
        } catch (e) {
          // 接著看失敗（例如隔太久，Google 的分頁記號過期了）：從頭看一次
          if (e instanceof Stopped || e instanceof Drive.NeedSignIn || !resume) throw e;
          await DB.setMeta(LIST_RESUME, '');
          listed = await list(null);
        }
        await DB.setMeta(LIST_RESUME, '');
        await DB.setMeta(LIST_KEY, `${s.folderId}|${Date.now()}`);
      } catch (e) {
        if (!(e instanceof Stopped)) throw e;
      }
    }
    const thumbs = new Map(listed.map((f) => [f.id, f.thumb]));
    const todo = cancel ? [] : await DB.filesToScan(s.videos);
    // 畫面顯示整體進度（之前看過的也算進去），App 重開後數字會接著跑
    const before = await DB.scanProgress(s.videos);
    const base = before.all - todo.length;
    setState({ phase: 'scan', total: before.all, done: base, found: before.withFaces, message: todo.length ? '正在找臉' : '沒有新照片' });
    let found = 0;
    // 看這一張的同時，先下載下一張（下載和找臉同時進行）
    const prefetch = (j: number) => {
      const g = todo[j];
      if (!g || g.kind !== 'image' || cancel) return null;
      const p = Drive.fetchForScan({ id: g.id, name: g.name, thumb: thumbs.get(g.id), kind: g.kind });
      p.catch(() => {});
      return p;
    };
    let next: Promise<string> | null = prefetch(0);
    let tFirst = 0; // 第一張看完的時間（第一張含啟動辨識引擎，不拿來估時間）
    for (let i = 0; i < todo.length; i++) {
      if (cancel || Date.now() - t0 > budgetMs) break;
      const f = todo[i];
      const mine = next;
      next = null;
      try {
        if (f.kind === 'video') {
          const v = await videoFaces(f.id, f.name);
          await DB.saveScan(f.id, v.out, v.w, v.h);
        } else {
          const uri = await (mine ?? Drive.fetchForScan({ id: f.id, name: f.name, thumb: thumbs.get(f.id), kind: f.kind }));
          next = prefetch(i + 1);
          const img = await loadImage(uri, 2048);
          const faces = await analyze(img);
          await DB.saveScan(f.id, faces.map((x) => ({ frame: -1, box: x.box, emb: x.emb })), img.w, img.h);
          Drive.dropScanFile(f.id);
          if (faces.length) found++;
        }
        scanned++;
      } catch (e: any) {
        if (e instanceof Drive.NeedSignIn) throw e;
        errors++;
        await DB.markBad(f.id);
      }
      if (!next) next = prefetch(i + 1);
      if (i === 0) tFirst = Date.now();
      const left = todo.length - i - 1;
      const eta = i >= 2 && left > 0 ? fmtEta(((Date.now() - tFirst) / i) * left) : '';
      setState({ done: base + i + 1, found: before.withFaces + found, eta });
    }
    setState({ phase: 'decide', message: '正在判斷…' });
    const decisions = await judge();
    review = [...decisions.values()].filter((d) => d.kind === 'review').length;
    setState({ phase: 'save', message: '正在把照片存進相簿…' });
    saved = await saveMatches(decisions, (i, n) => setState({ message: `存進相簿 ${i + 1} / ${n}` }));
    const stopped = cancel || Date.now() - t0 > budgetMs;
    await DB.addRun({ started, mode, scanned, matched: [...decisions.values()].filter((d) => d.kind === 'match').length, review, saved, errors, note: stopped ? '中途停止' : '' });
    if (saved > 0 && s.notify) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '有新的照片', body: `找到 ${saved} 張你小孩的新照片，已經存進「${s.albumName}」相簿${review ? `；另外 ${review} 張等你確認` : ''}。` },
        trigger: null,
      }).catch(() => {});
    }
    await DB.setMeta('last_scan', DB.now());
    return { scanned, saved, review, errors, stopped };
  } catch (e: any) {
    setState({ lastError: String(e?.message || e) });
    throw e;
  } finally {
    if (mode === 'manual') {
      deactivateKeepAwake('scan');
      await DB.setMeta(PENDING, '').catch(() => {}); // 正常結束、按停止、出錯都算結束；只有 App 被關掉才會留著
    }
    setState({ running: false, stopping: false, phase: 'done', message: '' });
    await refreshCounts();
    bump();
  }
}
