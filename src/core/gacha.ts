/**
 * 回憶扭蛋機：玻璃罩裡的扭蛋怎麼翻滾、碰撞、最後堆回罩子底部（手機版、電腦版共用）。
 *
 * 做法：按下去的那一刻先把整段動作用簡單的 2D 物理算好（圓形碰撞、重力、攪拌、摩擦帶動旋轉），
 * 每 1/60 秒記一格位置和角度；畫面只負責照著這些格子播放（手機在原生端播，不會卡）。
 * 同一個 seed 算出來的動作一模一樣。
 *
 * 座標是「機器座標」：整台機器（玻璃罩頂端到底座腳）寬 1211、高 1861，畫面上再乘上比例。
 * 扭蛋分前後兩排：後排小一點、位置高一點，只跟同一排的碰撞，看起來才有前後遮擋的立體感。
 */

export type Kind = 'pink' | 'peach' | 'gold' | 'mint' | 'blue' | 'purple';

/** 玻璃罩內部（扭蛋能動的範圍）。floor[0] 後排、floor[1] 前排：地板在金框後面一點，扭蛋底部會被金框擋住 */
export const DOME = {
  cx: 605.5, cy: 707, rx: 541, ry: 470,
  floor: [990, 1075] as const,
  ceil: 372,
  /** 後排的範圍縮小一點（離得比較遠） */
  back: 0.92,
  /** 底部中間的洞：被選中的扭蛋從這裡掉下去 */
  hole: 92,
};

/** 罩子裡的扭蛋：後排 4 顆、前排 6 顆（大小照參考圖：大約裝到玻璃罩的七分滿） */
export const SET: { kind: Kind; layer: 0 | 1; r: number }[] = [
  { kind: 'peach', layer: 0, r: 137 }, { kind: 'mint', layer: 0, r: 132 }, { kind: 'purple', layer: 0, r: 139 }, { kind: 'gold', layer: 0, r: 134 },
  { kind: 'pink', layer: 1, r: 157 }, { kind: 'blue', layer: 1, r: 152 }, { kind: 'gold', layer: 1, r: 155 }, { kind: 'mint', layer: 1, r: 150 },
  { kind: 'purple', layer: 1, r: 155 }, { kind: 'pink', layer: 1, r: 152 },
];

export interface Cap { x: number; y: number; a: number; on: boolean }

/** 一次轉動算出來的結果 */
export interface Mix {
  /** 每一格的時間（毫秒），間隔 1000/60 */
  times: number[];
  /** frames[i] = 第 i 顆扭蛋每一格的 [x, y, 角度(度)] 攤平 */
  frames: number[][];
  /** 第 i 顆扭蛋在第幾格開始看得到（補進來的那顆一開始是透明的） */
  showAt: number[];
  /** 掉出去的是哪一顆 */
  out: number;
  /** 最後停下來的位置（下一次待機、下一次轉動的起點）；掉出去的那顆 on=false */
  end: Cap[];
}

/** 1 秒 = 1000 毫秒；整段翻滾的長度 */
export const MIX_MS = 1800;

const G = 5200; // 重力
const DT = 1 / 240;

type B = { x: number; y: number; vx: number; vy: number; a: number; w: number; r: number; m: number; layer: 0 | 1; on: boolean; sink: boolean; hx: number; hy: number };

export function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, t: number) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

function bodies(state: Cap[] | null, rnd: () => number): B[] {
  return SET.map((c, i) => {
    const s = state?.[i];
    return {
      x: s ? s.x : DOME.cx + (rnd() - 0.5) * 500, y: s ? s.y : DOME.ceil + c.r + 20 + rnd() * 240,
      vx: 0, vy: 0, a: s ? s.a : rnd() * 360, w: 0, r: c.r, m: c.r * c.r, layer: c.layer, on: s ? s.on : true, sink: false, hx: 0, hy: 0,
    };
  });
}

