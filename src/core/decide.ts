/**
 * 判斷每個檔案裡有沒有自己的小孩（跟電腦版 decide.py 同一套規則）。
 * 分數 = 這張臉跟參考照片＋家長確認過的臉的相似度（最像的兩張平均）；
 * 再跟「確定不是」的臉比較，比較像同學就扣分。
 * 「確定不是」來自：家長按「不是」的臉、合照唯一性（同一張合照只會有一個自己的小孩）。
 */
import { dot } from './face';

export const UNIQUE_GAP = 0.1;
export const MAX_CONFIRMED = 80;
export const TRUST_SLACK = 0.03;
export const FLOOR_EVIDENCE = 8;
export const NEG_MARGIN = 0.05;
/** 確認過「是」的臉夠多之後，跟它們非常像的待確認照片就直接存 */
export const AUTO_MIN_YES = 20;      // 至少要有這麼多張確認過的「是」
export const AUTO_NEAR = 0.04;       // 只處理差一點點就「確定」的臉
export const AUTO_K = 7;             // 最像的這麼多張答過的臉都要是「是」
export const AUTO_MIN_NO = 5;        // 也要按過幾次「不是」，才知道同學大概多像（不然不自動存）
export const AUTO_GAP = 0.08;        // 最像的「是」要比最像的「不是」明顯更像

export const THRESHOLDS: Record<string, [number, number]> = {
  loose: [0.44, 0.36],
  standard: [0.48, 0.4],
  strict: [0.53, 0.44],
};

export type FaceRow = { id: number; fileKey: string; frame: number; emb: Float32Array };
export type Label = { faceId: number; label: 1 | -1; emb: Float32Array };
export type Decision = { kind: 'match' | 'review'; score: number; faceId: number };

/** 每一列取最像的兩張平均（參考少於 4 張時取最高分） */
export function top2(sims: number[]): number {
  if (!sims.length) return -1;
  if (sims.length < 4) return Math.max(...sims);
  let a = -Infinity, b = -Infinity;
  for (const s of sims) { if (s > a) { b = a; a = s; } else if (s > b) b = s; }
  return (a + b) / 2;
}

export function topkMean(sims: number[], k = 2): number {
  if (!sims.length) return -1;
  const kk = Math.min(k, sims.length);
  return [...sims].sort((x, y) => y - x).slice(0, kk).reduce((p, q) => p + q, 0) / kk;
}

const simsTo = (e: Float32Array, set: Float32Array[]) => set.map((g) => dot(e, g));

