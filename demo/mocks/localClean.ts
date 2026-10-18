/* 網頁體驗版：假裝整理 LINE 相簿 */
import { setState } from '../../src/services/state';
const BASE = process.env.EXPO_PUBLIC_BASE_URL || '';
export const LOCAL_PREFIX = 'local:';
export const isLocal = (id: string) => id.startsWith(LOCAL_PREFIX);
export type PhoneAlbum = { id: string; title: string; count: number; isLine: boolean };
export type CleanPlan = { albumTitle: string; scanned: number; kept: number; review: number; remove: { fileId: string; name: string }[] };
export async function phoneAlbums(): Promise<PhoneAlbum[]> {
  return [{ id: 'line', title: 'LINE', count: 214, isLine: true }, { id: 'cam', title: 'Camera', count: 3820, isLine: false }, { id: 'dl', title: 'Download', count: 57, isLine: false }];
}
const DEMO = ['p02', 'p06', 'p09', 'p01', 'p08', 'p11', 'p03', 'p12', 'p00', 'p05', 'p07', 'p10'];
export function localUri(id: string) { return Promise.resolve(`${BASE}/demo/${id.slice(LOCAL_PREFIX.length).split('_')[0]}.jpg`); }
let stop = false;
export const stopClean = () => { stop = true; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function scanAlbum(): Promise<CleanPlan> {
  stop = false;
  setState({ running: true, phase: 'list', message: '正在看「LINE」…' }); await wait(800);
  for (let i = 0; i <= 36 && !stop; i += 2) { setState({ phase: 'scan', done: i, total: 36, found: Math.floor(i * 0.6) }); await wait(90); }
  setState({ phase: 'save', message: '正在收進相簿…' }); await wait(900);
  setState({ running: false, phase: 'idle' });
  return { albumTitle: 'LINE', scanned: 36, kept: 9, review: 3, remove: DEMO.map((p, i) => ({ fileId: `${LOCAL_PREFIX}${p}_${i}`, name: `line_${i}.jpg` })) };
}
export async function deleteLocal(ids: string[]) { await wait(500); return ids.length; }
export async function lastCleanTime() { return null; }
export async function copyLocalToAlbum() { return { id: 'x' } as any; }
