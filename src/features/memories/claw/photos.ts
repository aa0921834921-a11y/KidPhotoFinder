/**
 * 時光娃娃機的照片：從「已經存進相簿」的回憶裡挑 13 張，做成小圖（data URL）放進水晶球。
 * - 每個回憶先挑一張（孩子的臉最清楚的封面），回憶不夠就從同一個回憶再多挑幾張
 * - 日期最早的那個回憶標成「很久沒看的回憶」（球的花紋不一樣）
 * - 示範：用示範照片（畫面上會標「示範資料」），正式模式絕不混進示範照片
 * 遊戲在 WebView 裡，照片要用 data URL 傳進去（WebGL 不能直接讀手機相簿的 content:// 圖）。
 */
import { Asset } from 'expo-asset';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as TM from '../../../core/timeMachine';
import { getLang } from '../../../i18n';
import type * as DB from '../../../services/db';
import { previewUri } from '../../../services/drive';
import { demoImage, type Memory, type MemoryData } from '../data';

/** 傳給遊戲的一張照片 */
export type ClawPic = { id: string; mem: string; img: string; title: string; date: string; fx?: number; fy?: number; rare?: boolean };

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 活動名稱前面的日期數字拿掉（「1018 運動會」→「運動會」） */
export function niceTitle(t: string): string {
  const s = t.replace(/^\s*\d{3,8}[\s._\-－・]*/, '').trim();
  return s || t;
}

/** 收藏券上的日期：資料夾有寫日期才顯示，沒有就寫班級／上一層資料夾 */
export function dateLine(m: Memory): string {
  return m.trusted ? TM.fmtDay(m.day, getLang() as TM.TMLang) : m.parent || '';
}

/** 挑照片：每個回憶一張，不夠再從同一個回憶多挑 */
export function pickPhotos(data: MemoryData, n = 13): { m: Memory; id: string }[] {
  const items = shuffle(data.items.filter((m) => m.cover));
  const out: { m: Memory; id: string }[] = [];
  const used = new Set<string>();
  for (const m of items) {
    if (out.length >= n) break;
    out.push({ m, id: m.cover! }); used.add(m.cover!);
  }
  for (let round = 0; out.length < n && round < 8; round++) {
    let added = false;
    for (const m of items) {
      if (out.length >= n) break;
      const left = m.photos.filter((p) => p.kind !== 'video' && !used.has(p.id));
      if (!left.length) continue;
      const p = left[Math.floor(Math.random() * left.length)];
      out.push({ m, id: p.id }); used.add(p.id); added = true;
    }
    if (!added) break;
  }
  return out;
}

/** 照片的位置：示範圖、Android 相簿裡的那張、或雲端硬碟的縮圖（有快取） */
async function sourceUri(m: Memory, id: string, info?: DB.PhotoInfo): Promise<string | null> {
  const demo = demoImage(m, id);
  if (demo != null) {
    const a = Asset.fromModule(demo);
    await a.downloadAsync();
    return a.localUri || a.uri;
  }
  if (info && Platform.OS === 'android' && info.asset_id?.startsWith('content://')) return info.asset_id;
  return previewUri(id, 512).catch(() => null);
}

/** 縮成小圖（最長邊 side 像素）→ data URL */
export async function smallDataUrl(uri: string, side: number): Promise<string> {
  const first = await ImageManipulator.manipulate(uri).renderAsync();
  let ref = first;
  if (Math.max(first.width, first.height) > side) {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize(first.width >= first.height ? { width: side } : { height: side });
    ref = await ctx.renderAsync();
  }
  const r = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
  return `data:image/jpeg;base64,${r.base64}`;
}

/** 一次做幾張（同時做太多手機會卡） */
async function pool<T>(n: number, jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
  }));
  return out;
}

/** 把挑好的照片做成遊戲要的樣子（做不出來的跳過） */
export async function makePics(data: MemoryData, picked: { m: Memory; id: string }[]): Promise<ClawPic[]> {
  // 日期最早的回憶（資料夾有寫日期的才算）
  let oldest: Memory | null = null;
  for (const { m } of picked) if (m.trusted && (!oldest || m.day < oldest.day)) oldest = m;
  const rareMem = picked.length >= 6 && oldest ? oldest.id : null;
  const done = new Set<string>();
  const list = await pool(3, picked.map(({ m, id }) => async (): Promise<ClawPic | null> => {
    try {
      const info = data.info.get(id);
      const uri = await sourceUri(m, id, info);
      if (!uri) return null;
      const img = await smallDataUrl(uri, 512);
      const face = info && info.fx != null && info.fy != null && info.fw && info.fh && info.w && info.h
        ? { fx: (info.fx + info.fw / 2) / info.w, fy: (info.fy + info.fh * 0.5) / info.h } : {};
      const rare = rareMem === m.id && !done.has(m.id);
      done.add(m.id);
      return { id, mem: m.id, img, title: niceTitle(m.title), date: dateLine(m), rare, ...face };
    } catch {
      return null;
    }
  }));
  return list.filter((x): x is ClawPic => !!x);
}

/** 收藏冊用的小圖（同一張只做一次） */
const thumbs = new Map<string, Promise<string | null>>();
export function thumbOf(data: MemoryData, m: Memory, id: string): Promise<string | null> {
  const key = `${m.demo ? 'demo' : 'real'}:${id}`;
  if (!thumbs.has(key)) {
    thumbs.set(key, (async () => {
      try {
        const uri = await sourceUri(m, id, data.info.get(id));
        return uri ? await smallDataUrl(uri, 240) : null;
      } catch { return null; }
    })());
  }
  return thumbs.get(key)!;
}
