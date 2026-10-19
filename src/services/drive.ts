/**
 * Google 雲端硬碟：登入、選資料夾、列出照片、下載。
 * 找臉時只下載 2048 像素的縮圖（省流量、快很多）；確定是自己小孩的，才下載原始照片存進相簿。
 */
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as FG from '../../modules/kpf-foreground';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|3gp)$/i;

let configured = false;
function configure() {
  if (configured) return;
  const extra = (Constants.expoConfig?.extra || {}) as { iosClientId?: string; webClientId?: string };
  // google-config.json 還是範例文字時不要傳（傳錯的 ID 會讓 Android 登入直接失敗）
  const ok = (id?: string) => (id && /^[\w-]+\.apps\.googleusercontent\.com$/.test(id) ? id : undefined);
  GoogleSignin.configure({ scopes: [SCOPE], iosClientId: ok(extra.iosClientId), webClientId: ok(extra.webClientId), offlineAccess: false });
  configured = true;
}

export type Account = { email: string; name: string | null; photo: string | null };

export async function signIn(): Promise<Account | null> {
  configure();
  const r: any = await GoogleSignin.signIn();
  if (r.type !== 'success') return null;
  const u = r.data.user;
  if (!(r.data.scopes || []).includes(SCOPE)) await GoogleSignin.addScopes({ scopes: [SCOPE] });
  return { email: u.email, name: u.name, photo: u.photo };
}

export async function restore(): Promise<Account | null> {
  configure();
  try {
    if (!GoogleSignin.hasPreviousSignIn()) return null;
    const r: any = await GoogleSignin.signInSilently();
    if (r.type !== 'success') return null;
    const u = r.data.user;
    return { email: u.email, name: u.name, photo: u.photo };
  } catch {
    return null;
  }
}

export async function signOut() {
  configure();
  cached = null;
  await GoogleSignin.signOut();
}

// Google 登入套件同一時間只能有一個 getTokens 在跑（同時呼叫會出現「previous promise did not settle」）。
// 這裡讓同時要 token 的請求共用同一次呼叫，並把拿到的 token 暫存 40 分鐘（Google 的 token 約 1 小時過期）。
let cached: { value: string; at: number } | null = null;
let inflight: Promise<string> | null = null;
const TOKEN_TTL = 40 * 60 * 1000;

async function fetchToken(): Promise<string> {
  configure();
  try {
    return (await GoogleSignin.getTokens()).accessToken;
  } catch {
    const r: any = await GoogleSignin.signInSilently();
    if (r.type !== 'success') throw new NeedSignIn();
    return (await GoogleSignin.getTokens()).accessToken;
  }
}

async function token(): Promise<string> {
  if (cached && Date.now() - cached.at < TOKEN_TTL) return cached.value;
  if (!inflight) {
    inflight = fetchToken()
      .then((value) => { cached = { value, at: Date.now() }; return value; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** token 被 Google 拒絕（401）時：丟掉暫存，讓下一次重新拿。 */
async function dropToken(bad: string) {
  if (cached?.value === bad) cached = null;
  await GoogleSignin.clearCachedAccessToken(bad).catch(() => {});
}

export class NeedSignIn extends Error {
  constructor() { super('請重新登入 Google 帳號'); }
}

async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...params });
  for (let attempt = 0; ; attempt++) {
    const t = await token();
    const r = await fetch(`${API}${path}?${qs}`, { headers: { Authorization: `Bearer ${t}` } });
    if (r.ok) return r.json();
    if (r.status === 401 && attempt === 0) { await dropToken(t); continue; }
    // 背景時 setTimeout 會暫停，改用原生的等待
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await FG.sleep(800 * 2 ** attempt); continue; }
    if (r.status === 401) throw new NeedSignIn();
    throw new Error(`Google 雲端硬碟回應錯誤（${r.status}）`);
  }
}

type DriveFile = {
  id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; md5Checksum?: string;
  thumbnailLink?: string; shortcutDetails?: { targetId: string; targetMimeType: string };
};

