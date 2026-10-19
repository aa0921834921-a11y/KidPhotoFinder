/** 很小的全域狀態：掃描進度、數字，畫面用 useApp() 訂閱。 */
import { useSyncExternalStore } from 'react';

export type Phase = 'idle' | 'model' | 'list' | 'scan' | 'decide' | 'save' | 'done';

export type AppState = {
  running: boolean;
  stopping: boolean; // 按了停止、正在收尾
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
};

let state: AppState = {
  running: false, stopping: false, phase: 'idle', done: 0, total: 0, found: 0, eta: '', message: '', modelProgress: 0,
  counts: { match: 0, review: 0, saved: 0, files: 0, pending: 0, savedToday: 0 }, lastError: null, version: 0,
};
const listeners = new Set<() => void>();

export const getState = () => state;
export function setState(p: Partial<AppState>) {
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
