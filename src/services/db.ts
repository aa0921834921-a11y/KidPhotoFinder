/**
 * 手機上的資料庫（SQLite）。跟電腦版一樣：每張照片的臉只算一次，特徵用 float16 存起來，
 * 之後家長按「是／不是」或調準確度時，只要重新判斷，不用重新下載或找臉。
 */
import * as SQLite from 'expo-sqlite';
import { fromFloat16, toFloat16 } from '../core/face';

let dbp: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS files(
  id TEXT PRIMARY KEY, name TEXT, folder TEXT, mime TEXT, size INTEGER, modified TEXT, md5 TEXT,
  kind TEXT, status TEXT, nfaces INTEGER, scanned_at TEXT, seen_at TEXT, w INTEGER, h INTEGER);
CREATE INDEX IF NOT EXISTS files_status ON files(status);
CREATE TABLE IF NOT EXISTS faces(
  id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT, frame REAL, x REAL, y REAL, w REAL, h REAL, emb BLOB);
CREATE INDEX IF NOT EXISTS faces_file ON faces(file_id);
CREATE TABLE IF NOT EXISTS labels(face_id INTEGER PRIMARY KEY, label INTEGER, emb BLOB, at TEXT);
CREATE TABLE IF NOT EXISTS decisions(file_id TEXT PRIMARY KEY, kind TEXT, score REAL, face_id INTEGER);
CREATE TABLE IF NOT EXISTS saved(file_id TEXT PRIMARY KEY, asset_id TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS refs(id TEXT PRIMARY KEY, uri TEXT, status TEXT, chosen INTEGER, added_at TEXT);
CREATE TABLE IF NOT EXISTS ref_faces(ref_id TEXT, idx INTEGER, size REAL, emb BLOB, PRIMARY KEY(ref_id, idx));
CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY AUTOINCREMENT, started TEXT, finished TEXT, mode TEXT,
  scanned INTEGER, matched INTEGER, review INTEGER, saved INTEGER, errors INTEGER, note TEXT);
