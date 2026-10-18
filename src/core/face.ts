/**
 * 人臉偵測 + 對齊 + 特徵前處理（純 TypeScript，手機和測試環境共用）。
 * 跟電腦版 engine.py 的做法一致：
 *   - YuNet（2023mar）兩種解析度找臉：1024 抓近拍大臉、2048 抓合照小臉
 *   - 5 個特徵點相似變換對齊到 ArcFace 112x112 範本
 *   - w600k_r50 前處理：RGB、(x-127.5)/127.5、NCHW
 * 影像一律用 BGR、每像素 3 bytes（跟 OpenCV 一樣），避免兩邊算出來不同。
 */

export type BGRImage = { w: number; h: number; data: Uint8Array }; // 長度 w*h*3，BGR

export type Face = {
  box: [number, number, number, number]; // x, y, w, h（原圖座標）
  score: number;
  size: number; // min(w, h)
  kps: number[]; // 10 個數：5 點 (x, y)
};

export const ARC_TEMPLATE = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

/* ---------------------------------------------------------------- 影像工具 */

/** 盒狀平均縮小（等同 OpenCV INTER_AREA 的縮小情況），放大或不變時直接回傳原圖。 */
export function resizeArea(img: BGRImage, nw: number, nh: number): BGRImage {
  if (nw >= img.w && nh >= img.h) return img;
  const out = new Uint8Array(nw * nh * 3);
  const sx = img.w / nw, sy = img.h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = y * sy, y1 = (y + 1) * sy;
    const iy0 = Math.floor(y0), iy1 = Math.min(img.h, Math.ceil(y1));
    for (let x = 0; x < nw; x++) {
      const x0 = x * sx, x1 = (x + 1) * sx;
      const ix0 = Math.floor(x0), ix1 = Math.min(img.w, Math.ceil(x1));
      let b = 0, g = 0, r = 0, wsum = 0;
      for (let yy = iy0; yy < iy1; yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        if (wy <= 0) continue;
        let o = (yy * img.w + ix0) * 3;
        for (let xx = ix0; xx < ix1; xx++, o += 3) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          if (wx <= 0) continue;
          const wgt = wx * wy;
          b += img.data[o] * wgt; g += img.data[o + 1] * wgt; r += img.data[o + 2] * wgt;
          wsum += wgt;
        }
      }
      const p = (y * nw + x) * 3;
      out[p] = Math.round(b / wsum); out[p + 1] = Math.round(g / wsum); out[p + 2] = Math.round(r / wsum);
    }
  }
  return { w: nw, h: nh, data: out };
}

export function rgbaToBGR(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): BGRImage {
  const out = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    out[i * 3] = rgba[j + 2]; out[i * 3 + 1] = rgba[j + 1]; out[i * 3 + 2] = rgba[j];
  }
  return { w, h, data: out };
}

/* ---------------------------------------------------------------- YuNet */

export const YUNET_STRIDES = [8, 16, 32];

export function yunetInput(img: BGRImage): { data: Float32Array; padW: number; padH: number } {
  const padW = (Math.floor((img.w - 1) / 32) + 1) * 32;
  const padH = (Math.floor((img.h - 1) / 32) + 1) * 32;
  const plane = padW * padH;
  const data = new Float32Array(3 * plane); // 補的地方是 0（跟 OpenCV copyMakeBorder 一樣）
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 3, d = y * padW + x;
      data[d] = img.data[s]; data[plane + d] = img.data[s + 1]; data[2 * plane + d] = img.data[s + 2];
    }
  }
  return { data, padW, padH };
}

