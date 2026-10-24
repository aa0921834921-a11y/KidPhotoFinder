/**
 * 刮刮卡刮掉了多少：把銀箔切成小格子，手指刮過的線段（有粗細的膠囊形）蓋到格子中心，那一格才算刮掉。
 * 每一格只算一次，所以同一個地方重複刮，比例不會增加。座標用銀箔圖的單位（832 × 685），跟螢幕大小無關。
 * 這裡只有計算，不碰手機功能。
 */
export const FOIL_W = 832;
export const FOIL_H = 685;
/** 金框蓋住的那一圈（框底下不算銀箔）：金框圖裡面透明的地方是 (6, 6)～(826, 679)、圓角 28 */
export const FOIL_INSET = 8;
export const FOIL_RADIUS = 28;

export class Coverage {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private cells: Uint8Array;
  private inside: Uint8Array;
  readonly total: number;
  private done = 0;

  constructor(cell = 8) {
    this.cell = cell;
    this.cols = Math.ceil(FOIL_W / cell);
    this.rows = Math.ceil(FOIL_H / cell);
    this.cells = new Uint8Array(this.cols * this.rows);
    this.inside = new Uint8Array(this.cols * this.rows);
    let n = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        if (inFoil(x, y)) { this.inside[r * this.cols + c] = 1; n++; }
      }
    }
    this.total = n;
  }

  /** 刮過一段線（a → b，半徑 r）；回傳這一段新刮掉幾格 */
  stroke(ax: number, ay: number, bx: number, by: number, r: number): number {
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - r) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((Math.max(ax, bx) + r) / this.cell));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - r) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((Math.max(ay, by) + r) / this.cell));
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const rr = r * r;
    let added = 0;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = row * this.cols + col;
        if (!this.inside[i] || this.cells[i]) continue;
        const px = (col + 0.5) * this.cell, py = (row + 0.5) * this.cell;
        let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px, qy = ay + dy * t - py;
        if (qx * qx + qy * qy <= rr) { this.cells[i] = 1; added++; }
      }
    }
    this.done += added;
    return added;
  }

  /** 刮掉的比例 0 ～ 1 */
  ratio(): number {
    return this.total ? this.done / this.total : 0;
  }

  reset() {
    this.cells.fill(0);
    this.done = 0;
  }
}

/** 這個點在銀箔裡面嗎（圓角矩形，扣掉金框） */
export function inFoil(x: number, y: number): boolean {
  const x0 = FOIL_INSET, y0 = FOIL_INSET, x1 = FOIL_W - FOIL_INSET, y1 = FOIL_H - FOIL_INSET, R = FOIL_RADIUS;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + R ? x0 + R : x > x1 - R ? x1 - R : x;
  const cy = y < y0 + R ? y0 + R : y > y1 - R ? y1 - R : y;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= R * R;
}

/** 一筆一筆的刮痕：[x0, y0, x1, y1, …]（銀箔單位，取整數）；把它重新算一次覆蓋率（重新打開同一天的卡時用） */
export function replay(cov: Coverage, strokes: number[][], r: number) {
  cov.reset();
  for (const s of strokes) {
    if (s.length < 2) continue;
    if (s.length === 2) { cov.stroke(s[0], s[1], s[0], s[1], r); continue; }
    for (let i = 2; i + 1 < s.length; i += 2) cov.stroke(s[i - 2], s[i - 1], s[i], s[i + 1], r);
  }
}