`;

export function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbp) {
    dbp = (async () => {
      const d = await SQLite.openDatabaseAsync('kidphoto.db');
      await d.execAsync(SCHEMA);
      // 手機相簿（LINE 下載）的照片記住是哪個相簿來的
      await d.execAsync('ALTER TABLE files ADD COLUMN src_album TEXT').catch(() => {});
      // 第一次看到這個檔案的時間：用來分辨「老師剛上傳的」和「以前就有的」照片
      await d.execAsync('ALTER TABLE files ADD COLUMN first_seen TEXT').catch(() => {});
      return d;
    })();
  }
  return dbp;
}

/** 手機時間，資料庫裡的寫法：「2026-10-20 10:41:05」 */
export const localTime = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
export const now = () => localTime(new Date());
/** 把資料庫裡的時間轉回來（手機時間） */
export const parseLocal = (t: string) => new Date(t.replace(' ', 'T'));

export const embToBlob = (v: Float32Array) => new Uint8Array(toFloat16(v).buffer);
export const blobToEmb = (b: Uint8Array) => {
  const copy = new Uint8Array(b); // 確保對齊
  return fromFloat16(new Uint16Array(copy.buffer, 0, copy.byteLength / 2));
};

/* ---------------------------------------------------------------- 設定 */

export type Settings = {
  folderId: string | null;
  folderName: string | null;
  strictness: 'loose' | 'standard' | 'strict';
  /** 自動找新照片（在背景定時看老師的資料夾） */
  autoDaily: boolean;
  videos: boolean;
  wifiOnly: boolean;
  albumName: string;
  /** 老師上傳了有孩子的新照片時通知我 */
  notify: boolean;
  onboarded: boolean;
  /** 通知裡顯示照片 */
  notifyPhoto: boolean;
  /** 鎖定畫面上隱藏照片（只顯示「有新照片」） */
  lockHide: boolean;
  /** 只在白天通知：dayFrom 點到 dayTo 點以外找到的照片，早上一次告訴你 */
  quiet: boolean;
  dayFrom: number;
  dayTo: number;
  /** 多久看一次老師的資料夾（分鐘） */
  freq: 15 | 30 | 60;
  /** 孩子的小名（通知裡用；空的就寫「孩子」） */
  childName: string;
};

export const DEFAULT_SETTINGS: Settings = {
  folderId: null, folderName: null, strictness: 'standard', autoDaily: true, videos: false,
  wifiOnly: true, albumName: '童年拾光', notify: true, onboarded: false,
  notifyPhoto: true, lockHide: false, quiet: true, dayFrom: 7, dayTo: 21, freq: 30, childName: '',
};

export async function getSettings(): Promise<Settings> {
  const d = await db();
  const r = await d.getFirstAsync<{ v: string }>('SELECT v FROM meta WHERE k = ?', 'settings');
  return { ...DEFAULT_SETTINGS, ...(r ? JSON.parse(r.v) : {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = { ...(await getSettings()), ...patch };
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO meta(k, v) VALUES (?, ?)', 'settings', JSON.stringify(s));
  return s;
}

export async function getMeta(k: string): Promise<string | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ v: string }>('SELECT v FROM meta WHERE k = ?', k);
  return r ? r.v : null;
}

export async function setMeta(k: string, v: string): Promise<void> {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO meta(k, v) VALUES (?, ?)', k, v);
}

/* ---------------------------------------------------------------- 照片與臉 */

export type FileRow = {
  id: string; name: string; folder: string; mime: string; size: number; modified: string; md5: string | null;
  kind: 'image' | 'video'; status: 'new' | 'done' | 'bad'; nfaces: number | null; w: number | null; h: number | null;
  /** 第一次看到這個檔案的時間（舊資料是 null） */
  first_seen?: string | null;
};

export async function upsertListed(files: Omit<FileRow, 'status' | 'nfaces' | 'w' | 'h' | 'first_seen'>[]): Promise<number> {
  const d = await db();
  const t = now();
  let fresh = 0;
  await d.withTransactionAsync(async () => {
    for (const f of files) {
      const old = await d.getFirstAsync<{ md5: string | null; size: number; status: string }>(
        'SELECT md5, size, status FROM files WHERE id = ?', f.id);
      if (!old) {
        fresh++;
        await d.runAsync('INSERT INTO files(id, name, folder, mime, size, modified, md5, kind, status, seen_at, first_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          f.id, f.name, f.folder, f.mime, f.size, f.modified, f.md5, f.kind, 'new', t, t);
      } else {
        const changed = (f.md5 && old.md5 && f.md5 !== old.md5) || (!f.md5 && f.size !== old.size);
        await d.runAsync('UPDATE files SET name = ?, folder = ?, seen_at = ?' + (changed ? ", status = 'new', md5 = ?, size = ?" : '') + ' WHERE id = ?',
          ...(changed ? [f.name, f.folder, t, f.md5, f.size, f.id] : [f.name, f.folder, t, f.id]));
        if (changed) { fresh++; await d.runAsync('DELETE FROM faces WHERE file_id = ?', f.id); }
      }
    }
  });
  return fresh;
}

/** 整體進度：老師資料夾裡一共幾張、已經看過幾張、其中幾張有臉（App 重開後畫面接著算，不會從 0 開始） */
export async function scanProgress(includeVideos: boolean): Promise<{ all: number; done: number; withFaces: number }> {
  const d = await db();
  const r = await d.getFirstAsync<{ all: number; done: number; withFaces: number }>(
    `SELECT COUNT(*) AS "all", SUM(CASE WHEN status != 'new' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN status = 'done' AND nfaces > 0 THEN 1 ELSE 0 END) AS withFaces
     FROM files WHERE id NOT LIKE 'local:%' ${includeVideos ? '' : "AND kind = 'image'"}`);
  return { all: r?.all || 0, done: r?.done || 0, withFaces: r?.withFaces || 0 };
}

/**
 * 還沒看過的照片。freshAfter：這個時間之後才第一次看到的（老師剛上傳的）排在最前面，
 * 以前的照片還沒看完時，新照片也能馬上找到、馬上通知。
 */
export async function filesToScan(includeVideos: boolean, freshAfter: string | null = null): Promise<FileRow[]> {
  const d = await db();
  const where = `status = 'new' AND id NOT LIKE 'local:%' ${includeVideos ? '' : "AND kind = 'image'"}`;
  if (!freshAfter) return d.getAllAsync<FileRow>(`SELECT * FROM files WHERE ${where} ORDER BY modified DESC`);
  return d.getAllAsync<FileRow>(
    `SELECT * FROM files WHERE ${where} ORDER BY CASE WHEN first_seen > ? THEN 0 ELSE 1 END, modified DESC`, freshAfter);
}

export async function saveScan(fileId: string, faces: { frame: number; box: number[]; emb: Float32Array }[], w: number, h: number) {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM faces WHERE file_id = ?', fileId);
    for (const f of faces) {
      await d.runAsync('INSERT INTO faces(file_id, frame, x, y, w, h, emb) VALUES (?,?,?,?,?,?,?)',
        fileId, f.frame, f.box[0], f.box[1], f.box[2], f.box[3], embToBlob(f.emb));
    }
    await d.runAsync("UPDATE files SET status = 'done', nfaces = ?, scanned_at = ?, w = ?, h = ? WHERE id = ?",
      faces.length, now(), w, h, fileId);
  });
}

export async function markBad(fileId: string) {
  const d = await db();
  await d.runAsync("UPDATE files SET status = 'bad', scanned_at = ? WHERE id = ?", now(), fileId);
}

export async function loadFaces() {
  const d = await db();
  const rows = await d.getAllAsync<{ id: number; file_id: string; frame: number; emb: Uint8Array }>(
    'SELECT id, file_id, frame, emb FROM faces');
  return rows.map((r) => ({ id: r.id, fileKey: r.file_id, frame: r.frame, emb: blobToEmb(r.emb) }));
}

export async function faceInfo(faceId: number) {
  const d = await db();
  return d.getFirstAsync<{ id: number; file_id: string; frame: number; x: number; y: number; w: number; h: number }>(
    'SELECT id, file_id, frame, x, y, w, h FROM faces WHERE id = ?', faceId);
}

export async function fileById(id: string) {
  const d = await db();
  return d.getFirstAsync<FileRow>('SELECT * FROM files WHERE id = ?', id);
}

/* ---------------------------------------------------------------- 家長的答案 */

export async function setLabel(faceId: number, label: 1 | -1 | 0) {
  const d = await db();
  if (!label) { await d.runAsync('DELETE FROM labels WHERE face_id = ?', faceId); return; }
  const f = await d.getFirstAsync<{ emb: Uint8Array }>('SELECT emb FROM faces WHERE id = ?', faceId);
  if (!f) return;
  await d.runAsync('INSERT OR REPLACE INTO labels(face_id, label, emb, at) VALUES (?,?,?,?)', faceId, label, f.emb, now());
}

export async function loadLabels() {
  const d = await db();
  const rows = await d.getAllAsync<{ face_id: number; label: number; emb: Uint8Array }>(
    'SELECT face_id, label, emb FROM labels ORDER BY at, face_id');
  return rows.map((r) => ({ faceId: r.face_id, label: (r.label > 0 ? 1 : -1) as 1 | -1, emb: blobToEmb(r.emb) }));
}

export async function undoLabelsSince(minutes: number, dry = false): Promise<number> {
  const d = await db();
  const since = new Date(Date.now() - minutes * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  const s = `${since.getFullYear()}-${p(since.getMonth() + 1)}-${p(since.getDate())} ${p(since.getHours())}:${p(since.getMinutes())}:${p(since.getSeconds())}`;
  const n = (await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM labels WHERE at >= ?', s))!.n;
  if (!dry) await d.runAsync('DELETE FROM labels WHERE at >= ?', s);
  return n;
}

export async function labeledList() {
  const d = await db();
  return d.getAllAsync<{ face_id: number; label: number; file_id: string; name: string; folder: string }>(
    `SELECT l.face_id, l.label, f.file_id, fl.name, fl.folder FROM labels l JOIN faces f ON f.id = l.face_id
     JOIN files fl ON fl.id = f.file_id ORDER BY l.at DESC LIMIT 400`);
}

/* ---------------------------------------------------------------- 判斷結果 */

export async function saveDecisions(dec: Map<string, { kind: string; score: number; faceId: number }>) {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM decisions');
    for (const [k, v] of dec) await d.runAsync('INSERT INTO decisions VALUES (?,?,?,?)', k, v.kind, v.score, v.faceId);
  });
}

export type ReviewItem = { fileId: string; faceId: number; score: number; name: string; folder: string; kind: string };

export async function decisionsList(kind: 'match' | 'review'): Promise<ReviewItem[]> {
  const d = await db();
  return d.getAllAsync<ReviewItem>(
    `SELECT d.file_id AS fileId, d.face_id AS faceId, d.score, f.name, f.folder, f.kind FROM decisions d
     JOIN files f ON f.id = d.file_id
     WHERE d.kind = ? AND d.face_id NOT IN (SELECT face_id FROM labels)
     ORDER BY d.score ${kind === 'review' ? 'DESC' : 'ASC'}`, kind);
}

export async function counts() {
  const d = await db();
  const one = async (q: string) => (await d.getFirstAsync<{ n: number }>(q))!.n;
  return {
    match: await one("SELECT COUNT(*) AS n FROM decisions WHERE kind = 'match'"),
    review: await one("SELECT COUNT(*) AS n FROM decisions d WHERE kind = 'review' AND face_id NOT IN (SELECT face_id FROM labels)"),
    saved: await one('SELECT COUNT(*) AS n FROM saved'),
    files: await one('SELECT COUNT(*) AS n FROM files'),
    pending: await one("SELECT COUNT(*) AS n FROM files WHERE status = 'new'"),
    savedToday: await one("SELECT COUNT(*) AS n FROM saved WHERE at >= date('now', 'localtime')"),
  };
}

/* ---------------------------------------------------------------- 存進相簿 */

export async function savedMap(): Promise<Map<string, string>> {
  const d = await db();
  const rows = await d.getAllAsync<{ file_id: string; asset_id: string }>('SELECT file_id, asset_id FROM saved');
  return new Map(rows.map((r) => [r.file_id, r.asset_id]));
}

export async function markSaved(fileId: string, assetId: string) {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO saved(file_id, asset_id, at) VALUES (?,?,?)', fileId, assetId, now());
}

export async function recentSaved(limit = 30) {
  const d = await db();
  return d.getAllAsync<{ file_id: string; asset_id: string; at: string; name: string; folder: string }>(
    `SELECT s.file_id, s.asset_id, s.at, f.name, f.folder FROM saved s JOIN files f ON f.id = s.file_id
     ORDER BY f.modified DESC LIMIT ?`, limit);
}

export async function savedByFolder() {
  const d = await db();
  return d.getAllAsync<{ file_id: string; asset_id: string; name: string; folder: string; modified: string; kind: string }>(
    `SELECT s.file_id, s.asset_id, f.name, f.folder, f.modified, f.kind FROM saved s JOIN files f ON f.id = s.file_id
     ORDER BY f.folder DESC, f.name`);
}

/* ---------------------------------------------------------------- 新照片通知 */

/**
 * 「從什麼時候開始算老師新上傳的」：第一次完整看完老師資料夾的時間（換資料夾就重新算）。
 * 在這之前就在資料夾裡的照片是「以前的照片」，慢慢整理、不一張一張通知。
 */
export async function getBaseline(folderId: string): Promise<string | null> {
  const v = (await getMeta('ntf_baseline').catch(() => null)) || '';
  const i = v.indexOf('|');
  return i > 0 && v.slice(0, i) === folderId ? v.slice(i + 1) : null;
}

export async function setBaseline(folderId: string, t: string) {
  await setMeta('ntf_baseline', `${folderId}|${t}`);
}

/** 這些照片裡，哪些是 after 之後才第一次看到的（老師剛上傳的） */
export async function freshAmong(ids: string[], after: string): Promise<Set<string>> {
  const d = await db();
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    const rows = await d.getAllAsync<{ id: string }>(
      `SELECT id FROM files WHERE first_seen > ? AND id IN (${part.map(() => '?').join(',')})`, after, ...part);
    for (const r of rows) out.add(r.id);
  }
  return out;
}

export type PhotoInfo = {
  file_id: string; asset_id: string; at: string; name: string; folder: string; kind: string; modified: string;
  first_seen: string | null; w: number | null; h: number | null;
  /** 孩子的臉（在照片裡的座標）；沒有的話是 null */
  fx: number | null; fy: number | null; fw: number | null; fh: number | null;
};

/** 存進相簿的照片的資料（含孩子的臉在哪裡），順序跟 ids 一樣 */
export async function photosInfo(ids: string[]): Promise<PhotoInfo[]> {
  const d = await db();
  const out: PhotoInfo[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    out.push(...await d.getAllAsync<PhotoInfo>(
      `SELECT s.file_id, s.asset_id, s.at, f.name, f.folder, f.kind, f.modified, f.first_seen, f.w, f.h,
              fa.x AS fx, fa.y AS fy, fa.w AS fw, fa.h AS fh
       FROM saved s JOIN files f ON f.id = s.file_id
       LEFT JOIN decisions dc ON dc.file_id = s.file_id
       LEFT JOIN faces fa ON fa.id = dc.face_id
       WHERE s.file_id IN (${part.map(() => '?').join(',')})`, ...part));
  }
  const pos = new Map(ids.map((id, k) => [id, k]));
  return out.sort((a, b) => (pos.get(a.file_id) ?? 0) - (pos.get(b.file_id) ?? 0));
}

/** 這些資料夾裡，since 之後老師上傳了幾張（照片＋影片），和最後一張是什麼時候看到的 */
export async function uploadedSince(folders: string[], since: string): Promise<{ folder: string; n: number; last: string }[]> {
  if (!folders.length) return [];
  const d = await db();
  return d.getAllAsync<{ folder: string; n: number; last: string }>(
    `SELECT folder, COUNT(*) AS n, MAX(first_seen) AS last FROM files
     WHERE first_seen >= ? AND id NOT LIKE 'local:%' AND folder IN (${folders.map(() => '?').join(',')})
     GROUP BY folder`, since, ...folders);
}

/** 確定是孩子、但還沒存進相簿的照片有幾張 */
export async function unsavedMatches(): Promise<number> {
  const d = await db();
  const r = await d.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM decisions WHERE kind = 'match' AND file_id NOT IN (SELECT file_id FROM saved)");
  return r?.n || 0;
}

/** 還有幾張照片沒看過 */
export async function pendingCount(includeVideos: boolean): Promise<number> {
  const d = await db();
  const r = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM files WHERE status = 'new' AND id NOT LIKE 'local:%' ${includeVideos ? '' : "AND kind = 'image'"}`);
  return r?.n || 0;
}

