const BASE = process.env.EXPO_PUBLIC_BASE_URL || '';
/* 預覽用的假資料（只在網頁預覽裡用） */
const q = new URLSearchParams((globalThis as any).location?.search || '');
const p = (n: number) => String(n).padStart(2, '0');
export const localTime = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
export const now = () => localTime(new Date());
export const parseLocal = (t: string) => new Date(t.replace(' ', 'T'));
export type Folder = { id: string; name: string };
export const foldersOf = (s: { folders?: Folder[]; folderId: string | null; folderName: string | null }): Folder[] =>
  s.folders?.length ? s.folders : s.folderId ? [{ id: s.folderId, name: s.folderName || '' }] : [];
export type Settings = {
  folderId: string | null; folderName: string | null; folders: Folder[]; strictness: 'loose' | 'standard' | 'strict'; autoDaily: boolean; videos: boolean; wifiOnly: boolean;
  albumName: string; notify: boolean; onboarded: boolean;
  notifyPhoto: boolean; lockHide: boolean; quiet: boolean; dayFrom: number; dayTo: number; freq: 15 | 30 | 60; childName: string;
};
export const DEFAULT_SETTINGS: Settings = {
  folderId: 'f', folderName: '115-1 健康班', folders: [{ id: 'f', name: '115-1 健康班' }, ...(q.get('sib') === '1' ? [{ id: 'g', name: '115-1 大象班' }] : [])], strictness: 'standard', autoDaily: true, videos: false, wifiOnly: true, albumName: '童年拾光', notify: true, onboarded: q.get('ob') !== '1',
  notifyPhoto: true, lockHide: q.get('lock') === '1', quiet: true, dayFrom: 7, dayTo: 21, freq: 30, childName: q.get('kid') ?? '小宇',
};
let settings = { ...DEFAULT_SETTINGS };
export async function getSettings() { return { ...settings }; }
export async function saveSettings(x: Partial<Settings>) {
  settings = { ...settings, ...x };
  if (x.folders) { settings.folderId = x.folders[0]?.id || null; settings.folderName = x.folders[0]?.name || null; }
  return { ...settings };
}
/* 兄弟姊妹（?sib=1 看兩個孩子的樣子） */
export type Kid = { key: string; name: string };
let KIDS: Kid[] = q.get('sib') === '1' ? [{ key: '', name: '哥哥' }, { key: 'k2', name: '妹妹' }] : [{ key: '', name: '' }];
export async function getKids() { return KIDS.map((k) => ({ ...k })); }
export async function addKid(name: string) { const k = { key: 'k' + Date.now(), name }; KIDS.push(k); return k; }
export async function renameKid(key: string, name: string) { KIDS = KIDS.map((k) => (k.key === key ? { ...k, name } : k)); }
export async function removeKid(key: string) { KIDS = KIDS.filter((k) => k.key !== key); REFS = REFS.filter((r) => r.person !== key); return []; }
const meta: Record<string, string> = { last_scan: '2026-10-18 08:12:00' };
if (q.get('theme')) meta.theme = q.get('theme')!;
if (q.get('lang')) meta.lang = q.get('lang')!; // 預覽用：?lang=en / id / vi / zh-Hans / zh-Hant
export async function getMeta(k: string) { return meta[k] ?? null; }
export async function setMeta(k: string, v: string) { meta[k] = v; }

const ROOT = '115-1 健康班/10月';
const G = ['1015 生日會', '1016 戶外教學', '1017 美勞課', '1018 今天'];
const today = now().slice(0, 10);
const empty = q.get('empty') === '1';
let SAVED: { id: string; g: number }[] = empty ? [] : [
  { id: 'p13', g: 2 }, { id: 'p12', g: 2 }, { id: 'p11', g: 2 }, { id: 'p10', g: 1 }, { id: 'p08', g: 1 }, { id: 'p07', g: 1 }, { id: 'p05', g: 1 },
  { id: 'p04', g: 0 }, { id: 'p03', g: 0 }, { id: 'p01', g: 0 },
];
const savedRow = (s: { id: string; g: number }, i: number) => ({
  file_id: s.id, asset_id: 'a' + s.id, at: i < 2 ? today + ' 08:12:00' : '2026-10-1' + (5 + s.g) + ' 21:00:00',
  name: `IMG_${4120 + i}.jpg`, folder: `${ROOT}/${G[s.g]}`, modified: '2026-10-1' + (5 + s.g), kind: 'photo',
});
export async function recentSaved(limit = 30) { return SAVED.slice(0, limit).map(savedRow); }
/** 時光機示範：以前的活動 */
const OLD: [string, string, string[]][] = empty ? [] : [
  ['114-1 健康班/12月/1224 聖誕活動', '2025-12-24 10:00:00', ['p03', 'p08', 'p11', 'p12']],
  ['114-1 健康班/10月/1023 慶生會', `${Number(today.slice(0, 4)) - 1}-${today.slice(5, 10)} 10:00:00`, ['p01', 'p05', 'p09']],
  ['114-2 健康班/5月/0505 運動會', '2026-05-05 10:00:00', ['p07', 'p10', 'p12', 'p13', 'p04']],
  ['113-2 小班/4月/0412 運動會', '2025-04-12 10:00:00', ['p02', 'p04']],
  ['114-2 健康班/7月/0718 玩水趣', '2026-07-18 10:00:00', ['p06', 'p09', 'p01']],
  ['114-1 健康班/11月/1120 戶外教學-動物園', '2025-11-20 10:00:00', ['p10', 'p02', 'p07']],
];
export async function savedByFolder() {
  const old = OLD.flatMap(([folder, modified, ids]) => ids.map((id, i) => ({ file_id: id, asset_id: 'a' + id, at: modified, name: `IMG_${i}.jpg`, folder, modified, kind: 'photo' })));
  return [...SAVED.map(savedRow), ...old].sort((a, b) => (a.folder < b.folder ? 1 : a.folder > b.folder ? -1 : 0));
}

