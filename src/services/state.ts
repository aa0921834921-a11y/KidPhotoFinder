/** 很小的全域狀態：掃描進度、數字，畫面用 useApp() 訂閱。 */
import { useSyncExternalStore } from 'react';

export type Phase = 'idle' | 'model' | 'list' | 'scan' | 'decide' | 'save' | 'done';

export type AppState = {
  running: boolean;
  stopping: boolean; // 按了停止、正在收尾
  applying: boolean; // 家長按了是／不是，正在（或等一下就要）重新判斷
  phase: Phase;
  done: number;
  total: number;
  found: number;
  eta: string;
  message: string;
  modelProgress: number;
  counts: { match: number; review: number; saved: number; files: number; pending: number; savedToday: number };
  lastError: string | null;
  version: number; // 資料有變時 +1，讓畫面重新讀取
  runSince: number; // 整理中最後一次有動靜的時間（卡住太久就當作已經結束）
};

let state: AppState = {
  running: false, stopping: false, applying: false, phase: 'idle', done: 0, total: 0, found: 0, eta: '', message: '', modelProgress: 0,
  counts: { match: 0, review: 0, saved: 0, files: 0, pending: 0, savedToday: 0 }, lastError: null, version: 0, runSince: 0,
};
const listeners = new Set<() => void>();

export const getState = () => state;
export function setState(p: Partial<AppState>) {
  // 整理中每次更新進度都記一下時間：超過 30 分鐘完全沒動靜，才當作卡住
  if (p.running === true || (state.running && p.running !== false)) p = { ...p, runSince: Date.now() };
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export const bump = () => setState({ version: state.version + 1 });

export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => sel(state),
  );
}

/** 正在整理嗎？（整理卡住、30 分鐘都沒有動靜，就當作已經結束，不擋住之後的自動檢查） */
export function busy(): boolean {
  return state.running && Date.now() - state.runSince < 30 * 60e3;
}