/* ---------------------------------------------------------------- 參考照片 */

export async function listRefs() {
  const d = await db();
  const refs = await d.getAllAsync<{ id: string; uri: string; status: string; chosen: number | null }>(
    'SELECT id, uri, status, chosen FROM refs ORDER BY added_at');
  const faces = await d.getAllAsync<{ ref_id: string; idx: number; size: number; emb: Uint8Array }>(
    'SELECT ref_id, idx, size, emb FROM ref_faces ORDER BY ref_id, idx');
  return refs.map((r) => ({ ...r, faces: faces.filter((f) => f.ref_id === r.id).map((f) => ({ size: f.size, emb: blobToEmb(f.emb) })) }));
}

export async function addRef(id: string, uri: string, faces: { size: number; emb: Float32Array }[]) {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('INSERT OR REPLACE INTO refs(id, uri, status, chosen, added_at) VALUES (?,?,?,?,?)', id, uri, 'ok', null, now());
    await d.runAsync('DELETE FROM ref_faces WHERE ref_id = ?', id);
    for (let i = 0; i < faces.length; i++) {
      await d.runAsync('INSERT INTO ref_faces VALUES (?,?,?,?)', id, i, faces[i].size, embToBlob(faces[i].emb));
    }
  });
}

export async function setRefStatus(id: string, status: string, chosen: number | null) {
  const d = await db();
  await d.runAsync('UPDATE refs SET status = ?, chosen = ? WHERE id = ?', status, chosen, id);
}

