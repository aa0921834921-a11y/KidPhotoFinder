/**
 * 整理照片時的「前景服務」（只有 Android）：
 * 通知列常駐一行進度，App 切到背景、螢幕關掉也會繼續整理。
 * iOS、網頁沒有這個功能，這裡的函式都不做事，也不會出錯。
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type Native = {
  start(title: string, text: string): boolean;
  update(title: string, text: string, progress: number, max: number): boolean;
  stop(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  openAppSettings(): boolean;
  sleep(ms: number): Promise<void>;
  setChannel?(name: string, description: string): boolean; // 舊版 App 沒有這個
};

const native: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('KpfForeground') : null;

/** 這支手機能不能用前景服務 */
export const supported = () => !!native;

let on = false;
let lastAt = 0;
let lastText = '';

export function start(title: string, text: string) {
  if (!native) return false;
  try { on = native.start(title, text); } catch { on = false; }
  lastAt = 0; lastText = '';
  return on;
}

/** 更新通知列進度（最多一秒更新一次，避免太耗電） */
export function update(title: string, text: string, progress = 0, max = 0, force = false) {
  if (!native || !on) return;
  const now = Date.now();
  if (!force && (now - lastAt < 1000 || text === lastText)) return;
  lastAt = now; lastText = text;
  try { native.update(title, text, Math.round(progress), Math.round(max)); } catch {}
}

export function stop() {
  if (!native) return;
  on = false;
  try { native.stop(); } catch {}
}

/** 是不是已經設成「不限制電池用量」；不支援的平台回傳 true（不用提醒） */
export function batteryUnrestricted(): boolean {
  if (!native) return true;
  try { return native.isIgnoringBatteryOptimizations(); } catch { return true; }
}

/** 通知分類的名字和說明（跟著 App 的語言；手機「設定 → 通知」裡看得到） */
export function setChannel(name: string, description: string) {
  try { native?.setChannel?.(name, description); } catch {}
}

/** 打開 App 的系統設定頁，讓家長把電池改成「不限制」 */
export function openAppSettings() {
  try { native?.openAppSettings(); } catch {}
}

/** 等一下（背景時也會準時回來；不支援的平台改用 setTimeout） */
export function sleep(ms: number): Promise<void> {
  if (native) return native.sleep(Math.round(ms)).catch(() => new Promise((ok) => setTimeout(ok, ms)));
  return new Promise((ok) => setTimeout(ok, ms));
}