const RV = empty ? [] : ['f03_1', 'f01_1', 'f05_1', 'f06_0', 'f10_0', 'f05_2', 'f12_1', 'f08_1', 'f02_0', 'f09_0', 'f06_1', 'f12_0'];
const SC = [0.47, 0.41, 0.46, 0.40, 0.45, 0.39, 0.44, 0.42, 0.38, 0.41, 0.39, 0.40];
const labels = new Map<number, { label: number; at: string }>();
export type ReviewItem = { fileId: string; faceId: number; score: number; name: string; folder: string; kind: string; person: string };
export async function decisionsList(kind: 'match' | 'review'): Promise<ReviewItem[]> {
  if (kind !== 'review') return [];
  return RV.map((f, i) => ({ fileId: 'p' + f.slice(1, 3), faceId: i + 1, score: SC[i], name: `IMG_${4200 + i}.jpg`, folder: `${ROOT}/${G[i % 4]}`, kind: 'photo', person: q.get('sib') === '1' && i % 3 === 2 ? 'k2' : '' }))
    .filter((x) => !labels.has(x.faceId)).sort((a, b) => b.score - a.score);
}
export async function labeledList() {
  return [...labels].map(([id, v]) => ({ face_id: id, label: v.label, person: '', file_id: 'x', name: 'x', folder: ROOT, at: v.at })).reverse();
}
export async function setLabel(faceId: number, label: 1 | -1 | 0, _person = '') { if (!label) labels.delete(faceId); else labels.set(faceId, { label, at: now() }); }
export async function undoLabelsSince(_m: number, dry = false) { const n = labels.size; if (!dry) labels.clear(); return n; }
export async function faceInfo(faceId: number) { const f = RV[faceId - 1]; return f ? { file_id: 'face_' + f, x: 50, y: 50, w: 140, h: 140 } : null; }
export async function fileById(id: string) {
  const face = id.startsWith('face_');
  return { id, name: 'IMG_4123.jpg', folder: `${ROOT}/${G[2]}`, w: face ? 240 : 480, h: face ? 240 : 480, status: 'done', nfaces: 1, kind: 'photo', modified: '' } as any;
}
export async function counts() {
  const review = (await decisionsList('review')).length;
  return { match: 0, review, saved: SAVED.length, files: 1284, pending: 0, savedToday: empty ? 0 : SAVED.filter((x) => x.g === 3).length + 2 };
}
let REFS = empty ? [] : [
  { id: 'r1', uri: BASE + '/demo/f00_0.jpg', status: 'ok' }, { id: 'r2', uri: BASE + '/demo/f04_0.jpg', status: 'ok' }, { id: 'r3', uri: BASE + '/demo/f07_0.jpg', status: 'ok' },
  { id: 'r4', uri: BASE + '/demo/f11_0.jpg', status: 'ok' }, { id: 'r5', uri: BASE + '/demo/f13_0.jpg', status: 'multi' }, { id: 'r6', uri: BASE + '/demo/f09_0.jpg', status: 'outlier' },
  ...(q.get('sib') === '1' ? [{ id: 's1', uri: BASE + '/demo/f02_0.jpg', status: 'ok', person: 'k2' }, { id: 's2', uri: BASE + '/demo/f06_0.jpg', status: 'ok', person: 'k2' }] : []),
].map((r: any) => ({ person: '', ...r })) as { id: string; uri: string; status: string; person: string }[];
export async function listRefs(person?: string) { return REFS.filter((r) => person === undefined || r.person === person).map((r) => ({ ...r, chosen: 0, faces: [] })); }
export async function deleteRef(id: string) { REFS = REFS.filter((r) => r.id !== id); }
export function addDemoRefs(uris: string[], person = '') { for (const u of uris) REFS.push({ id: 'u' + Date.now() + Math.random(), uri: u, status: 'ok', person }); }
export function addSaved(ids: string[]) { for (const id of ids) SAVED.unshift({ id, g: 3 }); }
export async function lastRunsAdd() {}
export type RunRow = { started: string; finished: string; mode: string; scanned: number; matched: number; review: number; saved: number; errors: number; note: string; left_n: number | null };
const ago = (min: number) => localTime(new Date(Date.now() - min * 60e3));
export async function lastRuns(): Promise<RunRow[]> {
  return [
    { started: ago(95), finished: ago(89), mode: 'background', scanned: 52, matched: 6, review: 3, saved: 6, errors: 0, note: '', left_n: 0 },
    { started: ago(400), finished: ago(394), mode: 'background', scanned: 31, matched: 4, review: 2, saved: 4, errors: 0, note: 'stopped', left_n: 120 },
    { started: ago(900), finished: ago(860), mode: 'manual', scanned: 166, matched: 20, review: 1, saved: 20, errors: 0, note: '', left_n: 151 },
  ];
}
export type BgResult = 'start' | 'idle' | 'scan' | 'off' | 'busy' | 'error';
export type BgEntry = { at: string; r: BgResult; n?: number; sec?: number };
export async function bgLog(): Promise<BgEntry[]> {
  if (q.get('stale') === '1') return [{ at: ago(600), r: 'idle', sec: 4 }];
  return [
    { at: ago(900), r: 'scan', n: 166 }, { at: ago(700), r: 'idle' }, { at: ago(640), r: 'start' }, { at: ago(560), r: 'idle' },
    { at: ago(400), r: 'scan', n: 31 }, { at: ago(340), r: 'idle' }, { at: ago(280), r: 'idle' }, { at: ago(220), r: 'error' },
    { at: ago(160), r: 'idle' }, { at: ago(95), r: 'scan', n: 52 }, { at: ago(40), r: 'idle', sec: 3 }, { at: ago(8), r: 'idle', sec: 2 },
  ];
}
export async function logBg(_e: BgEntry) {}
export async function resetAll() {}