export async function deleteRef(id: string) {
  const d = await db();
  await d.runAsync('DELETE FROM refs WHERE id = ?', id);
  await d.runAsync('DELETE FROM ref_faces WHERE ref_id = ?', id);
}

/* ---------------------------------------------------------------- 紀錄 */

export async function addRun(r: { started: string; mode: string; scanned: number; matched: number; review: number; saved: number; errors: number; note: string }) {
  const d = await db();
  await d.runAsync('INSERT INTO runs(started, finished, mode, scanned, matched, review, saved, errors, note) VALUES (?,?,?,?,?,?,?,?,?)',
    r.started, now(), r.mode, r.scanned, r.matched, r.review, r.saved, r.errors, r.note);
}

export async function lastRuns(limit = 30) {
  const d = await db();
  return d.getAllAsync<{ finished: string; mode: string; scanned: number; matched: number; review: number; saved: number; errors: number; note: string }>(
    'SELECT finished, mode, scanned, matched, review, saved, errors, note FROM runs ORDER BY id DESC LIMIT ?', limit);
}

export async function resetAll() {
  const d = await db();
  await d.execAsync('DELETE FROM files; DELETE FROM faces; DELETE FROM labels; DELETE FROM decisions; DELETE FROM saved; DELETE FROM runs;');
  // 看資料夾的進度、「從什麼時候開始算新照片」也一起重來（不然重新看到的舊照片會被當成新上傳的）
  await d.execAsync("DELETE FROM meta WHERE k IN ('last_list', 'list_resume', 'folder_map', 'quick_at', 'ntf_baseline', 'ntf_batch', 'backlog_saved')");
}