export type YunetOutputs = Record<string, Float32Array>; // cls_8 ... kps_32

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function yunetDecode(out: YunetOutputs, padW: number, padH: number, scoreThr = 0.6, nmsThr = 0.3,
  topK = 5000): Face[] {
  const cands: Face[] = [];
  for (const st of YUNET_STRIDES) {
    const cols = Math.floor(padW / st), rows = Math.floor(padH / st);
    const cls = out[`cls_${st}`], obj = out[`obj_${st}`], bbox = out[`bbox_${st}`], kps = out[`kps_${st}`];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
        if (score < scoreThr) continue;
        const cx = (c + bbox[i * 4]) * st, cy = (r + bbox[i * 4 + 1]) * st;
        const w = Math.exp(bbox[i * 4 + 2]) * st, h = Math.exp(bbox[i * 4 + 3]) * st;
        const k: number[] = [];
        for (let n = 0; n < 5; n++) {
          k.push((kps[i * 10 + 2 * n] + c) * st, (kps[i * 10 + 2 * n + 1] + r) * st);
        }
        cands.push({ box: [cx - w / 2, cy - h / 2, w, h], score, size: Math.min(w, h), kps: k });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const keep: Face[] = [];
  for (const f of cands) {
    if (keep.length >= topK) break;
    if (keep.every((k) => iou(k.box, f.box) <= nmsThr)) keep.push(f);
  }
  return keep;
}

export function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[2] * a[3] + b[2] * b[3] - inter + 1e-6);
}

/** 跑 YuNet：input 是 [1,3,padH,padW] 的 BGR float。 */
export type DetectFn = (input: Float32Array, padH: number, padW: number) => Promise<YunetOutputs>;

async function detectAt(img: BGRImage, maxSide: number, run: DetectFn, scoreThr: number): Promise<Face[]> {
  const s = Math.min(1, maxSide / Math.max(img.w, img.h));
  const small = s < 1 ? resizeArea(img, Math.max(1, Math.round(img.w * s)), Math.max(1, Math.round(img.h * s))) : img;
  const inp = yunetInput(small);
  const outs = await run(inp.data, inp.padH, inp.padW);
  const faces = yunetDecode(outs, inp.padW, inp.padH, scoreThr);
  // 換回原圖座標（OpenCV 是先除再存，跟這裡一樣用實際縮放比例 s）
  for (const f of faces) {
    f.box = [f.box[0] / s, f.box[1] / s, f.box[2] / s, f.box[3] / s];
    f.kps = f.kps.map((v) => v / s);
    f.size = Math.min(f.box[2], f.box[3]);
  }
  return faces;
}

/** 兩種解析度找臉（跟電腦版一樣）。run 會收到已經縮好的影像，負責跑 YuNet。 */
export async function detectFaces(img: BGRImage, run: DetectFn, minFacePx = 32, scoreThr = 0.6,
  maxSide = 2048): Promise<Face[]> {
  const cands = await detectAt(img, 1024, run, scoreThr);
  if (Math.max(img.w, img.h) > 1100) {
    for (const d of await detectAt(img, maxSide, run, scoreThr)) {
      if (cands.every((c) => iou(d.box, c.box) < 0.3)) cands.push(d);
    }
  }
  return cands.filter((f) => f.size >= minFacePx);
}

/* ---------------------------------------------------------------- 對齊 */

/** 5 點最小平方相似變換（旋轉 + 等比縮放 + 平移），回傳 2x3 [a, -b, tx; b, a, ty]。 */
export function similarityTransform(src: number[], dst = ARC_TEMPLATE): number[] {
  const n = 5;
  let mx = 0, my = 0, ux = 0, uy = 0;
  for (let i = 0; i < n; i++) { mx += src[2 * i]; my += src[2 * i + 1]; ux += dst[i][0]; uy += dst[i][1]; }
  mx /= n; my /= n; ux /= n; uy /= n;
  let sxx = 0, sxy = 0, ss = 0;
  for (let i = 0; i < n; i++) {
    const x = src[2 * i] - mx, y = src[2 * i + 1] - my;
    const u = dst[i][0] - ux, v = dst[i][1] - uy;
    sxx += x * u + y * v; // a 分子
    sxy += x * v - y * u; // b 分子
    ss += x * x + y * y;
  }
  const a = sxx / ss, b = sxy / ss;
  const tx = ux - (a * mx - b * my), ty = uy - (b * mx + a * my);
  return [a, -b, tx, b, a, ty];
}