/** 碰到牆（玻璃、地板、天花板）：彈回來、摩擦帶動旋轉。n 是往外的方向 */
function wall(b: B, nx: number, ny: number, e: number, mu: number) {
  const vcx = b.vx - b.w * b.r * ny, vcy = b.vy + b.w * b.r * nx;
  const vn = vcx * nx + vcy * ny;
  if (vn <= 0) return;
  b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
  const tx = -ny, ty = nx;
  const vt = vcx * tx + vcy * ty;
  const lim = mu * (1 + e) * vn;
  const jt = clamp(-vt / 3, -lim, lim); // 已除以質量
  b.vx += jt * tx; b.vy += jt * ty;
  b.w += (2 * jt) / b.r;
}

function pair(a: B, b: B, e: number, mu: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const R = a.r + b.r, d2 = dx * dx + dy * dy;
  if (d2 >= R * R || d2 < 1e-6) return false;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  const wa = a.sink ? 0.05 / a.m : 1 / a.m, wb = b.sink ? 0.05 / b.m : 1 / b.m, ws = wa + wb;
  const c = ((R - d) / ws) * 0.85;
  a.x -= nx * c * wa; a.y -= ny * c * wa; b.x += nx * c * wb; b.y += ny * c * wb;
  const vax = a.vx - a.w * a.r * ny, vay = a.vy + a.w * a.r * nx;
  const vbx = b.vx + b.w * b.r * ny, vby = b.vy - b.w * b.r * nx;
  const rvx = vbx - vax, rvy = vby - vay;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return true;
  const jn = (-(1 + e) * vn) / ws;
  a.vx -= jn * wa * nx; a.vy -= jn * wa * ny; b.vx += jn * wb * nx; b.vy += jn * wb * ny;
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  const lim = mu * jn;
  const jt = clamp(-vt / (3 * ws), -lim, lim);
  a.vx -= jt * wa * tx; a.vy -= jt * wa * ty; b.vx += jt * wb * tx; b.vy += jt * wb * ty;
  a.w -= (2 * jt * wa) / a.r;
  b.w -= (2 * jt * wb) / b.r;
  return true;
}

/** 讓扭蛋留在玻璃罩裡（橢圓＋地板＋天花板）。回傳有沒有碰到 */
function contain(b: B, e: number, mu: number): boolean {
  const k = b.layer === 0 ? DOME.back : 1;
  const ex = DOME.rx * k - b.r, ey = DOME.ry * k - b.r;
  const floor = DOME.floor[b.layer];
  const dx = b.x - DOME.cx, dy = b.y - DOME.cy;
  const q = (dx * dx) / (ex * ex) + (dy * dy) / (ey * ey);
  let hit = false;
  if (q > 1) {
    const s = 1 / Math.sqrt(q);
    b.x = DOME.cx + dx * s; b.y = DOME.cy + dy * s;
    let nx = dx / (ex * ex), ny = dy / (ey * ey);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    wall(b, nx, ny, e, mu);
    hit = true;
  }
  if (b.y + b.r > floor) { b.y = floor - b.r; wall(b, 0, 1, e, mu); hit = true; }
  if (b.y - b.r < DOME.ceil) { b.y = DOME.ceil + b.r; wall(b, 0, -1, e, mu); }
  return hit;
}

interface Phase { stir: number; e: number; drag: number; spin: number; g: number; rest: number; pull: number }