async function listAll(q: string, fields: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = '';
  do {
    const r = await api<{ files: DriveFile[]; nextPageToken?: string }>('/files', {
      q, fields: `nextPageToken, files(${fields})`, pageSize: '1000', ...(pageToken ? { pageToken } : {}),
    });
    out.push(...r.files);
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return out;
}

export type FolderChoice = { id: string; name: string; where: string };

/** 可以選的資料夾：「與我共用」的、和「我的雲端硬碟」第一層的（包含捷徑）。 */
export async function candidateFolders(): Promise<FolderChoice[]> {
  const f = 'id, name, mimeType, shortcutDetails';
  const [shared, mine] = await Promise.all([
    listAll(`sharedWithMe = true and trashed = false and (mimeType = '${FOLDER}' or mimeType = '${SHORTCUT}')`, f),
    listAll(`'root' in parents and trashed = false and (mimeType = '${FOLDER}' or mimeType = '${SHORTCUT}')`, f),
  ]);
  const pick = (x: DriveFile, where: string): FolderChoice | null => {
    if (x.mimeType === FOLDER) return { id: x.id, name: x.name, where };
    if (x.shortcutDetails?.targetMimeType === FOLDER) return { id: x.shortcutDetails.targetId, name: x.name, where };
    return null;
  };
  const seen = new Set<string>(), out: FolderChoice[] = [];
  for (const [list, where] of [[shared, '與我共用'], [mine, '我的雲端硬碟']] as const) {
    for (const x of list) {
      const c = pick(x, where);
      if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
}

export type ListedFile = {
  id: string; name: string; folder: string; mime: string; size: number; modified: string; md5: string | null;
  kind: 'image' | 'video'; thumb: string | null;
};

/** 看資料夾看到一半的進度（存起來，App 被關掉後可以接著看） */
export type ListState = { queue: { id: string; path: string; page?: string }[]; seen: string[]; count: number };

/**
 * 列出資料夾（含所有子資料夾）裡的照片和影片。
 * 一次同時看 4 個資料夾、每個資料夾一次看一頁（最多 1000 個檔案）；每看完一批就呼叫 onWave，
 * 讓呼叫的人把這批檔案和目前進度存起來。傳入 resume 就從上次停下的地方接著看。
 */
export async function listFolder(rootId: string, rootName: string, onProgress?: (n: number) => void,
  opts: { resume?: ListState | null; onWave?: (files: ListedFile[], state: ListState) => Promise<void> } = {}): Promise<ListedFile[]> {
  const fields = 'id, name, mimeType, size, modifiedTime, md5Checksum, thumbnailLink, shortcutDetails';
  const queue: ListState['queue'] = opts.resume ? [...opts.resume.queue] : [{ id: rootId, path: rootName }];
  const seen = new Set<string>(opts.resume ? opts.resume.seen : [rootId]);
  let count = opts.resume?.count || 0;
  const out: ListedFile[] = [];
  while (queue.length) {
    const wave = queue.splice(0, 4);
    const pages = await Promise.all(wave.map((q) => api<{ files: DriveFile[]; nextPageToken?: string }>('/files', {
      q: `'${q.id}' in parents and trashed = false`, fields: `nextPageToken, files(${fields})`, pageSize: '1000',
      ...(q.page ? { pageToken: q.page } : {}),
    })));
    const batch: ListedFile[] = [];
    const more: ListState['queue'] = [];
    for (let w = 0; w < wave.length; w++) {
      const { id, path } = wave[w];
      if (pages[w].nextPageToken) more.push({ id, path, page: pages[w].nextPageToken });
      for (const it of pages[w].files) {
        const isFolder = it.mimeType === FOLDER || it.shortcutDetails?.targetMimeType === FOLDER;
        if (isFolder) {
          const tid = it.mimeType === FOLDER ? it.id : it.shortcutDetails!.targetId;
          if (!seen.has(tid)) { seen.add(tid); queue.push({ id: tid, path: `${path}/${it.name}` }); }
          continue;
        }
        const image = it.mimeType.startsWith('image/') || IMAGE_EXT.test(it.name);
        const video = it.mimeType.startsWith('video/') || VIDEO_EXT.test(it.name);
        if (!image && !video) continue;
        batch.push({
          id: it.id, name: it.name, folder: path, mime: it.mimeType, size: Number(it.size || 0),
          modified: it.modifiedTime || '', md5: it.md5Checksum || null, kind: image ? 'image' : 'video',
          thumb: it.thumbnailLink || null,
        });
      }
    }
    queue.unshift(...more); // 同一個資料夾還有下一頁的，先接著看完
    out.push(...batch);
    count += batch.length;
    await opts.onWave?.(batch, { queue: [...queue], seen: [...seen], count });
    onProgress?.(count);
  }
  return out;
}

/* ---------------------------------------------------------------- 下載 */

const cacheDir = (name: string) => {
  const d = new Directory(Paths.cache, name);
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

async function download(url: string, dst: File, auth: boolean): Promise<File> {
  if (dst.exists) dst.delete();
  return File.downloadFileAsync(url, dst, { idempotent: true, headers: auth ? { Authorization: `Bearer ${await token()}` } : {} });
}

/** 找臉用的 2048 像素縮圖（有快取）。縮圖拿不到時改下載原檔。 */
export async function fetchForScan(f: { id: string; name: string; thumb?: string | null; kind: string }, size = 2048,
  dir = 'scan'): Promise<string> {
  const dst = new File(cacheDir(dir), `${f.id}_${size}.jpg`);
  if (dst.exists && (dst.size || 0) > 0) return dst.uri;
  let thumb = f.thumb;
  if (!thumb) thumb = (await api<{ thumbnailLink?: string }>(`/files/${f.id}`, { fields: 'thumbnailLink' })).thumbnailLink || null;
  if (thumb) {
    const big = thumb.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${size}`);
    try { return (await download(big, dst, true)).uri; } catch {}
    try { return (await download(big, dst, false)).uri; } catch {}
  }
  if (f.kind !== 'image') throw new Error('沒有縮圖');
  return downloadOriginal(f.id, f.name);
}

/** 畫面顯示用的縮圖（有快取，關掉 App 也保留，直到系統清快取）。 */
const previewJobs = new Map<string, Promise<string>>();
export function previewUri(id: string, size = 1024): Promise<string> {
  if (id.startsWith('local:')) return require('./localClean').localUri(id); // 手機相簿裡的照片
  const key = `${id}_${size}`;
  if (!previewJobs.has(key)) {
    const job = fetchForScan({ id, name: id, kind: 'image' }, size, 'preview');
    job.catch(() => previewJobs.delete(key));
    previewJobs.set(key, job);
  }
  return previewJobs.get(key)!;
}

export function dropScanFile(id: string, size = 2048) {
  const f = new File(Paths.cache, 'scan', `${id}_${size}.jpg`);
  try { if (f.exists) f.delete(); } catch {}
}

/** 下載原始檔案（存進相簿用）。 */
export async function downloadOriginal(id: string, name: string): Promise<string> {
  const safe = name.replace(/[\\/:*?"<>|]/g, '_');
  const dst = new File(cacheDir('orig'), `${id}_${safe}`);
  return (await download(`${API}/files/${id}?alt=media&supportsAllDrives=true`, dst, true)).uri;
}

export function clearScanCache() {
  for (const n of ['scan', 'orig']) {
    const d = new Directory(Paths.cache, n);
    if (d.exists) d.delete();
  }
}