/** 雙線性 warpAffine 到 112x112，外面補 0（跟 cv2.warpAffine borderValue=0 一樣）。 */
export function warpAffine112(img: BGRImage, M: number[]): BGRImage {
  const S = 112;
  // 反變換：輸出像素 -> 原圖位置
  const [a, b, c, d, e, f] = M;
  const det = a * e - b * d;
  const ia = e / det, ib = -b / det, id = -d / det, ie = a / det;
  const ic = -(ia * c + ib * f), iff = -(id * c + ie * f);
  const out = new Uint8Array(S * S * 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const sx = ia * x + ib * y + ic, sy = id * x + ie * y + iff;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const p = (y * S + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const v = (xx: number, yy: number) =>
          xx < 0 || yy < 0 || xx >= img.w || yy >= img.h ? 0 : img.data[(yy * img.w + xx) * 3 + ch];
        const val = (1 - fy) * ((1 - fx) * v(x0, y0) + fx * v(x0 + 1, y0)) + fy * ((1 - fx) * v(x0, y0 + 1) + fx * v(x0 + 1, y0 + 1));
        out[p + ch] = Math.max(0, Math.min(255, Math.round(val)));
      }
    }
  }
  return { w: S, h: S, data: out };
}

export function alignFace(img: BGRImage, kps: number[]): BGRImage {
  return warpAffine112(img, similarityTransform(kps));
}

export function flipH(img: BGRImage): BGRImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const s = (y * img.w + x) * 3, d = (y * img.w + (img.w - 1 - x)) * 3;
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2];
  }
  return { w: img.w, h: img.h, data: out };
}

/* ---------------------------------------------------------------- ArcFace */

/** 112x112 BGR -> w600k 輸入（RGB、(x-127.5)/127.5、NCHW） */
export function arcfaceInput(crop: BGRImage): Float32Array {
  const P = 112 * 112, out = new Float32Array(3 * P);
  for (let i = 0; i < P; i++) {
    out[i] = (crop.data[i * 3 + 2] - 127.5) / 127.5; // R
    out[P + i] = (crop.data[i * 3 + 1] - 127.5) / 127.5; // G
    out[2 * P + i] = (crop.data[i * 3] - 127.5) / 127.5; // B
  }
  return out;
}

export function l2normalize(v: Float32Array | number[]): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) + 1e-9, out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export type EmbedFn = (input: Float32Array) => Promise<Float32Array>;

/** 對齊好的臉 -> 正規化特徵。flip=true 時加上左右翻轉平均（參考照片用，比較準）。 */
export async function embed(crop: BGRImage, run: EmbedFn, flip = false): Promise<Float32Array> {
  const f = l2normalize(await run(arcfaceInput(crop)));
  if (!flip) return f;
  const g = l2normalize(await run(arcfaceInput(flipH(crop))));
  const sum = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) sum[i] = f[i] + g[i];
  return l2normalize(sum);
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/* ---------------------------------------------------------------- float16 存檔 */

export function toFloat16(v: Float32Array): Uint16Array {
  const out = new Uint16Array(v.length), f = new Float32Array(1), u = new Uint32Array(f.buffer);
  for (let i = 0; i < v.length; i++) {
    f[0] = v[i];
    const x = u[0], sign = (x >>> 16) & 0x8000;
    let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
    if (e <= 0) { out[i] = sign; continue; }
    if (e >= 31) { out[i] = sign | 0x7c00; continue; }
    m = m + 0x1000; // 四捨五入
    if (m & 0x800000) { m = 0; e += 1; if (e >= 31) { out[i] = sign | 0x7c00; continue; } }
    out[i] = sign | (e << 10) | (m >>> 13);
  }
  return out;
}

export function fromFloat16(h: Uint16Array): Float32Array {
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const s = h[i] & 0x8000 ? -1 : 1, e = (h[i] >> 10) & 0x1f, m = h[i] & 0x3ff;
    out[i] = e === 0 ? s * m * 2 ** -24 : e === 31 ? s * Infinity : s * (1 + m / 1024) * 2 ** (e - 15);
  }
  return out;
}