function step(bs: B[], t: number, p: Phase, rnd: () => number) {
  for (const b of bs) {
    if (!b.on) continue;
    if (b.sink) {
      // 被選中的那顆：滑到中間的洞口，從底下掉出去（不受玻璃罩限制，會把擋路的扭蛋推開）
      b.vx = (DOME.cx - b.x) * 7;
      b.vy = Math.max(b.vy, 0) + 4200 * DT;
      b.w *= Math.exp(-2 * DT);
      b.x += b.vx * DT; b.y += b.vy * DT; b.a += (b.w * DT * 180) / Math.PI;
      continue;
    }
    b.vy += G * p.g * DT;
    // 落回去的時候稍微往中間收，堆起來比較快、比較穩；後排回到原本的位置
    if (p.pull > 0) {
      if (b.layer === 0 && b.hy) {
        b.vx += ((b.hx - b.x) * 140 - b.vx * 16) * p.pull * DT;
        b.vy += ((b.hy - b.y) * 140 - b.vy * 16) * p.pull * DT;
      } else b.vx -= (b.x - DOME.cx) * 3.2 * p.pull * DT;
    }
    if (p.stir > 0) {
      // 底下的轉盤把扭蛋往上拋、順著旋鈕的方向轉圈
      const dx = b.x - DOME.cx, dy = b.y - DOME.cy;
      const d = Math.hypot(dx, dy) || 1;
      const swirl = 7600 * p.stir * (0.55 + 0.45 * Math.sin(t * 9 + b.r));
      b.vx += (-dy / d) * swirl * DT;
      b.vy += (dx / d) * swirl * DT;
      const low = clamp((b.y - (DOME.cy + 60)) / 220, 0, 1);
      if (low > 0 && rnd() < 9 * DT * p.stir) {
        b.vy -= (1500 + rnd() * 1100) * low * (0.45 + 0.55 * p.stir);
        b.vx += (rnd() - 0.5) * 1100 * p.stir;
        b.w += (rnd() - 0.5) * 16;
      }
    }
    const f = Math.exp(-p.drag * DT);
    b.vx *= f; b.vy *= f;
    b.w *= Math.exp(-p.spin * DT);
    b.x += b.vx * DT; b.y += b.vy * DT; b.a += (b.w * DT * 180) / Math.PI;
  }
  const touch = bs.map(() => false);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (!a.on) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.on && b.layer === a.layer && pair(a, b, p.e, 0.18)) { touch[i] = true; touch[j] = true; }
      }
    }
    bs.forEach((b, i) => { if (b.on && !b.sink && contain(b, p.e, 0.35)) touch[i] = true; });
  }
  bs.forEach((b, i) => {
    // 掉出玻璃罩（金框下面看不到了）就收起來
    if (b.sink && b.y - b.r > DOME.floor[1] + 70) { b.on = false; b.sink = false; return; }
    // 快停好的時候：碰著別人又幾乎不動的，就讓它停住（不會一直微微抖動）
    if (p.rest > 0 && touch[i] && Math.hypot(b.vx, b.vy) < 6 * p.rest) { b.vx = 0; b.vy = 0; b.w *= 0.8; }
  });
}

const snapshot = (bs: B[]): Cap[] => bs.map((b) => ({ x: b.x, y: b.y, a: b.a, on: b.on }));

/**
 * 一打開時的樣子（= settle(7) 的結果，事先算好，打開扭蛋機不用等；卡片上的小圖也是這個樣子）。
 * 改了 SET 或 DOME 要重新產生。
 */
export const REST: Cap[] = ([[259, 624.9, 320.5], [656, 782.2, 193.1], [918, 851, 185.7], [400.5, 856, 48.1], [543.5, 628.2, 36.6],
  [849.7, 587.1, 204.9], [231.5, 629.1, 97.1], [621.9, 925, 54.7], [924.1, 884.9, 180], [320, 923, 335.1]] as const).map(([x, y, a]) => ({ x, y, a, on: true }));

/** 一開始的樣子：扭蛋從上面落下、自然堆在罩子底部 */
export function settle(seed = 7): Cap[] {
  const rnd = rng(seed);
  const bs = bodies(null, rnd);
  // 先錯開放，避免一開始就重疊
  bs.forEach((b, i) => { b.x = DOME.cx + ((i % 3) - 1) * 230 + (rnd() - 0.5) * 40; b.y = DOME.ceil + b.r + 10 + Math.floor(i / 3) * 150; });
  for (let t = 0; t < 4; t += DT) step(bs, t, { stir: 0, e: 0.2, drag: 1.5, spin: 3, g: 1, rest: t > 2 ? 1 : 0, pull: 1 }, rnd);
  for (const b of bs) { b.vx = b.vy = b.w = 0; }
  return snapshot(bs);
}

/**
 * 轉一次：從 start（上一次停下來的樣子）開始，攪拌、翻滾，最後掉出一顆、其他的堆回底部。
 * 上一次掉出去的那顆會從罩子上方補回來。
 */
