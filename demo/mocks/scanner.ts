/* 網頁體驗版：假裝在找照片，讓你看整個流程 */
import { Alert } from 'react-native';
import { setState } from '../../src/services/state';
import * as DB from './db';
let stop = false;
export const requestStop = () => { stop = true; setState({ message: '正在停止…' }); };
export async function refreshCounts() { setState({ counts: await DB.counts() }); }
export function scheduleApply() { refreshCounts(); }
export async function removeReference(id: string) { await DB.deleteRef(id); }
export async function addReferencePhotos(uris: string[]) { DB.addDemoRefs(uris); await refreshCounts(); return { ok: uris.length, noface: 0 }; }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ran = false;
export async function runScan() {
  stop = false;
  setState({ running: true, phase: 'list', done: 0, total: 0, found: 0, message: '老師的資料夾裡有 1,284 個檔案，新的有 48 張' });
  await wait(1500);
  for (let i = 0; i <= 48 && !stop; i += 2) {
    setState({ phase: 'scan', done: i, total: 48, found: Math.floor(i * 0.35), eta: `約 ${Math.ceil((48 - i) / 10)} 秒` });
    await wait(110);
  }
  setState({ phase: 'decide', message: '比對寶貝的參考照片…' }); await wait(1200);
  setState({ phase: 'save', message: '存進「幼稚園照片」相簿' }); await wait(1200);
  const n = ran ? 0 : 3;
  if (n) DB.addSaved(['p00', 'p02', 'p09'].slice(0, n));
  ran = true;
  setState({ running: false, phase: 'idle' });
  await refreshCounts();
  setState({ version: Math.random() * 1e9 | 0 });
  if (!n) Alert.alert('體驗版', '示範照片都找過了。');
  return { scanned: 48, saved: n, review: 0, errors: 0, stopped: stop };
}
