/* 網頁體驗版：假裝在找照片，讓你看整個流程 */
import { Alert } from 'react-native';
import { setState } from '../../src/services/state';
import { tr } from '../../src/i18n';
import * as DB from './db';
let stop = false;
export const requestStop = (_hard = false) => { if (stop) return; stop = true; setState({ stopping: true, message: tr('scan.stoppingMsg') }); };
export async function interruptedScan() { return false; }
export async function refreshCounts() { setState({ counts: await DB.counts() }); }
export function scheduleApply() { refreshCounts(); }
export async function removeReference(id: string) { await DB.deleteRef(id); }
export async function addReferencePhotos(uris: string[]) { DB.addDemoRefs(uris); await refreshCounts(); return { ok: uris.length, noface: 0 }; }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ran = false;
export async function runScan() {
  stop = false;
  setState({ stopping: false, running: true, phase: 'list', done: 0, total: 0, found: 0, message: tr('scan.listingN', { n: 1284 }) });
  await wait(1500);
  for (let i = 0; i <= 48 && !stop; i += 2) {
    setState({ phase: 'scan', done: i, total: 48, found: Math.floor(i * 0.35), eta: tr('eta.soon') });
    await wait(110);
  }
  setState({ phase: 'decide', message: tr('scan.deciding') }); await wait(1200);
  setState({ phase: 'save', message: tr('scan.saving') }); await wait(1200);
  const n = ran ? 0 : 3;
  if (n) DB.addSaved(['p00', 'p02', 'p09'].slice(0, n));
  ran = true;
  setState({ running: false, stopping: false, phase: 'idle' });
  await refreshCounts();
  setState({ version: Math.random() * 1e9 | 0 });
  if (!n) Alert.alert(tr('demo.title'), tr('demo.allFound'));
  return { scanned: 48, saved: n, review: 0, errors: 0, stopped: stop };
}
