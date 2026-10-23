/**
 * 整個流程：列出老師資料夾 → 新照片找臉 → 判斷 → 確定的存進相簿。
 * 規則跟電腦版一樣；中途停止或被系統暫停也沒關係，下次會接著做。
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { tr } from '../i18n';
import * as DB from './db';
import * as Drive from './drive';
import { analyze, downloadModel, loadImage, modelReady } from './recognizer';
import { copyLocalToAlbum, isLocal } from './localClean';
import { judgeAll, referenceFeatures } from './judge';
import * as Notices from './notices';
import { bump, busy, getState, setState } from './state';
import * as FG from '../../modules/kpf-foreground';

const fgTitle = () => tr('scan.fgTitle');

let cancel = false;     // 停止找新照片（目前這張看完就停）
let hardCancel = false; // 連存相簿也馬上停（系統要收回背景執行時間時）
class Stopped extends Error {}
/** 按「停止」。找到的照片還是會先存好；hard = 連存照片也停（背景時間到）。 */
export const requestStop = (hard = false) => {
  if (hard) hardCancel = true;
  if (cancel) return;
  cancel = true;
  setState({ stopping: true, message: tr('scan.stoppingMsg') });
};

const PENDING = 'scan_pending';
/** 上次在 App 裡按的整理，是不是因為 App 被關掉而沒做完 */
export async function interruptedScan(): Promise<boolean> {
  if (busy()) return false;
  return (await DB.getMeta(PENDING).catch(() => null)) === '1';
}

export async function refreshCounts() {
  setState({ counts: await DB.counts() });
}

/* ---------------------------------------------------------------- 參考照片 */

export { referenceFeatures };

/** 加入參考照片（person：哪個孩子）：複製到 App 裡、找臉（左右翻轉平均，比較準）。 */
export async function addReferencePhotos(uris: string[], onEach?: (i: number) => void, person = ''): Promise<{ ok: number; noface: number }> {
  if (!modelReady()) throw new Error(tr('err.needModel'));
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
    await DB.addRef(id, dst.uri, faces.map((f) => ({ size: f.size, emb: f.emb })), person);
    if (faces.length) ok++; else noface++;
  }
  await referenceFeatures(person);
  bump();
  return { ok, noface };
}

export async function removeReference(id: string, uri: string, person = '') {
  await DB.deleteRef(id);
  try { new File(uri).delete(); } catch {}
  await referenceFeatures(person);
  bump();
}

/** 移除一個孩子（參考照片檔案也刪掉；已經存進相簿的照片不會動） */
export async function removeKid(key: string) {
  for (const r of await DB.removeKid(key)) { try { new File(r.uri).delete(); } catch {} }
  bump();
}

/* ---------------------------------------------------------------- 判斷 + 存相簿 */

const judge = judgeAll;

async function album(name: string): Promise<MediaLibrary.Album | null> {
  return MediaLibrary.Album.get(name);
}

/**
 * 確定的照片存進相簿（已經存過的不會重存）。只新增，不會刪掉手機裡的任何照片。
 * 回傳這次存好的照片；deadline 之後就先停（剩下的下次再存）。
 */
async function saveMatches(decisions: Map<string, { kind: string }>, onEach?: (i: number, n: number) => void, deadline = Infinity): Promise<string[]> {
  const s = await DB.getSettings();
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) throw new Error(tr('err.needSavePerm'));
  const saved = await DB.savedMap();
  const todo = [...decisions].filter(([k, d]) => d.kind === 'match' && !saved.has(k)).map(([k]) => k);
  let alb = await album(s.albumName);
  const done: string[] = [];
  for (let i = 0; i < todo.length; i++) {
    if (hardCancel || Date.now() > deadline) break;
    onEach?.(i, todo.length);
    const f = await DB.fileById(todo[i]);
    if (!f) continue;
    if (isLocal(f.id)) { // 手機相簿（LINE 下載）的照片：直接複製一份
      try {
        const a = await copyLocalToAlbum(f.id, f.name, alb);
        if (!alb) alb = await MediaLibrary.Album.create(s.albumName, [a], true);
        await DB.markSaved(f.id, a.id);
        done.push(f.id);
      } catch (e) { console.warn('save failed', f.name, e); }
      continue;
    }
    try {
      const local = await Drive.downloadOriginal(f.id, f.name);
      const asset = await MediaLibrary.Asset.create(local, alb || undefined);
      if (!alb) alb = await MediaLibrary.Album.create(s.albumName, [asset], true);
      await DB.markSaved(f.id, asset.id);
      try { new File(local).delete(); } catch {}
      done.push(f.id);
    } catch (e) {
      console.warn('save failed', f.name, e);
    }
  }
  return done;
}

