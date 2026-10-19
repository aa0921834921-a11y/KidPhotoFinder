/**
 * 在手機上跑人臉模型（ONNX Runtime）。
 *  - YuNet（找臉，232 KB）隨 App 附上
 *  - w600k_r50（認臉，174 MB）第一次使用時下載，跟電腦版同一個檔案、會驗證 SHA-256
 */
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import type { InferenceSession } from 'onnxruntime-react-native';

// 辨識引擎用到時才載入：萬一原生模組沒裝好，只會在找照片時出錯，不會讓 App 一打開就閃退。
type Ort = typeof import('onnxruntime-react-native');
let ortMod: Ort | null = null;
function ort(): Ort {
  if (!ortMod) {
    try {
      ortMod = require('onnxruntime-react-native') as Ort;
    } catch (e: any) {
      throw new Error('辨識引擎載入失敗，請更新 App 後再試。（' + String(e?.message || e) + '）');
    }
  }
  return ortMod;
}
import {
  alignFace, detectFaces, embed, rgbaToBGR, type BGRImage, type Face, type YunetOutputs,
} from '../core/face';

const W600K_URL = 'https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/arcface_w600k_r50.onnx';
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

/** 下載辨識模型（約 174 MB）。progress: 0~1 */
export async function downloadModel(progress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  if (modelReady()) return;
  const dir = modelsDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const tmp = new File(dir, 'w600k_r50.download');
  if (tmp.exists) tmp.delete();
  await File.downloadFileAsync(W600K_URL, tmp, {
    idempotent: true,
    signal,
    onProgress: (d) => progress?.(d.totalBytes ? d.bytesWritten / d.totalBytes : 0),
  });
  const sha = (await tmp.digest('SHA-256')).toLowerCase();
  if (!W600K_SHA256.includes(sha)) {
    tmp.delete();
    throw new Error('下載的模型檔案不完整，請換個網路再試一次');
  }
  const dst = w600kFile();
  if (dst.exists) dst.delete();
  tmp.move(dst);
  okMark().write(sha);
}

let det: InferenceSession | null = null;
let rec: InferenceSession | null = null;

async function sessions() {
  if (!det) {
    const a = Asset.fromModule(require('../../assets/models/yunet_dyn.onnx'));
    await a.downloadAsync();
    det = await ort().InferenceSession.create(path(a.localUri || a.uri));
  }
  if (!rec) {
    if (!modelReady()) throw new Error('辨識模型還沒下載');
    rec = await ort().InferenceSession.create(path(w600kFile().uri), {
      executionProviders: ['coreml', 'nnapi', 'cpu'] as any,
    }).catch(() => ort().InferenceSession.create(path(w600kFile().uri)));
  }
  return { det: det!, rec: rec! };
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
  if (!sk) throw new Error('讀不到這張照片');
  const w = sk.width(), h = sk.height();
  const px = sk.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  try { new File(saved.uri).delete(); } catch {}
  if (!px) throw new Error('讀不到這張照片');
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