export function decide(faces: FaceRow[], refFeats: Float32Array[], labels: Label[], matchThr: number,
  reviewThr: number): { decisions: Map<string, Decision>; stats: Record<string, number> } {
  const decisions = new Map<string, Decision>();
  if (!faces.length || !refFeats.length) return { decisions, stats: { confirmed: 0 } };
  const idxOf = new Map<number, number>();
  faces.forEach((f, i) => idxOf.set(f.id, i));
  const posLab = labels.filter((l) => l.label > 0), negLab = labels.filter((l) => l.label < 0);
  const posIds = new Set(posLab.map((l) => l.faceId)), negIds = new Set(negLab.map((l) => l.faceId));

  // 確認過的臉要先跟參考照片本身夠像，才拿來當參考（按錯的同學不會一路帶進更多同學）
  const trusted = posLab.filter((l) => top2(simsTo(l.emb, refFeats)) >= reviewThr - TRUST_SLACK);
  const usedPos = trusted.slice(-MAX_CONFIRMED);
  const gallery = [...refFeats, ...usedPos.map((l) => l.emb)];
  const sP = faces.map((f) => top2(simsTo(f.emb, gallery)));

  // 合照唯一性 -> 自動「不是」
  const byImage = new Map<string, number[]>();
  faces.forEach((f, i) => { if (f.frame < 0) { const a = byImage.get(f.fileKey) || []; a.push(i); byImage.set(f.fileKey, a); } });
  let auto: number[] = [];
  for (const idxs of byImage.values()) {
    if (idxs.length < 2) continue;
    const confirmed = idxs.filter((i) => posIds.has(faces[i].id));
    if (confirmed.length) { auto.push(...idxs.filter((i) => !confirmed.includes(i))); continue; }
    const order = [...idxs].sort((a, b) => sP[b] - sP[a]);
    const top = order[0];
    if (sP[top] >= matchThr && sP[top] - sP[order[1]] >= UNIQUE_GAP && !negIds.has(faces[top].id)) {
      auto.push(...order.slice(1).filter((i) => sP[i] < reviewThr));
    }
  }
  auto = auto.filter((i) => !posIds.has(faces[i].id));

  const negVecs = [...negLab.map((l) => l.emb), ...auto.map((i) => faces[i].emb)];
  const negSrc = [...negLab.map((l) => l.faceId), ...auto.map((i) => faces[i].id)];
  const penalized = (i: number, base: number) => {
    if (!negVecs.length) return base;
    const own = faces[i].id;
    const sims: number[] = [];
    negVecs.forEach((v, c) => { sims.push(negSrc[c] === own ? -1 : dot(faces[i].emb, v)); });
    const sN = topkMean(sims, 2);
    return base - Math.max(0, sN - base + NEG_MARGIN);
  };
  const s = sP.map((v, i) => (v >= reviewThr ? penalized(i, v) : v));

  // 從家長的答案學「待確認」的下限
  let effReview = reviewThr;
  const posCol = new Map<number, number>();
  usedPos.forEach((l, c) => posCol.set(l.faceId, refFeats.length + c));
  const rawYes = (i: number) => {
    const sims = simsTo(faces[i].emb, gallery);
    const col = posCol.get(faces[i].id);
    if (col !== undefined) sims[col] = -1;
    return penalized(i, top2(sims));
  };
  const yesS: number[] = [];
  for (const f of posIds) { const i = idxOf.get(f); if (i !== undefined) yesS.push(rawYes(i)); }
  if (yesS.length) {
    const lowYes = Math.min(...yesS);
    let noBelow = 0;
    for (const f of negIds) { const i = idxOf.get(f); if (i !== undefined && s[i] >= reviewThr && s[i] < lowYes) noBelow++; }
    if (noBelow >= FLOOR_EVIDENCE) effReview = Math.min(matchThr - 0.01, Math.max(reviewThr, lowYes - 0.015));
  }

  // 確認過很多張「是」之後：待確認的臉，如果最像它的那幾張「家長答過的臉」全部都是「是」，就直接存
  // （拿家長自己的答案來比：像的都是自己小孩、沒有一張是同學，才算數）
  let autoYes = 0;
  if (usedPos.length >= AUTO_MIN_YES && negLab.length >= AUTO_MIN_NO) {
    const known = [...usedPos.map((l) => ({ e: l.emb, id: l.faceId, yes: true })),
      ...negLab.map((l) => ({ e: l.emb, id: l.faceId, yes: false }))];
    faces.forEach((f, i) => {
      if (s[i] < Math.max(effReview, matchThr - AUTO_NEAR) || s[i] >= matchThr || posIds.has(f.id) || negIds.has(f.id)) return;
      const near = known.filter((k) => k.id !== f.id).map((k) => ({ sim: dot(f.emb, k.e), yes: k.yes }))
        .sort((x, y) => y.sim - x.sim);
      const top = near.slice(0, AUTO_K);
      if (top.length < AUTO_K || !top.every((k) => k.yes) || top[0].sim < matchThr || top[AUTO_K - 1].sim < matchThr - AUTO_NEAR) return;
      const firstNo = near.find((k) => !k.yes);
      if (firstNo && top[0].sim - firstNo.sim < AUTO_GAP) return;
      s[i] = matchThr; autoYes++;
    });
  }

  // 家長的標記最優先
  for (const f of posIds) { const i = idxOf.get(f); if (i !== undefined) s[i] = 1; }
  for (const f of negIds) { const i = idxOf.get(f); if (i !== undefined) s[i] = -1; }

  const best = new Map<string, [number, number]>();
  faces.forEach((f, i) => { const b = best.get(f.fileKey); if (!b || s[i] > b[0]) best.set(f.fileKey, [s[i], f.id]); });
  for (const [k, [sc, fid]] of best) {
    if (sc >= matchThr) decisions.set(k, { kind: 'match', score: sc, faceId: fid });
    else if (sc >= effReview) decisions.set(k, { kind: 'review', score: sc, faceId: fid });
  }
  return { decisions, stats: { confirmed: posLab.length, trusted: trusted.length, autoNeg: auto.length, autoYes, reviewFloor: effReview } };
}

/* ---------------------------------------------------------------- 參考照片 */

export type RefPhoto = { id: string; faces: { emb: Float32Array; size: number }[] };
export type RefResult = { id: string; status: 'ok' | 'multi' | 'outlier' | 'noface'; chosen?: number };

/** 合照自動挑最像其他參考照的那張臉；不像同一個人的照片先不使用（跟電腦版一樣）。 */
export function buildReferences(photos: RefPhoto[]): { feats: Float32Array[]; results: RefResult[] } {
  const res: RefResult[] = photos.map((p) => ({ id: p.id, status: p.faces.length ? 'ok' : 'noface' }));
  const singles = photos.filter((p) => p.faces.length === 1).map((p) => p.faces[0].emb);
  let anchor: Float32Array | null = null;
  if (singles.length >= 2) {
    anchor = new Float32Array(singles[0].length);
    for (const e of singles) for (let i = 0; i < e.length; i++) anchor[i] += e[i];
    let n = 0; for (const v of anchor) n += v * v; n = Math.sqrt(n) + 1e-9;
    for (let i = 0; i < anchor.length; i++) anchor[i] /= n;
  }
  photos.forEach((p, k) => {
    if (p.faces.length === 1) res[k].chosen = 0;
    else if (p.faces.length > 1) {
      res[k].status = 'multi';
      let bi = 0;
      if (anchor) { let bv = -2; p.faces.forEach((f, i) => { const v = dot(f.emb, anchor!); if (v > bv) { bv = v; bi = i; } }); }
      else { let bv = -1; p.faces.forEach((f, i) => { if (f.size > bv) { bv = f.size; bi = i; } }); }
      res[k].chosen = bi;
    }
  });
  const valid = res.map((r, k) => ({ r, k })).filter((x) => x.r.chosen !== undefined);
  const featOf = (k: number) => photos[k].faces[res[k].chosen!].emb;
  if (valid.length >= 4) {
    const means = valid.map((a) => {
      let s = 0; for (const b of valid) if (b.k !== a.k) s += dot(featOf(a.k), featOf(b.k));
      return s / (valid.length - 1);
    });
    const sorted = [...means].sort((x, y) => x - y);
    const median = sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const cut = Math.max(0.2, median - 0.2);
    valid.forEach((x, j) => { if (means[j] < cut) x.r.status = 'outlier'; });
  }
  const feats = valid.filter((x) => x.r.status !== 'outlier').map((x) => featOf(x.k));
  return { feats, results: res };
}
