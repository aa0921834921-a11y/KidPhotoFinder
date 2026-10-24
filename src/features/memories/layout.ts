/**
 * 回憶星空的排版（世界座標 941 × 1672）：
 * - 每個星座最多 6 顆照片星球：照片最多的活動是主星，接著是照片多的；其他活動是小星星
 * - 小星星先放進預先排好的位置，放滿了再往外繞（依日期從舊到新，新的回憶加進來時舊的星星不會亂跳）
 * - 還沒有回憶的位置畫成暗暗的「還沒點亮的星」（不能點）
 * - 連線用最小生成樹（線不會交叉）
 * 這裡只有計算，不碰手機功能。
 */
import { CONS, CONS_ORDER, labelRects, PLANETS, TITLE_BOX, WORLD_W, type ConsKey } from './constellations';
import type { Memory } from './data';

export type Star = { m: Memory; x: number; y: number; r: number; photo: boolean; primary: boolean; cons: ConsKey };
export type Ghost = { x: number; y: number; r: number };
export type Edge = { x1: number; y1: number; x2: number; y2: number; lit: boolean };
export type Cluster = { key: ConsKey; stars: Star[]; ghosts: Ghost[]; edges: Edge[]; count: number; latest: string | null };
export type SkyLayout = { stars: Star[]; clusters: Record<ConsKey, Cluster> };

/** 一個星座最多畫幾顆（再多的話，最舊的先不畫；資料都還在） */
const MAX_PER_CLUSTER = 160;

type Box = [number, number, number, number];
const inBox = (x: number, y: number, b: Box, pad = 0) => x > b[0] - pad && x < b[2] + pad && y > b[1] - pad && y < b[3] + pad;
const dotR = (m: Memory) => 5 + 4 * Math.min(1, m.photos.length / 12);

