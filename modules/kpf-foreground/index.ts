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
  // 新照片通知（舊版 App 沒有這些）
  openNotificationSettings?(): boolean;
  compose?(o: ComposeOptions): Promise<string>;
  setPhotoChannel?(name: string, description: string): boolean;
  notify?(o: NoticeOptions): boolean;
  cancelNotice?(id: number): boolean;
  canNotify?(): boolean;
  photoChannelBlocked?(): boolean;
  share?(o: ShareOptions): boolean;
  isInstalled?(pkg: string): boolean;
};

/** 合成通知用的照片：sources 一張一張橫著排，每張以孩子的臉為中心裁切 */
export type ComposeOptions = {
  /** 照片位置：content:// 或 file:// 網址 */
  sources: string[];
  /** 每張照片 4 個數字：臉的 x, y, 寬, 高（0～1，相對於照片）；沒有臉填 -1 */
  boxes: number[];
  width: number;
  height: number;
  /** 臉大約佔照片高度的 1/faceScale */
  faceScale?: number;
  /** 存成哪個檔案（file:// 網址或路徑） */
  out: string;
};

export type NoticeOptions = {
  id: number;
  channelName: string;
  channelDescription: string;
  title: string;
  body: string;
  /** 展開時的大照片（compose 回傳的路徑） */
  image?: string | null;
  /** 右邊的小方形照片 */
  icon?: string | null;
  /** 點通知時打開的網址（kidphotofinder://…） */
  url: string;
  actionTitles: string[];
  actionUrls: string[];
  /** 有填的話，手機上鎖時只顯示這個標題（不顯示照片） */
  publicTitle?: string | null;
  publicBody?: string | null;
};

export type ShareOptions = {
  /** 手機相簿裡照片的 content:// 網址 */
  uris: string[];
  /** 直接交給哪個 App（例如 LINE 的 jp.naver.line.android）；不填就讓家長自己選 */
  pkg?: string | null;
  title?: string | null;
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

// ---------- 新照片通知（Android） ----------

/** 這支手機能不能發「大張照片」的通知（舊版 App、iOS、網頁不行，改用一般通知） */
export const richSupported = () => !!(native?.notify && native?.compose);

/** 合成通知用的照片，回傳檔案路徑；失敗回傳 null */
export async function compose(o: ComposeOptions): Promise<string | null> {
  if (!native?.compose) return null;
  try {
    return await native.compose({ faceScale: 2.8, ...o });
  } catch {
    return null;
  }
}

/** 「新照片」通知分類（名字跟著 App 的語言） */
export function setPhotoChannel(name: string, description: string) {
  try { native?.setPhotoChannel?.(name, description); } catch {}
}

/** 發出新照片通知；送不出去（例如家長關掉通知）回傳 false */
export function notify(o: NoticeOptions): boolean {
  if (!native?.notify) return false;
  try { return native.notify(o); } catch { return false; }
}

/** 收掉一則通知 */
export function cancelNotice(id: number) {
  try { native?.cancelNotice?.(id); } catch {}
}

/** 系統有沒有允許這個 App 發通知；不知道時回傳 null */
export function canNotify(): boolean | null {
  if (!native?.canNotify) return null;
  try { return native.canNotify(); } catch { return null; }
}

/** 「新照片」通知分類有沒有被家長在系統設定裡關掉 */
export function photoChannelBlocked(): boolean {
  try { return !!native?.photoChannelBlocked?.(); } catch { return false; }
}

/** 打開這個 App 的系統通知設定；不支援時回傳 false */
export function openNotificationSettings(): boolean {
  try { return !!native?.openNotificationSettings?.(); } catch { return false; }
}

/** 分享手機相簿裡的照片（pkg 有填就直接交給那個 App）；不支援或失敗回傳 false */
export function share(o: ShareOptions): boolean {
  if (!native?.share || !o.uris.length) return false;
  try { return native.share(o); } catch { return false; }
}

/** 手機有沒有裝某個 App */
export function isInstalled(pkg: string): boolean {
  try { return !!native?.isInstalled?.(pkg); } catch { return false; }
}
