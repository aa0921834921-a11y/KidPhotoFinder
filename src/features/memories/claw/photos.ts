/**
 * 時光娃娃機的照片：從「已經存進相簿」的回憶裡挑 13 張，做成小圖（data URL）放進水晶球。
 * - 每個回憶先挑一張（孩子的臉最清楚的封面），回憶不夠就從同一個回憶再多挑幾張
 * - 日期最早的那個回憶標成「很久沒看的回憶」（球的花紋不一樣）
 * - 示範：用示範照片（畫面上會標「示範資料」），正式模式絕不混進示範照片
 * 遊戲在 WebView 裡，照片要用 data URL 傳進去（WebGL 不能直接讀手機相簿的 content:// 圖）。
 * 小圖是讀照片時就縮小（不讀整張原圖），一張讀太久就跳過，做好的會留著下次用。
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

/**
 * 縮成小圖（最長邊不超過 side 像素）→ data URL。
 * 讀照片的時候就直接縮小（maxWidth/maxHeight），不會把一千多萬像素的原圖整張讀進記憶體：
 * 以前是整張讀兩次再縮，13 張要等很久，現在每張只要一下下。
 */
export async function smallDataUrl(uri: string, side: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri, { maxWidth: side, maxHeight: side });
  try {
    const ref = await ctx.renderAsync();
    try {
      const r = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
      if (!r.base64) throw new Error('no image');
      return `data:image/jpeg;base64,${r.base64}`;
    } finally {
      ref.release(); // 用完馬上放掉，不等系統回收
    }
  } finally {
    ctx.release();
  }
}

/** 等太久就放棄（回傳 null），一張讀不到不會讓整台娃娃機卡住 */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((res) => {
    const t = setTimeout(() => res(null), ms);
    p.then((v) => { clearTimeout(t); res(v); }, () => { clearTimeout(t); res(null); });
  });
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

/** 做好的小圖先留著（這次打開 App 期間再玩就不用重做），最多留 60 張 */
const pics = new Map<string, Promise<string | null>>();
function smallPic(m: Memory, id: string, info: DB.PhotoInfo | undefined, side: number): Promise<string | null> {
  const key = `${m.demo ? 'demo' : 'real'}:${side}:${id}`;
  let job = pics.get(key);
  if (!job) {
    job = (async () => {
      const uri = await sourceUri(m, id, info);
      return uri ? await smallDataUrl(uri, side) : null;
    })().catch(() => null);
    pics.set(key, job);
    job.then((v) => { if (!v) pics.delete(key); });
    while (pics.size > 60) pics.delete(pics.keys().next().value!);
  }
  return job;
}

/** 把挑好的照片做成遊戲要的樣子（做不出來的跳過）；每做好一張就回報進度 */
export async function makePics(data: MemoryData, picked: { m: Memory; id: string }[],
  onProgress?: (done: number, total: number) => void): Promise<ClawPic[]> {
  // 日期最早的回憶（資料夾有寫日期的才算）
  let oldest: Memory | null = null;
  for (const { m } of picked) if (m.trusted && (!oldest || m.day < oldest.day)) oldest = m;
  const rareMem = picked.length >= 6 && oldest ? oldest.id : null;
  const rareDone = new Set<string>();
  let n = 0;
  onProgress?.(0, picked.length);
  const list = await pool(4, picked.map(({ m, id }) => async (): Promise<ClawPic | null> => {
    const info = data.info.get(id);
    const img = await within(smallPic(m, id, info, 512), 10000);
    onProgress?.(++n, picked.length);
    if (!img) return null;
    const face = info && info.fx != null && info.fy != null && info.fw && info.fh && info.w && info.h
      ? { fx: (info.fx + info.fw / 2) / info.w, fy: (info.fy + info.fh * 0.5) / info.h } : {};
    const rare = rareMem === m.id && !rareDone.has(m.id);
    rareDone.add(m.id);
    return { id, mem: m.id, img, title: niceTitle(m.title), date: dateLine(m), rare, ...face };
  }));
  return list.filter((x): x is ClawPic => !!x);
}

/** 收藏冊用的小圖（同一張只做一次） */
export function thumbOf(data: MemoryData, m: Memory, id: string): Promise<string | null> {
  return within(smallPic(m, id, data.info.get(id), 240), 10000);
}