/* ---------------------------------------------------------------- 手機相簿（LINE 下載）的照片 */

export async function localFileIds(): Promise<Set<string>> {
  const d = await db();
  const rows = await d.getAllAsync<{ id: string }>("SELECT id FROM files WHERE id LIKE 'local:%'");
  return new Set(rows.map((r) => r.id));
}

export async function addLocalFile(id: string, name: string, albumTitle: string, createdMs: number, albumId: string) {
  const d = await db();
  const t = new Date(createdMs), p = (n: number) => String(n).padStart(2, '0');
  const modified = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
  await d.runAsync(
    'INSERT OR IGNORE INTO files(id, name, folder, mime, size, modified, md5, kind, status, seen_at, src_album) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, name, `手機相簿/${albumTitle}`, 'image/jpeg', 0, modified, null, 'image', 'new', now(), albumId);
}

export async function localFilesIn(albumId: string, sinceMs: number) {
  const d = await db();
  const t = new Date(sinceMs), p = (n: number) => String(n).padStart(2, '0');
  const since = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
  return d.getAllAsync<{ id: string; name: string; status: string }>(
    "SELECT id, name, status FROM files WHERE id LIKE 'local:%' AND src_album = ? AND modified >= ? ORDER BY modified", albumId, since);
}

/** 照片已經從手機刪掉：把它的紀錄也清掉 */
export async function forgetLocalFiles(ids: string[]) {
  const d = await db();
  await d.withTransactionAsync(async () => {
    for (const id of ids) {
      await d.runAsync('DELETE FROM labels WHERE face_id IN (SELECT id FROM faces WHERE file_id = ?)', id);
      await d.runAsync('DELETE FROM faces WHERE file_id = ?', id);
      await d.runAsync('DELETE FROM decisions WHERE file_id = ?', id);
      await d.runAsync('DELETE FROM files WHERE id = ?', id);
    }
  });
}
