/**
 * 星空的鏡頭：整個世界只用一個變換 —— 螢幕位置 = 世界座標 × s + (tx, ty)。
 * 最小縮放一定蓋滿整個畫面（不會露出空白邊），拖曳也不能拖出世界外面。
 * 這些函式在畫面執行緒（手勢）和一般程式裡都能用。
 */
import { WORLD_H, WORLD_W } from './constellations';

export type Cam = { s: number; tx: number; ty: number };

export function minScale(vw: number, vh: number): number {
  'worklet';
  return Math.max(vw / WORLD_W, vh / WORLD_H, 0.05);
}

export function maxScale(vw: number, vh: number): number {
  'worklet';
  return Math.min(3.2, Math.max(minScale(vw, vh) * 4, 2.2));
}

/** 世界比畫面大時，不能拖到露出外面 */
export function clampT(t: number, s: number, view: number, world: number): number {
  'worklet';
  const c = world * s;
  if (c <= view) return (view - c) / 2;
  return Math.min(0, Math.max(view - c, t));
}

export function clampCam(c: Cam, vw: number, vh: number): Cam {
  'worklet';
  const s = Math.min(maxScale(vw, vh), Math.max(minScale(vw, vh), c.s));
  return { s, tx: clampT(c.tx, s, vw, WORLD_W), ty: clampT(c.ty, s, vh, WORLD_H) };
}

/** 把世界上的 (x, y) 放到畫面的 (vw × fx, vh × fy) */
export function focusCam(x: number, y: number, s: number, vw: number, vh: number, fx = 0.5, fy = 0.4): Cam {
  'worklet';
  return clampCam({ s, tx: vw * fx - x * s, ty: vh * fy - y * s }, vw, vh);
}

/** 一開始的樣子：蓋滿畫面、左右置中、從上面開始（看得到標題） */
export function homeCam(vw: number, vh: number): Cam {
  'worklet';
  const s = minScale(vw, vh);
  return clampCam({ s, tx: (vw - WORLD_W * s) / 2, ty: 0 }, vw, vh);
}

/** 以畫面上的 (ax, ay) 為中心縮放 */
export function zoomAt(c: Cam, ns: number, ax: number, ay: number, vw: number, vh: number): Cam {
  'worklet';
  const s = Math.min(maxScale(vw, vh), Math.max(minScale(vw, vh), ns));
  const k = s / c.s;
  return clampCam({ s, tx: ax - (ax - c.tx) * k, ty: ay - (ay - c.ty) * k }, vw, vh);
}

/** 三次貝茲曲線上的點和方向（流星） */
export function bezier(p: number[], t: number): { x: number; y: number; a: number } {
  'worklet';
  const u = 1 - t;
  const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
  const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
  const dx = 3 * u * u * (p[2] - p[0]) + 6 * u * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]);
  const dy = 3 * u * u * (p[3] - p[1]) + 6 * u * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5]);
  return { x, y, a: Math.atan2(dy, dx) };
}