export function mix(start: Cap[], seed: number): Mix {
  const rnd = rng(seed);
  const bs = bodies(start, rnd);
  const showAt = bs.map(() => 0);
  bs.forEach((b, i) => {
    b.a = start[i]?.a ?? b.a;
    if (b.layer === 0) { b.hx = b.x; b.hy = b.y; }
    if (!b.on) {
      // 補一顆：從頂蓋下面放進來
      b.on = true;
      b.x = DOME.cx + (rnd() - 0.5) * 160; b.y = DOME.ceil + b.r + 6;
      b.vx = (rnd() - 0.5) * 200; b.vy = 150; b.w = (rnd() - 0.5) * 4;
      showAt[i] = 1;
    }
  });
  const times: number[] = [];
  const frames: number[][] = bs.map(() => []);
  let out = -1;
  const total = MIX_MS / 1000;
  // 畫面時間 v 和物理時間 t：後段（落回底部）物理跑得快一點，1.8 秒內就能堆好
  let v = 0, next = 0, t = 0, homed = false;
  while (v <= total + 1e-9) {
    if (v + 1e-9 >= next) {
      times.push(Math.round(next * 1000 * 100) / 100);
      bs.forEach((b, i) => frames[i].push(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.a * 10) / 10));
      next += 1 / 60;
    }
    if (out < 0 && t >= 0.9) {
      // 選最靠近底部中間洞口的前排扭蛋掉出去
      let best = -1, bd = Infinity;
      bs.forEach((b, i) => {
        if (!b.on || b.layer !== 1) return;
        const d = Math.hypot(b.x - DOME.cx, (b.y - (DOME.floor[1] - b.r)) * 1.4);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { out = best; bs[best].sink = true; }
    }
    if (!homed && t >= 0.95) {
      // 後排要回去的位置：照左右順序分配（不會互相擋路）
      homed = true;
      const back = bs.filter((b) => b.layer === 0);
      const slots = back.map((b) => [b.hx, b.hy]).sort((a, c) => a[0] - c[0]);
      back.slice().sort((a, c) => a.x - c.x).forEach((b, k) => { b.hx = slots[k][0]; b.hy = slots[k][1]; });
    }
    step(bs, t, phase(t), rnd);
    t += DT;
    v += DT / (1 + 0.7 * smooth(1.0, 1.4, t));
  }
  // 再多算一下，讓大家完全停好；最後 0.3 秒慢慢靠到停好的位置（畫面不會突然停住）
  for (let k = 0; k < 240; k++) { step(bs, t, phase(t), rnd); t += DT; }
  if (out >= 0) bs[out].on = false;
  const end = snapshot(bs);
  const n = times.length;
  for (let k = 0; k < n; k++) {
    const w = smooth(MIX_MS - 320, MIX_MS, times[k]);
    if (w <= 0) continue;
    frames.forEach((f, i) => {
      if (!end[i].on) return;
      f[k * 3] += (end[i].x - f[k * 3]) * w;
      f[k * 3 + 1] += (end[i].y - f[k * 3 + 1]) * w;
      f[k * 3 + 2] += (end[i].a - f[k * 3 + 2]) * w;
    });
  }
  return { times, frames, showAt, out, end };
}

/** 攪拌、彈性、阻力隨時間變化：0.3 秒開始攪、1 秒左右慢下來、1.2 秒後落回底部停好 */
function phase(t: number): Phase {
  const stir = smooth(0.28, 0.45, t) * (1 - smooth(0.76, 0.98, t));
  const late = smooth(0.95, 1.3, t);
  return { stir, e: 0.42 - 0.34 * late, drag: 0.6 + 1.6 * late, spin: 1.2 + 5 * late, g: 1 + 0.6 * late, rest: smooth(1.35, 1.6, t), pull: smooth(0.9, 1.15, t) };
}

/** 把一次轉動的格子取第 k 格（給電腦版用：照時間播放） */
export function frameAt(m: Mix, i: number, ms: number): [number, number, number] {
  const f = m.frames[i];
  const n = m.times.length;
  const p = clamp(ms / (1000 / 60), 0, n - 1);
  const k = Math.floor(p), u = p - k;
  const k2 = Math.min(n - 1, k + 1);
  return [f[k * 3] + (f[k2 * 3] - f[k * 3]) * u, f[k * 3 + 1] + (f[k2 * 3 + 1] - f[k * 3 + 1]) * u, f[k * 3 + 2] + (f[k2 * 3 + 2] - f[k * 3 + 2]) * u];
}