/* ---------------------------------------------------------------- 新照片通知（示範：老師剛上傳的兩個活動） */
export type PhotoInfo = {
  file_id: string; asset_id: string; at: string; name: string; folder: string; kind: string; modified: string;
  first_seen: string | null; w: number | null; h: number | null; person: string | null; fx: number | null; fy: number | null; fw: number | null; fh: number | null;
};
// 示範照片裡孩子的臉大概在哪裡（480 x 480）
const FACE: Record<string, number[]> = { p03: [240, 180, 170, 140], p05: [150, 150, 180, 160], p08: [160, 120, 170, 150] };
export async function photosInfo(ids: string[]): Promise<PhotoInfo[]> {
  const rows = SAVED.map(savedRow);
  return ids.map((id) => rows.find((r) => r.file_id === id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => {
    const f = FACE[r.file_id];
    return { ...r, person: '', kind: 'image', first_seen: today + ' 10:31:00', w: 480, h: 480, fx: f ? f[0] : null, fy: f ? f[1] : null, fw: f ? f[2] : null, fh: f ? f[3] : null };
  });
}
export async function uploadedSince(folders: string[], _since: string) {
  return folders.map((f, i) => ({ folder: f, n: i ? 18 : 32, last: today + ' 10:31:00' }));
}

/* 核對 */
export type CheckFolder = { folder: string; total: number; saved: number; review: number; missed: number; last: string; checkedAt: string | null };
export type CheckPhoto = { fileId: string; kind: string; faces: number[]; person: string; faceId: number | null; assetId: string | null };
export async function checkFolders(): Promise<CheckFolder[]> {
  const g = new Map<string, number>();
  for (const r of SAVED.map(savedRow)) g.set(r.folder, (g.get(r.folder) || 0) + 1);
  return [...g].map(([folder, n], i) => ({ folder, total: n * 3 + 5, saved: n, review: i ? 0 : 2, missed: n + 4, last: `2026-10-${18 - i * 3}`, checkedAt: meta['checked@' + folder] || (i === 1 ? '2026-10-16' : null) }));
}
export async function checkFolder(folder: string) {
  const rows = SAVED.map(savedRow).filter((r) => r.folder === folder);
  const saved = rows.map((r) => ({ fileId: r.file_id, kind: 'photo', faces: [1], person: '', faceId: 1, assetId: r.asset_id }));
  const missed = SAVED.map(savedRow).slice(0, 7).map((r, i) => ({ fileId: r.file_id, kind: 'photo', faces: i % 3 ? [1] : [1, 2, 3], person: '', faceId: null, assetId: null }));
  return { saved, missed };
}
export async function setChecked(folder: string) { meta['checked@' + folder] = now(); }
export async function unsave(_ids: string[]) {}