let applyTimer: ReturnType<typeof setTimeout> | null = null;
let applyAfterScan = false;
/** 家長按了「是／不是」：停手 4 秒後重新判斷全部照片。 */
export function scheduleApply() {
  if (applyTimer) clearTimeout(applyTimer);
  setState({ applying: true });
  applyTimer = setTimeout(() => { applyTimer = null; applyNow().catch((e) => setState({ lastError: String(e?.message || e) })); }, 4000);
}

export async function applyNow() {
  if (busy()) {
    // 正在找新照片：掃描每看 40 張會重新判斷（會用到你的答案）；掃描結束後再補套用一次，確保最後按的也算進去
    applyAfterScan = true;
    setState({ applying: false });
    return;
  }
  setState({ running: true, phase: 'decide', message: tr('scan.applying') });
  try {
    const d = await judge();
    setState({ phase: 'save' });
    await saveMatches(d, (i, n) => setState({ message: tr('scan.savingN', { i: i + 1, n }) }));
  } finally {
    setState({ running: false, phase: 'idle', message: '', applying: !!applyTimer });
    await refreshCounts();
    bump();
  }
}

/* ---------------------------------------------------------------- 掃描 */

const fmtEta = (sec: number) => (sec < 90 ? tr('eta.soon') : sec < 3600 ? tr('eta.min', { n: Math.round(sec / 60) }) : tr('eta.hour', { n: (sec / 3600).toFixed(1) }));

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

export type ScanResult = {
  scanned: number; saved: number; review: number; errors: number; stopped: boolean;
  /** 還剩幾張沒看（下次接著看） */
  left?: number;
  /** 自動檢查：老師沒有新照片，什麼都不用做 */
  idle?: boolean;
  /** 另一個整理正在進行，這次沒做 */
  busy?: boolean;
};

/**
 * mode: manual（在 App 裡按開始）/ background（系統排程）
 * budgetMs：背景執行時系統給的時間有限，時間快到就先收尾，下次接著做。
 */
const LIST_KEY = 'last_list'; // 上次完整看完老師資料夾：「資料夾ID|時間(ms)」
const LIST_RESUME = 'list_resume'; // 看資料夾看到一半的進度
const MAP_KEY = 'folder_map'; // 老師資料夾裡的所有子資料夾（快速檢查用）
const QUICK_KEY = 'quick_at'; // 上次快速檢查：「資料夾ID|時間(ms)」
/** 自動檢查平常只問「有沒有新檔案」；每天至少完整看一遍（搬進來的照片、改名的資料夾也看得到） */
const FULL_EVERY_MS = 24 * 3600e3;
/** 快速檢查多往前看一點，免得剛好錯過 */
const QUICK_MARGIN_MS = 30 * 60e3;

async function loadMap(folderId: string): Promise<Map<string, string> | null> {
  try {
    const own = await DB.getMeta(`${MAP_KEY}@${folderId}`);
    const v = JSON.parse(own || (await DB.getMeta(MAP_KEY)) || 'null') as { folderId: string; dirs: [string, string][] } | null;
    return v && v.folderId === folderId && v.dirs?.length ? new Map(v.dirs) : null;
  } catch {
    return null;
  }
}
const saveMap = (folderId: string, dirs: Map<string, string>) => DB.setMeta(`${MAP_KEY}@${folderId}`, JSON.stringify({ folderId, dirs: [...dirs] }));

/** 每個資料夾分開記：「key@資料夾ID」；也看得懂前一版的「資料夾ID|內容」 */
async function metaFor(key: string, folderId: string): Promise<string | null> {
  const v = await DB.getMeta(`${key}@${folderId}`).catch(() => null);
  if (v) return v;
  const old = (await DB.getMeta(key).catch(() => null)) || '';
  return old.startsWith(`${folderId}|`) ? old.slice(folderId.length + 1) : null;
}
const setMetaFor = (key: string, folderId: string, v: string) => DB.setMeta(`${key}@${folderId}`, v);

