/**
 * 在手機上跑人臉模型（ONNX Runtime）。
 *  - YuNet（找臉，232 KB）隨 App 附上
 *  - w600k_r50（認臉，174 MB）第一次使用時下載，跟電腦版同一個檔案、會驗證 SHA-256
 *    先從自己的 GitHub（kidphotofinder-models）下載；那裡下載不到才用原本的 FaceFusion 下載點
 */
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { Platform } from 'react-native';
import type { InferenceSession } from 'onnxruntime-react-native';
import { tr } from '../i18n';

// 辨識引擎用到時才載入：萬一原生模組沒裝好，只會在找照片時出錯，不會讓 App 一打開就閃退。
type Ort = typeof import('onnxruntime-react-native');
let ortMod: Ort | null = null;
function ort(): Ort {
  if (!ortMod) {
    try {
      ortMod = require('onnxruntime-react-native') as Ort;
    } catch (e: any) {
      throw new Error(tr('err.engine', { err: String(e?.message || e) }));
    }
  }
  return ortMod;
}
import {
  alignFace, detectFaces, embed, rgbaToBGR, type BGRImage, type Face, type YunetOutputs,
} from '../core/face';

/**
 * 認臉模型的下載點，照順序試；哪一個下載到的檔案都要通過下面的 SHA-256 檢查才會用（被改過的檔案不會用）。
 * 1. 自己的 GitHub 公開專案 kidphotofinder-models 的 Release（標籤 w600k-v1，檔名 w600k_r50.onnx）：主要的下載點
 * 2. 原本的下載點（FaceFusion 在 GitHub 轉存的 InsightFace w600k_r50）：自己的下載不到時才用
 * InsightFace 的預訓練模型只開放非商業研究使用：https://github.com/deepinsight/insightface#license
 */
const W600K_URLS = [
  'https://github.com/aa0921834921-a11y/kidphotofinder-models/releases/download/w600k-v1/w600k_r50.onnx',
  'https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/arcface_w600k_r50.onnx',
];
const W600K_SHA256 = [
  'f1f79dc3b0b79a69f94799af1fffebff09fbd78fd96a275fd8f0cbbea23270d1',
  '4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43',
];
export const W600K_MB = 174;

