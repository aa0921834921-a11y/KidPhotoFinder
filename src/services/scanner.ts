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
import { bump, getState, setState } from './state';

let cancel = false;
export const requestStop = () => { cancel = true; setState({ message: '正在停止，會先把找到的照片存好…' }); };

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
    if (cancel) break;
    onEach?.(i, todo.length);
    const f = await DB.fileById(todo[i]);
    if (!f) continue;
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
export async function runScan(mode: 'manual' | 'background', budgetMs = Infinity): Promise<ScanResult> {
  if (getState().running) return { scanned: 0, saved: 0, review: 0, errors: 0, stopped: true };
  const started = DB.now(), t0 = Date.now();
  cancel = false;
  setState({ running: true, phase: 'list', done: 0, total: 0, found: 0, eta: '', message: '正在看老師的資料夾…', lastError: null });
  if (mode === 'manual') await activateKeepAwakeAsync('scan').catch(() => {});
  let scanned = 0, errors = 0, saved = 0, review = 0;
  try {
    const s = await DB.getSettings();
    if (!s.folderId) throw new Error('還沒選老師的資料夾');
    if (!modelReady()) {
      setState({ phase: 'model', message: '正在下載辨識模型…' });
      await downloadModel((p) => setState({ modelProgress: p }));
    }
    const listed = await Drive.listFolder(s.folderId, s.folderName || '老師的資料夾', (n) => setState({ message: `正在看老師的資料夾…已經找到 ${n} 個檔案` }));
    await DB.upsertListed(listed.map(({ thumb, ...f }) => f));
    const thumbs = new Map(listed.map((f) => [f.id, f.thumb]));
    const todo = await DB.filesToScan(s.videos);
    setState({ phase: 'scan', total: todo.length, message: todo.length ? '正在找臉' : '沒有新照片' });
    let found = 0;
    for (let i = 0; i < todo.length; i++) {
      if (cancel || Date.now() - t0 > budgetMs) break;
      const f = todo[i];
      try {
        if (f.kind === 'video') {
          const v = await videoFaces(f.id, f.name);
          await DB.saveScan(f.id, v.out, v.w, v.h);
        } else {
          const uri = await Drive.fetchForScan({ id: f.id, name: f.name, thumb: thumbs.get(f.id), kind: f.kind });
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
      const el = (Date.now() - t0) / 1000, per = el / (i + 1);
      setState({ done: i + 1, found, eta: fmtEta(per * (todo.length - i - 1)) });
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
    if (mode === 'manual') deactivateKeepAwake('scan');
    setState({ running: false, phase: 'done', message: '' });
    await refreshCounts();
    bump();
  }
}