/** 時間(ms)（沒看過這個資料夾就是 0） */
async function stampFor(key: string, folderId: string): Promise<number> {
  return Number(await metaFor(key, folderId)) || 0;
}

/**
 * 快速檢查（自動檢查用）：只問老師的資料夾「最近有沒有新增或改過的檔案」，幾秒就好。
 * 有新的子資料夾（新的活動）就把它整個看一遍。
 */
async function quickCheck(folderId: string, dirs: Map<string, string>): Promise<Drive.ListedFile[]> {
  const startedAt = Date.now();
  const since = Math.max(await stampFor(QUICK_KEY, folderId), await stampFor(LIST_KEY, folderId)) - QUICK_MARGIN_MS;
  const r = await Drive.listChangedSince(dirs, since);
  let files = r.files;
  for (const nd of r.newDirs) {
    if (cancel) throw new Stopped();
    const sub = new Map<string, string>();
    files = files.concat(await Drive.listFolder(nd.id, nd.path, undefined, { dirs: sub }));
    for (const [id, path] of sub) dirs.set(id, path);
  }
  if (files.length) await DB.upsertListed(files.map(({ thumb, ...f }) => f));
  if (r.newDirs.length) await saveMap(folderId, dirs);
  await setMetaFor(QUICK_KEY, folderId, String(startedAt));
  return files;
}

/** 看一個老師的資料夾（快速檢查、接著看、或完整看一遍），回傳這次看到的檔案 */
async function listOne(folder: DB.Folder, mode: 'manual' | 'background', opts: { resume?: boolean }, videos: boolean,
  t0: number, budgetMs: number): Promise<Drive.ListedFile[]> {
  const folderId = folder.id;
  let listed: Drive.ListedFile[] = [];
  const lastAt = await stampFor(LIST_KEY, folderId);
  const freshMs = opts.resume ? LIST_FRESH_MS.resume : LIST_FRESH_MS[mode];
  const pending = await DB.pendingCount(videos);
  // 看到一半被關掉的話，從上次看到的地方接著看（已經看到的檔案每一批都會先存好）
  let resume: Drive.ListState | null = null;
  try { resume = JSON.parse((await metaFor(LIST_RESUME, folderId)) || 'null'); } catch {}
  // 前一版的寫法：{ folderId, state }
  if (resume && (resume as any).state) resume = (resume as any).folderId === folderId ? (resume as any).state : null;
  // 第一次看這個資料夾：看到的都算「以前的照片」
  const first = !(await DB.listedOnce(folderId));
  // 自動檢查：一天內完整看過資料夾的話，只問「有沒有新檔案」
  const map = mode === 'background' && !resume && !first && Date.now() - lastAt < FULL_EVERY_MS ? await loadMap(folderId) : null;
  if (map) {
    try {
      listed = await quickCheck(folderId, map);
    } catch (e) {
      if (e instanceof Drive.NeedSignIn) throw e;
      if (!(e instanceof Stopped)) console.warn('quick check failed', e); // 網路不穩之類：這次先整理還沒看的，下次再問
    }
    return listed;
  }
  if (!resume && !first && Date.now() - lastAt < freshMs && pending > 0) {
    setState({ message: tr('scan.resumePending', { n: pending }) });
    return listed;
  }
  try {
    if (resume) setState({ message: tr('scan.resumeListing', { n: resume.count }) });
    const dirs = new Map<string, string>();
    let dirsComplete = !resume || !!resume.dirs; // 舊版存的進度沒有資料夾清單
    const list = (from: Drive.ListState | null) => Drive.listFolder(folderId, folder.name || tr('scan.teacherFolder'), (n) => {
      // 資料夾很大時，看資料夾這一步也能停（背景時間到了也先停，看到哪裡都記著，下次接著看）
      if (cancel || Date.now() - t0 > budgetMs) throw new Stopped();
      if (!getState().stopping) setState({ message: tr('scan.listingN', { n }) });
      FG.update(fgTitle(), tr('scan.listingN', { n }));
    }, {
      resume: from,
      dirs,
      onWave: async (files, state) => {
        await DB.upsertListed(files.map(({ thumb, ...f }) => f), first);
        await setMetaFor(LIST_RESUME, folderId, JSON.stringify(state));
      },
    });
    try {
      listed = await list(resume);
    } catch (e) {
      // 接著看失敗（例如隔太久，Google 的分頁記號過期了）：從頭看一次
      if (e instanceof Stopped || e instanceof Drive.NeedSignIn || !resume) throw e;
      await setMetaFor(LIST_RESUME, folderId, '');
      dirs.clear();
      dirsComplete = true;
      listed = await list(null);
    }
    await setMetaFor(LIST_RESUME, folderId, '');
    await setMetaFor(LIST_KEY, folderId, String(Date.now()));
    if (dirsComplete) await saveMap(folderId, dirs);
    // 第一次完整看完這個資料夾：之後才出現的檔案，就是老師新上傳的
    if (first) await DB.setListedOnce(folderId);
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
  }
  return listed;
}