const modelsDir = () => new Directory(Paths.document, 'models');
const w600kFile = () => new File(modelsDir(), 'w600k_r50.onnx');
const okMark = () => new File(modelsDir(), 'w600k_r50.ok');
const path = (uri: string) => decodeURI(uri.replace(/^file:\/\//, ''));

export function modelReady(): boolean {
  return w600kFile().exists && okMark().exists;
}

/** 下載辨識模型（約 174 MB）。progress: 0~1。第一個下載點失敗（網址不見了、檔案不對）就換下一個 */
export async function downloadModel(progress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  if (modelReady()) return;
  const dir = modelsDir();
  if (!dir.exists) dir.create({ intermediates: true });
  let lastErr: unknown = null;
  for (const url of W600K_URLS) {
    const tmp = new File(dir, 'w600k_r50.download');
    const drop = () => { try { if (tmp.exists) tmp.delete(); } catch {} };
    drop();
    try {
      progress?.(0);
      await File.downloadFileAsync(url, tmp, {
        idempotent: true,
        signal,
        onProgress: (d) => progress?.(d.totalBytes ? d.bytesWritten / d.totalBytes : 0),
      });
      const sha = (await tmp.digest('SHA-256')).toLowerCase();
      if (!W600K_SHA256.includes(sha)) { drop(); lastErr = new Error(tr('err.modelBroken')); continue; }
      const dst = w600kFile();
      if (dst.exists) dst.delete();
      await tmp.move(dst); // 搬好了才寫「下載完成」的標記
      await okMark().write(sha);
      return;
    } catch (e) {
      drop();
      if (signal?.aborted) throw e; // 使用者取消：不要再試下一個
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(tr('err.modelBroken'));
}

let det: InferenceSession | null = null;
let rec: InferenceSession | null = null;

let loading: Promise<{ det: InferenceSession; rec: InferenceSession }> | null = null;

async function load() {
  if (!det) {
    const a = Asset.fromModule(require('../../assets/models/yunet_dyn.onnx'));
    await a.downloadAsync();
    det = await ort().InferenceSession.create(path(a.localUri || a.uri));
  }
  if (!rec) {
    if (!modelReady()) throw new Error(tr('err.modelMissing'));
    // Android 只用 CPU：NNAPI 在很多中低階手機上第一次要先「編譯」模型，反而慢很多（Android 15 起也已停用）
    const providers = Platform.OS === 'ios' ? ['coreml', 'cpu'] : ['cpu'];
    rec = await ort().InferenceSession.create(path(w600kFile().uri), {
      executionProviders: providers as any,
    }).catch(() => ort().InferenceSession.create(path(w600kFile().uri)));
  }
  return { det: det!, rec: rec! };
}

/** 同一時間只會載入一次（找臉和認臉同時要用時共用同一次載入） */
function sessions() {
  if (det && rec) return Promise.resolve({ det, rec });
  if (!loading) loading = load().finally(() => { loading = null; });
  return loading;
}

/** 辨識引擎是不是已經載入記憶體（第一次載入在較舊的手機上可能要幾十秒） */
export const engineReady = () => !!(det && rec);

/** 先在背景把辨識引擎載入，等一下用的時候就不用等。失敗不要緊，真的要用時會再試。 */
export function warmUp(): Promise<void> {
  if (!modelReady()) return Promise.resolve();
  return sessions().then(() => {}, () => {});
}

const runDet = async (input: Float32Array, h: number, w: number): Promise<YunetOutputs> => {
  const { det } = await sessions();
  const o = await det.run({ input: new (ort().Tensor)('float32', input, [1, 3, h, w]) });
  const r: YunetOutputs = {};
  for (const k of Object.keys(o)) r[k] = o[k].data as Float32Array;
  return r;
};

const runRec = async (x: Float32Array): Promise<Float32Array> => {
  const { rec } = await sessions();
  const o = await rec.run({ input: new (ort().Tensor)('float32', x, [1, 3, 112, 112]) });
  return Float32Array.from(o[Object.keys(o)[0]].data as Float32Array);
};

/* ---------------------------------------------------------------- 讀圖 */

/** 讀照片並縮到最長邊 maxSide（照片的旋轉資訊會先套用），回傳 BGR。 */
export async function loadImage(uri: string, maxSide = 2048): Promise<BGRImage> {
  const ctx = ImageManipulator.manipulate(uri);
  const first = await ctx.renderAsync();
  const { width, height } = first;
  let ref = first;
  if (Math.max(width, height) > maxSide) {
    const ctx2 = ImageManipulator.manipulate(uri);
    ctx2.resize(width >= height ? { width: maxSide } : { height: maxSide });
    ref = await ctx2.renderAsync();
  }
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
  const bytes = await new File(saved.uri).bytes();
  const sk = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!sk) throw new Error(tr('err.cantRead'));
  const w = sk.width(), h = sk.height();
  const px = sk.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  try { new File(saved.uri).delete(); } catch {}
  if (!px) throw new Error(tr('err.cantRead'));
  return rgbaToBGR(px as Uint8Array, w, h);
}

export type AnalyzedFace = Face & { emb: Float32Array };

/** 找臉 + 算特徵。flip：參考照片用左右翻轉平均，比較準。 */
export async function analyze(img: BGRImage, opts: { minFacePx?: number; flip?: boolean; maxFaces?: number } = {}):
  Promise<AnalyzedFace[]> {
  let faces = await detectFaces(img, runDet, opts.minFacePx ?? 32);
  if (opts.maxFaces && faces.length > opts.maxFaces) faces = faces.sort((a, b) => b.size - a.size).slice(0, opts.maxFaces);
  const out: AnalyzedFace[] = [];
  for (const f of faces) out.push({ ...f, emb: await embed(alignFace(img, f.kps), runRec, !!opts.flip) });
  return out;
}

/** 從照片裁出一張臉的小圖（確認頁面用），存成暫存 JPEG，回傳 uri。 */
export async function cropFace(uri: string, box: number[], imgW: number, imgH: number, out = 360): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const first = await ctx.renderAsync();
  const sx = first.width / imgW, sy = first.height / imgH;
  const [x, y, w, h] = box;
  const cx = (x + w / 2) * sx, cy = (y + h / 2) * sy, side = Math.max(w * sx, h * sy) * 1.8;
  const left = Math.max(0, cx - side / 2), top = Math.max(0, cy - side / 2);
  const c2 = ImageManipulator.manipulate(uri);
  c2.crop({ originX: left, originY: top, width: Math.min(side, first.width - left), height: Math.min(side, first.height - top) });
  c2.resize({ width: out });
  const r = await (await c2.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return r.uri;
}