export function layoutSky(items: Memory[]): SkyLayout {
  const clusters = {} as Record<ConsKey, Cluster>;
  const all: Star[] = [];
  const labels = CONS_ORDER.flatMap((k) => { const r = labelRects(k); return [r.text, r.icon]; });
  // 所有星座的照片位置先佔好；小星星放下去之後也加進來（不同星座的星星也不會疊在一起）
  const taken: { x: number; y: number; r: number }[] = [
    ...CONS_ORDER.flatMap((k) => CONS[k].slots.map((q) => ({ x: q.x, y: q.y, r: q.d / 2 }))),
    ...PLANETS.map((p) => ({ x: p.x, y: p.y, r: Math.max(p.r, Math.max(p.w, p.h) / 2.4) })),
  ];
  for (const key of CONS_ORDER) {
    const def = CONS[key];
    const list = items.filter((m) => m.cons === key);
    const byCount = [...list].sort((a, b) => b.photos.length - a.photos.length || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    const withPhoto = byCount.slice(0, def.slots.length);
    // 照片星球：主星照片最多，其他照日期排
    const [main, ...others] = withPhoto;
    others.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    const stars: Star[] = [];
    if (main) stars.push({ m: main, x: def.slots[0].x, y: def.slots[0].y, r: def.slots[0].d / 2, photo: true, primary: true, cons: key });
    others.forEach((m, i) => { const s = def.slots[i + 1]; stars.push({ m, x: s.x, y: s.y, r: s.d / 2, photo: true, primary: false, cons: key }); });
    // 小星星：從舊到新
    const picked = new Set(withPhoto);
    const rest = list.filter((m) => !picked.has(m)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id < b.id ? -1 : 1)).slice(-MAX_PER_CLUSTER);
    const free = (x: number, y: number, r: number) => {
      if (x < 96 || x > WORLD_W - 96 || y < 246 || y > 1300) return false;
      if (inBox(x, y, [TITLE_BOX.x0, TITLE_BOX.y0, TITLE_BOX.x1, TITLE_BOX.y1], 10)) return false;
      if (labels.some((b) => inBox(x, y, b, 6))) return false;
      const own = Math.hypot(x - def.center[0], y - def.center[1]);
      if (CONS_ORDER.some((o) => o !== key && Math.hypot(x - CONS[o].center[0], y - CONS[o].center[1]) * 0.92 < own)) return false;
      return taken.every((t) => Math.hypot(x - t.x, y - t.y) > r + t.r + 12);
    };
    let di = 0, j = 0;
    const seed = CONS_ORDER.indexOf(key) * 1.7;
    for (const m of rest) {
      const r = dotR(m);
      let pos: [number, number] | null = null;
      while (!pos && di < def.dots.length) { const p = def.dots[di++]; if (free(p[0], p[1], r)) pos = p; }
      while (!pos && j < 6000) {
        const a = j * 2.39996 + seed, rad = 64 + 12 * Math.sqrt(j);
        const x = def.center[0] + Math.cos(a) * rad, y = def.center[1] + Math.sin(a) * rad * 0.9;
        j++;
        if (free(x, y, r)) pos = [x, y];
      }
      if (!pos) break; // 真的放不下了（上百個同類活動），剩下的先不畫
      taken.push({ x: pos[0], y: pos[1], r });
      stars.push({ m, x: pos[0], y: pos[1], r, photo: false, primary: false, cons: key });
    }
    // 還沒點亮的照片位置
    const ghosts: Ghost[] = def.slots.slice(withPhoto.length).map((s, i) => ({ x: s.x, y: s.y, r: i === 0 && !withPhoto.length ? 9 : 5 }));
    if (!list.length) ghosts.push(...def.dots.slice(0, 3).map(([x, y]) => ({ x, y, r: 4 })));
    // 連線：最小生成樹（亮的星和還沒點亮的一起連，碰到沒點亮的那段畫淡一點）
    const pts = [...stars.map((s) => ({ x: s.x, y: s.y, r: s.r, lit: true })), ...ghosts.map((g) => ({ ...g, lit: false }))];
    const edges: Edge[] = [];
    if (pts.length > 1) {
      const inT = new Array(pts.length).fill(false);
      const best = new Array(pts.length).fill(Infinity);
      const from = new Array(pts.length).fill(-1);
      best[0] = 0;
      for (let n = 0; n < pts.length; n++) {
        let u = -1;
        for (let i = 0; i < pts.length; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i;
        inT[u] = true;
        if (from[u] >= 0) {
          const a = pts[from[u]], b = pts[u];
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
          // 線從星球的邊緣開始，不要穿過照片
          edges.push({ x1: a.x + ux * (a.r + 3), y1: a.y + uy * (a.r + 3), x2: b.x - ux * (b.r + 3), y2: b.y - uy * (b.r + 3), lit: a.lit && b.lit });
        }
        for (let i = 0; i < pts.length; i++) {
          if (inT[i]) continue;
          const d = Math.hypot(pts[i].x - pts[u].x, pts[i].y - pts[u].y);
          if (d < best[i]) { best[i] = d; from[i] = u; }
        }
      }
    }
    const latest = list.reduce<string | null>((acc, m) => (m.trusted && (!acc || m.day > acc) ? m.day : acc), null);
    clusters[key] = { key, stars, ghosts, edges: edges.filter((e) => Math.hypot(e.x2 - e.x1, e.y2 - e.y1) > 4), count: list.length, latest };
    all.push(...stars);
  }
  return { stars: all, clusters };
}

/** 螢幕上點的位置最近的星星（距離要在 maxDist 以內）；只找 ok 的星星 */
export function nearestStar(stars: Star[], wx: number, wy: number, scale: number, ok: (s: Star) => boolean): Star | null {
  let best: Star | null = null, bd = Infinity;
  for (const s of stars) {
    if (!ok(s)) continue;
    const d = Math.hypot(s.x - wx, s.y - wy) * scale; // 螢幕上的距離
    const reach = Math.max(24, s.r * scale + 10); // 至少 48dp 寬的點擊範圍
    if (d <= reach && d - s.r * scale < bd) { bd = d - s.r * scale; best = s; }
  }
  return best;
}
