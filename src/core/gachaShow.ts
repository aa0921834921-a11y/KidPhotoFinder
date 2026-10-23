/**
 * 回憶扭蛋的整段動畫腳本（手機版、電腦版共用）：每個零件在什麼時間、到什麼位置。
 *
 * IDLE → TURNING(0) → MIXING(0.3s) → DROPPING(1.8s) → OPENING(2.7s) → REVEAL(3.4s) → COMPLETE(4.3s)
 *
 * 位置用「機器座標」（見 gachaArt.ts），時間用毫秒。玻璃罩裡的扭蛋怎麼滾由 gacha.ts 的物理算；
 * 這裡是其他部分：旋鈕、取物口、掉出來的那顆、打開、拍立得、光、粒子、結果卡。
 * 手機版把軌道轉成原生動畫；電腦版每一格用 sample() 取值。
 */
import { ART } from './gachaArt';

export type Ease = (u: number) => number;
export const EASE = {
  linear: (u: number) => u,
  inQuad: (u: number) => u * u,
  outQuad: (u: number) => 1 - (1 - u) * (1 - u),
  inCubic: (u: number) => u * u * u,
  outCubic: (u: number) => 1 - Math.pow(1 - u, 3),
  inOutCubic: (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  inOutSine: (u: number) => -(Math.cos(Math.PI * u) - 1) / 2,
  outBack: (u: number) => { const c = 1.6; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
};

/** [時間, 值, 從上一點到這一點的速度曲線] */
export type Key = [number, number, Ease?];
export type Track = Key[];

/** 某個時間點的值（電腦版用） */
export function sample(tr: Track, ms: number): number {
  if (!tr.length) return 0;
  if (ms <= tr[0][0]) return tr[0][1];
  for (let i = 1; i < tr.length; i++) {
    const [t1, v1, e] = tr[i];
    if (ms <= t1) {
      const [t0, v0] = tr[i - 1];
      const u = t1 > t0 ? (ms - t0) / (t1 - t0) : 1;
      return v0 + (v1 - v0) * (e || EASE.linear)(u);
    }
  }
  return tr[tr.length - 1][1];
}

/** 轉成密集的折線（手機版：原生端只做線性內插，速度曲線先算進去） */
export function dense(tr: Track, step = 1000 / 60): { t: number[]; v: number[] } {
  const t: number[] = [], v: number[] = [];
  const push = (a: number, b: number) => {
    if (t.length && a <= t[t.length - 1]) a = t[t.length - 1] + 0.01;
    t.push(a); v.push(b);
  };
  tr.forEach(([t1, v1, e], i) => {
    if (i && e && e !== EASE.linear) {
      const [t0, v0] = tr[i - 1];
      const n = Math.max(2, Math.ceil((t1 - t0) / step));
      for (let j = 1; j < n; j++) { const u = j / n; push(t0 + (t1 - t0) * u, v0 + (v1 - v0) * e(u)); }
    }
    push(t1, v1);
  });
  if (t.length === 1) { t.push(t[0] + 1); v.push(v[0]); }
  return { t, v };
}

/** 各階段開始的時間 */
export const PHASE = { TURNING: 0, MIXING: 300, DROPPING: 1800, OPENING: 2700, REVEAL: 3400, COMPLETE: 4300 } as const;
export type PhaseName = 'IDLE' | keyof typeof PHASE;
/** 減少動態時：旋鈕轉一下，照片直接出現 */
export const PHASE_REDUCED = { TURNING: 0, MIXING: 0, DROPPING: 0, OPENING: 0, REVEAL: 260, COMPLETE: 720 } as const;

/** 聲音、震動的時間 */
export const CUES: { at: number; sound?: 'turn' | 'land' | 'chime'; volume?: number; tap?: 'light' | 'soft' | 'success' }[] = [
  { at: 40, sound: 'turn', volume: 0.5 },
  { at: 2470, sound: 'land', volume: 0.8, tap: 'light' },
  { at: 2610, sound: 'land', volume: 0.42 },
  { at: 2700, sound: 'land', volume: 0.18 },
  { at: 3140, tap: 'soft' },
  { at: 3390, sound: 'chime', volume: 0.42, tap: 'success' },
];

export interface ShowInput {
  /** 掉出來那顆扭蛋的半徑 */
  r: number;
  /** 拍立得最後停的位置（中心）和寬高（機器座標） */
  pol: { cx: number; cy: number; w: number; h: number };
  reduced?: boolean;
  /** 粒子的亂數（每次不一樣） */
  seed?: number;
}

export interface Show {
  tracks: Record<string, Track>;
  /** 粒子（星星、愛心）：每顆的軌道 */
  bits: { kind: 'star' | 'heart' | 'heart2'; size: number; x: Track; y: Track; s: Track; o: Track; r: Track }[];
  /** 打開的位置（光的中心） */
  spot: { x: number; y: number };
  end: number;
}

const E = EASE;
const hole = ART.hole;
/** 地面（蕾絲墊前面）：扭蛋落地時底部的位置 */
const GROUND = 2122;

export function choreography(p: ShowInput): Show {
  const { r, pol } = p;
  const spot = { x: pol.cx, y: pol.cy + pol.h * 0.36 };
  const k = ART.knob;
  const tracks: Record<string, Track> = {};
  const bits: Show['bits'] = [];
  if (p.reduced) {
    tracks.knobRot = [[0, 0], [260, 90, E.inOutCubic]];
    tracks.polO = [[260, 0], [520, 1, E.outCubic]];
    tracks.polS = [[260, 0.96], [520, 1, E.outCubic]];
    tracks.polX = [[0, pol.cx]]; tracks.polY = [[0, pol.cy]]; tracks.polR = [[0, -2]];
    tracks.dimO = [[260, 0], [560, 0.5]];
    tracks.cardO = [[380, 0], [720, 1]]; tracks.cardY = [[380, 16], [720, 0, E.outCubic]];
    return { tracks, bits, spot, end: PHASE_REDUCED.COMPLETE };
  }
  /* ---------- TURNING：旋鈕順時針轉一圈（先加速、再減速），金屬反光掃過，機身輕輕震 */
  tracks.knobRot = [[0, 0], [800, 360, E.inOutCubic]];
  tracks.glintX = [[60, -1.1], [720, 1.1, E.inOutSine]];
  tracks.glintO = [[60, 0], [200, 0.9], [600, 0.9], [740, 0]];
  const shake: Track = [[0, 0]];
  for (let t = 30, i = 0; t <= 900; t += 30, i++) shake.push([t, (i % 2 ? -1 : 1) * 1.8 * Math.max(0, 1 - t / 950)]);
  shake.push([930, 0]);
  tracks.shakeX = shake;
  // 旋鈕旁的弧形箭頭：跟著旋鈕的方向轉
  tracks.arrowsO = [[30, 0], [150, 1, E.outQuad], [620, 1], [860, 0, E.inQuad]];
  tracks.arrowsR = [[0, -25], [860, 95, E.inOutCubic]];
  /* ---------- MIXING：繞著玻璃罩的金色光帶（兩條，一前一後）、機器兩旁的動態線 */
  tracks.orbitAO = [[360, 0], [520, 0.95, E.outQuad], [1000, 0.85], [1300, 0, E.inQuad]];
  tracks.orbitAR = [[360, -16], [1300, 12, E.inOutSine]];
  tracks.orbitAS = [[360, 0.88], [1300, 1.06]];
  tracks.orbitBO = [[620, 0], [780, 0.9, E.outQuad], [1250, 0.7], [1550, 0, E.inQuad]];
  tracks.orbitBR = [[620, 14], [1550, -10, E.inOutSine]];
  tracks.orbitBS = [[620, 0.9], [1550, 1.04]];
  tracks.motionO = [[60, 0], [180, 0.9], [420, 0.5], [560, 0.95], [900, 0.6], [1200, 0.85], [1500, 0, E.inQuad]];
  tracks.motionS = [[60, 0.9], [300, 1.05], [540, 0.95], [780, 1.05], [1020, 0.95], [1260, 1.05], [1500, 1]];
  /* ---------- 取物口：先暗一下、再亮一下 */
  tracks.shadeO = [[1760, 0], [1900, 0.6, E.outQuad], [2010, 0.6], [2160, 0, E.inQuad]];
  tracks.holeGlowO = [[1930, 0], [2010, 0.75, E.outQuad], [2230, 0, E.inQuad]];
  /* ---------- 扭蛋從取物口出來、往前掉、彈兩下、滾一下停住 */
  const hx = hole.x + hole.w / 2, hy = hole.y + hole.h / 2;
  const land = GROUND - r;
  tracks.capX = [[1990, hx - 10], [2140, hx], [2260, hx + 40, E.outQuad], [2470, hx + 160], [2610, hx + 220], [2700, hx + 250], [2790, hx + 268, E.outQuad],
    [3060, spot.x, E.inOutCubic]];
  tracks.capY = [[1990, hy - 18], [2140, hy + 2, E.outQuad], [2260, hy + 96, E.inQuad], [2470, land, E.inQuad], [2540, land - 72, E.outQuad], [2610, land, E.inQuad],
    [2655, land - 20, E.outQuad], [2700, land, E.inQuad], [2790, land], [3060, spot.y, E.inOutCubic]];
  tracks.capS = [[1990, 0.56], [2140, 0.68, E.outQuad], [2260, 1, E.outQuad], [2790, 1], [3060, 1.35, E.inOutCubic]];
  tracks.capSY = [[2462, 1], [2478, 0.9], [2520, 1.03], [2550, 1], [2606, 1], [2618, 0.95], [2650, 1]];
  tracks.capR = [[1990, 0], [2140, 30], [2260, 90], [2470, 220], [2610, 300], [2700, 345], [2790, 362, E.outQuad], [3060, 362],
    [3078, 355], [3096, 369], [3114, 358], [3130, 362]];
  tracks.inO = [[1990, 0], [2060, 1, E.outQuad], [2139, 1], [2140, 0]];
  tracks.inDark = [[1990, 0.65], [2130, 0]];
  tracks.outO = [[2139, 0], [2140, 1], [3119, 1], [3120, 0]];
  tracks.openO = [[3119, 0], [3120, 1]];
  // 地上的影子：扭蛋離地越高越淡、越小
  tracks.shX = tracks.capX.filter(([t]) => t <= 2790);
  tracks.shO = [[2250, 0], [2470, 0.5, E.inQuad], [2540, 0.3], [2610, 0.5], [2655, 0.42], [2700, 0.5], [2790, 0.5], [2900, 0, E.outQuad]];
  tracks.shS = [[2250, 0.5], [2470, 1, E.inQuad], [2540, 0.8], [2610, 1], [2790, 1], [2900, 1.2]];
  /* ---------- OPENING：沿著接縫打開：上半往上、往旁邊；下半稍微往下；中間冒出金色的光 */
  const D = 2 * r * 1.35;
  tracks.upDX = [[3130, 0], [3420, -0.5 * D, E.outCubic], [3720, -pol.w * 0.4, E.inOutCubic]];
  tracks.upDY = [[3130, 0], [3420, -0.42 * D, E.outCubic], [3720, pol.h * 0.12, E.inOutCubic]];
  tracks.upR = [[3130, 0], [3420, -34, E.outCubic], [3720, -18, E.inOutCubic]];
  tracks.loDX = [[3130, 0], [3420, 0.2 * D, E.outCubic], [3720, pol.w * 0.4, E.inOutCubic]];
  tracks.loDY = [[3130, 0], [3420, 0.14 * D, E.outCubic], [3720, pol.h * 0.16, E.inOutCubic]];
  tracks.loR = [[3130, 0], [3420, 14, E.outCubic], [3720, 6, E.inOutCubic]];
  tracks.glowO = [[3100, 0], [3220, 1, E.outQuad], [3700, 0.85], [4300, 0.45, E.inOutSine]];
  tracks.glowS = [[3100, 0.3], [3420, 1.5, E.outCubic], [3800, 2.3, E.outQuad], [4300, 2.5]];
  // 中間冒出來的金色光芒（慢慢轉）
  tracks.raysO = [[3090, 0], [3200, 0.95, E.outQuad], [3550, 0.75], [4100, 0.3], [4300, 0.25]];
  tracks.raysS = [[3090, 0.3], [3450, 1.2, E.outCubic], [4300, 1.55]];
  tracks.raysR = [[3090, 0], [4300, 35]];
  /* ---------- REVEAL：拍立得從膠囊裡浮上來、放大、輕輕轉一下停好；光環和星星、愛心 */
  tracks.polX = [[3300, spot.x], [3720, pol.cx, E.outCubic]];
  tracks.polY = [[3300, spot.y], [3720, pol.cy, E.outCubic]];
  tracks.polS = [[3300, 0.12], [3720, 1.04, E.outCubic], [3860, 1, E.inOutSine]];
  tracks.polR = [[3300, -14], [3720, 4, E.outCubic], [3980, -2, E.inOutSine]];
  tracks.polO = [[3300, 0], [3380, 1]];
  tracks.fxO = [[3350, 0], [3560, 0.95, E.outQuad], [4300, 0.38, E.inOutSine]];
  tracks.fxR = [[3350, -24], [4300, 10, E.outCubic]];
  tracks.fxS = [[3350, 0.7], [3760, 1.05, E.outCubic], [4300, 1]];
  // 背景稍微淡一點，照片才跳出來（不要淡到看不清扭蛋機）
  tracks.dimO = [[3250, 0], [3700, 0.36, E.outQuad]];
  tracks.cardO = [[3900, 0], [4200, 1, E.outQuad]];
  tracks.cardY = [[3900, 26], [4260, 0, E.outCubic]];
  let seed = (p.seed ?? 1) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // 翻滾時玻璃罩旁邊一閃一閃的星光
  const gb = ART.globeBack;
  const gcx = gb.x + gb.w / 2, gcy = gb.y + gb.h / 2;
  [-150, -35, 200, 25, -95, 155].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const x = gcx + Math.cos(a) * gb.w * 0.56, y = gcy + Math.sin(a) * gb.h * 0.62;
    const t0 = 420 + i * 190 + rnd() * 80;
    bits.push({
      kind: 'star', size: 110 + rnd() * 60,
      x: [[t0, x]], y: [[t0, y]],
      s: [[t0, 0.35], [t0 + 150, 1.1, E.outQuad], [t0 + 400, 0.6]],
      o: [[t0, 0], [t0 + 110, 1], [t0 + 400, 0, E.inQuad]],
      r: [[t0, 0], [t0 + 400, 40]],
    });
  });
  // 星星、愛心：從打開的地方往外飛，慢慢消失
  for (let i = 0; i < 12; i++) {
    const kind = i % 4 === 1 ? 'heart' : i % 4 === 3 ? 'heart2' : 'star';
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.4;
    const dist = pol.w * (0.42 + rnd() * 0.32);
    const t0 = 3380 + rnd() * 160, t1 = t0 + 620 + rnd() * 260;
    const ex = pol.cx + Math.cos(a) * dist * 1.05, ey = pol.cy + Math.sin(a) * dist * 0.9;
    bits.push({
      kind, size: kind === 'star' ? 120 + rnd() * 90 : 110 + rnd() * 50,
      x: [[t0, spot.x], [t1, ex, E.outCubic]], y: [[t0, spot.y], [t1, ey, E.outCubic]],
      s: [[t0, 0.3], [t0 + 220, 1.1, E.outQuad], [t1, 0.7]],
      o: [[t0, 0], [t0 + 90, 1], [t1 - 200, 0.9], [t1, 0, E.inQuad]],
      r: [[t0, (rnd() - 0.5) * 40], [t1, (rnd() - 0.5) * 120]],
    });
  }
  return { tracks, bits, spot, end: PHASE.COMPLETE };
}

/** 待機時：扭蛋輕輕浮動的參數（每顆不一樣，看起來才不會整齊劃一） */
export function wobble(i: number): { dy: number; rot: number; phase: number; cycles: number } {
  return { dy: 5 + (i % 3) * 1.5, rot: 2.2 + (i % 4) * 0.6, phase: (i * 0.37) % 1, cycles: 2 + (i % 2) };
}

/** 機器旁邊會一閃一閃的小星星（機器座標） */
export const TWINKLES: { x: number; y: number; size: number; phase: number }[] = [
  { x: 60, y: 420, size: 120, phase: 0 }, { x: 1150, y: 330, size: 150, phase: 0.33 },
  { x: -60, y: 900, size: 95, phase: 0.62 }, { x: 1250, y: 980, size: 110, phase: 0.15 },
  { x: 250, y: 60, size: 85, phase: 0.8 }, { x: 980, y: 40, size: 100, phase: 0.5 },
];