/**
 * 多久之內看過資料夾就不用再看一次（資料夾有幾千個檔案時，光是看一遍就要好幾分鐘）：
 * 接著上次被關掉的整理 → 24 小時；在 App 裡再按一次 → 15 分鐘；背景自動 → 1 小時。
 */
const LIST_FRESH_MS = { resume: 24 * 3600e3, manual: 15 * 60e3, background: 3600e3 };

export async function runScan(mode: 'manual' | 'background', budgetMs = Infinity, opts: { resume?: boolean } = {}): Promise<ScanResult> {
  if (busy()) return { scanned: 0, saved: 0, review: 0, errors: 0, stopped: true, busy: true };
  const started = DB.now(), t0 = Date.now();
  cancel = false;
  hardCancel = false;
  // 記下「整理到一半」：App 被關掉的話，下次打開會接著做（已經看過的照片不會重看）
  if (mode === 'manual') await DB.setMeta(PENDING, '1').catch(() => {});
  setState({ running: true, stopping: false, phase: 'list', done: 0, total: 0, found: 0, eta: '', message: tr('scan.listing'), lastError: null });
  if (mode === 'manual') {
    await activateKeepAwakeAsync('scan').catch(() => {});
    // Android：通知列顯示進度，App 切到背景或螢幕關掉也繼續整理
    FG.start(fgTitle(), tr('scan.listing'));
  }
  let scanned = 0, errors = 0, review = 0;
  const savedIds: string[] = [];
  try {
    const s = await DB.getSettings();
    if (!DB.foldersOf(s).length) throw new Error(tr('err.noFolder'));
    if (!modelReady()) {
      setState({ phase: 'model', message: tr('scan.downloadingModel') });
      await downloadModel((p) => setState({ modelProgress: p }));
    }
    let listed: Drive.ListedFile[] = [];
    const folders = DB.foldersOf(s);
    // 每個老師的資料夾分開看（兄弟姊妹不同班）
    for (const folder of folders) {
      if (cancel) break;
      listed = listed.concat(await listOne(folder, mode, opts, s.videos, t0, budgetMs));
    }
    const thumbs = new Map(listed.map((f) => [f.id, f.thumb]));
    // 老師剛上傳的照片先看（以前的照片還沒看完也一樣）
    const todo = cancel ? [] : await DB.filesToScan(s.videos);
    // 老師剛上傳的有幾張（排在最前面）
    const freshCount = todo.filter((f) => DB.isFresh(f.first_seen)).length;
    let notified = 0; // savedIds 裡前面幾張已經通知過了
    // 畫面顯示整體進度（之前看過的也算進去），App 重開後數字會接著跑
    const before = await DB.scanProgress(s.videos);
    const base = before.all - todo.length;
    setState({ phase: 'scan', total: before.all, done: base, found: before.withFaces, message: todo.length ? tr('scan.finding') : tr('scan.noNew') });
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
    let lastSaveAt = Date.now();
    let tFirst = 0; // 第一張看完的時間（第一張含啟動辨識引擎，不拿來估時間）
    for (let i = 0; i < todo.length; i++) {
      if (cancel || Date.now() - t0 > budgetMs) break;
      const f = todo[i];
      // 自動檢查的時間快到了：影片要整個下載，先留到下次（系統只給 10 分鐘，超過的話下一次自動檢查會排不上）
      if (mode === 'background' && f.kind === 'video' && Date.now() - t0 > budgetMs - 120e3) break;
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
      // 邊找邊收：每看 40 張（而且離上次至少 1 分鐘），就先判斷一次、把確定的照片存進相簿，
      // 不用等幾千張全部看完才看到成果
      if ((i + 1) % 40 === 0 && Date.now() - lastSaveAt > 60e3 && i + 1 < todo.length && !cancel) {
        lastSaveAt = Date.now();
        try {
          const d = await judge();
          savedIds.push(...await saveMatches(d));
          await refreshCounts();
          bump();
        } catch (e) {
          if (e instanceof Drive.NeedSignIn) throw e; // 其他錯誤（例如還沒允許存照片）先略過，最後會再存一次
        }
      }
      // 自動檢查：老師剛上傳的照片看完了，先存好、通知家長，再繼續整理以前的照片
      if (mode === 'background' && freshCount > 0 && i + 1 === freshCount && i + 1 < todo.length && !cancel) {
        lastSaveAt = Date.now();
        try {
          const d = await judge();
          savedIds.push(...await saveMatches(d));
          const pendingReview = [...d.values()].filter((x) => x.kind === 'review').length;
          await Notices.afterBackground(savedIds.slice(notified), { pendingLeft: todo.length - i - 1, review: pendingReview })
            .catch((e) => console.warn('notice failed', e));
          notified = savedIds.length;
        } catch (e) {
          if (e instanceof Drive.NeedSignIn) throw e;
        }
      }
      const left = todo.length - i - 1;
      const eta = i >= 2 && left > 0 ? fmtEta(((Date.now() - tFirst) / 1000 / i) * left) : '';
      setState({ done: base + i + 1, found: before.withFaces + found, eta });
      FG.update(fgTitle(), tr('scan.fgProgress', { done: base + i + 1, total: before.all, found: before.withFaces + found, eta }), base + i + 1, before.all);
    }
    // 自動檢查沒有新照片、也沒有還沒存的照片：不用重新判斷（每 15～60 分鐘一次，省電）
    const idle = mode === 'background' && scanned === 0 && errors === 0 && (await DB.unsavedMatches()) === 0;
    let matched = 0;
    if (!idle) {
      setState({ phase: 'decide', message: tr('scan.deciding') });
      const decisions = await judge();
      review = [...decisions.values()].filter((d) => d.kind === 'review').length;
      matched = [...decisions.values()].filter((d) => d.kind === 'match').length;
      setState({ phase: 'save', message: tr('scan.saving') });
      FG.update(fgTitle(), tr('scan.fgSaving'), 0, 0, true);
      // 背景：時間到了就先停，剩下的下次再存（系統給的時間有限）
      savedIds.push(...await saveMatches(decisions, (i, n) => {
        setState({ message: tr('scan.savingN', { i: i + 1, n }) });
        FG.update(fgTitle(), tr('scan.savingN', { i: i + 1, n }), i + 1, n);
      }, mode === 'background' ? t0 + budgetMs + 60e3 : Infinity));
    }
    const saved = savedIds.length;
    const stopped = cancel || Date.now() - t0 > budgetMs;
    const leftN = await DB.pendingCount(s.videos).catch(() => 0);
    // note 存代號（執行紀錄畫面再依語言顯示）；自動檢查什麼都沒找到時不記，紀錄才不會被洗版
    if (mode === 'manual' || scanned || saved || errors) {
      await DB.addRun({ started, mode, scanned, matched, review, saved, errors, note: stopped ? 'stopped' : '', left: leftN });
    }
    if (mode === 'background') {
      if (idle) review = (await DB.counts()).review;
      await Notices.afterBackground(savedIds.slice(notified), { pendingLeft: leftN, review }).catch((e) => console.warn('notice failed', e));
    } else {
      await Notices.afterManual({ saved, review, scanned, stopped }).catch(() => {});
    }
    await DB.setMeta('last_scan', DB.now());
    return { scanned, saved, review, errors, stopped, left: leftN, idle };
  } catch (e: any) {
    setState({ lastError: String(e?.message || e) });
    throw e;
  } finally {
    if (mode === 'manual') {
      FG.stop();
      deactivateKeepAwake('scan');
      await DB.setMeta(PENDING, '').catch(() => {}); // 正常結束、按停止、出錯都算結束；只有 App 被關掉才會留著
    }
    setState({ running: false, stopping: false, phase: 'done', message: '' });
    await refreshCounts();
    bump();
    if (applyAfterScan) { applyAfterScan = false; scheduleApply(); }
  }
}
