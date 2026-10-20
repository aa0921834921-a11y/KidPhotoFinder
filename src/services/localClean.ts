/**
 * 整理 LINE（或手機裡任何相簿）下載的照片：
 *   1. 找出某個相簿裡「某個時間之後」新增的照片
 *   2. 找臉、跟孩子的參考照片比對（跟雲端照片用同一套判斷）
 *   3. 有孩子的 → 複製一份到「童年拾光」相簿
 *      不確定的 → 留著，放到「待確認」
 *      沒有孩子的 → 列進「可以刪除」清單，家長看過按確定才刪
 * 只會碰這個相簿、這段時間的照片；其他照片一張都不會動。
 */
import { File, Paths } from 'expo-file-system';
import { Album, Asset, AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { buildReferences, decide, THRESHOLDS } from '../core/decide';
import { tr } from '../i18n';
import * as DB from './db';
import { analyze, downloadModel, loadImage, modelReady } from './recognizer';
import { bump, setState } from './state';

export const LOCAL_PREFIX = 'local:';
export const isLocal = (fileId: string) => fileId.startsWith(LOCAL_PREFIX);
const assetIdOf = (fileId: string) => fileId.slice(LOCAL_PREFIX.length);

export type PhoneAlbum = { id: string; title: string; count: number; isLine: boolean };

/** 手機裡的相簿（LINE 的排最前面） */
export async function phoneAlbums(): Promise<PhoneAlbum[]> {
  const p = await requestPermissionsAsync(false, ['photo']);
  if (!p.granted) throw new Error(tr('err.needReadPerm'));
  const all = await Album.getAll();
  const out: PhoneAlbum[] = [];
  for (const a of all) {
    const [title, count] = await Promise.all([a.getTitle(), a.getAssetCount().catch(() => 0)]);
    if (!count) continue;
    out.push({ id: a.id, title, count, isLine: /line/i.test(title) });
  }
  return out.sort((a, b) => Number(b.isLine) - Number(a.isLine) || b.count - a.count);
}

/** 本機照片的縮圖網址（畫面顯示用） */
const uriCache = new Map<string, Promise<string>>();
export function localUri(fileId: string): Promise<string> {
  if (!uriCache.has(fileId)) {
    const job = new Asset(assetIdOf(fileId)).getUri();
    job.catch(() => uriCache.delete(fileId));
    uriCache.set(fileId, job);
  }
  return uriCache.get(fileId)!;
}

export type CleanPlan = {
  albumTitle: string;
  scanned: number;
  kept: number; // 有孩子、已收進童年拾光
  review: number; // 不確定，留著
  remove: { fileId: string; name: string }[]; // 可以刪除的
};

/** 把手機相簿裡的一張照片複製一份到 album（album 是 null 時先建在根目錄，由呼叫的人建相簿） */
export async function copyLocalToAlbum(fileId: string, name: string, album: Album | null): Promise<Asset> {
  const src = await new Asset(assetIdOf(fileId)).getUri();
  const tmp = new File(Paths.cache, `clean_${Date.now()}_${name.replace(/[\\/:*?"<>|]/g, '_')}`);
  new File(src).copy(tmp);
  try {
    return await Asset.create(tmp.uri, album || undefined);
  } finally {
    try { tmp.delete(); } catch {}
  }
}

let cancel = false;
export const stopClean = () => { cancel = true; };

/**
 * 掃描相簿裡 since 之後的照片，回傳整理結果（還不會刪任何東西）。
 */
export async function scanAlbum(albumId: string, since: number): Promise<CleanPlan> {
  cancel = false;
  const albums = await Album.getAll();
  const alb = albums.find((a) => a.id === albumId);
  if (!alb) throw new Error(tr('err.albumMissing'));
  const title = await alb.getTitle();
  setState({ running: true, phase: 'list', done: 0, total: 0, found: 0, eta: '', message: tr('clean.looking', { title }) });
  await activateKeepAwakeAsync('clean').catch(() => {});
  try {
    if (!modelReady()) {
      setState({ phase: 'model', message: tr('scan.downloadingModel') });
      await downloadModel((p) => setState({ modelProgress: p }));
    }
    const meta = await new Query().album(alb).eq(AssetField.MEDIA_TYPE, MediaType.IMAGE).gte(AssetField.CREATION_TIME, since).exeForMetadata();
    const known = await DB.localFileIds();
    const todo = meta.filter((m) => !known.has(LOCAL_PREFIX + m.id));
    setState({ phase: 'scan', total: todo.length, message: tr('scan.finding') });
    let found = 0;
    for (let i = 0; i < todo.length; i++) {
      if (cancel) break;
      const m = todo[i];
      const fileId = LOCAL_PREFIX + m.id;
      await DB.addLocalFile(fileId, m.filename || `IMG_${i}.jpg`, title, m.creationTime || Date.now(), albumId);
      try {
        const uri = await new Asset(m.id).getUri();
        const img = await loadImage(uri, 2048);
        const faces = await analyze(img);
        await DB.saveScan(fileId, faces.map((x) => ({ frame: -1, box: x.box, emb: x.emb })), img.w, img.h);
        if (faces.length) found++;
      } catch {
        await DB.markBad(fileId);
      }
      setState({ done: i + 1, found });
    }

    // 跟雲端照片一起判斷（家長的「是／不是」也會一起用上）
    setState({ phase: 'decide', message: tr('scan.deciding') });
    const st = await DB.getSettings();
    const [mThr, rThr] = THRESHOLDS[st.strictness] || THRESHOLDS.standard;
    const refs = await DB.listRefs();
    const { feats } = buildReferences(refs.map((r) => ({ id: r.id, faces: r.faces })));
    const { decisions } = decide(await DB.loadFaces(), feats, await DB.loadLabels(), mThr, rThr);
    await DB.saveDecisions(decisions);

    // 有孩子的複製到童年拾光相簿
    setState({ phase: 'save', message: tr('clean.saving') });
    const saved = await DB.savedMap();
    const locals = await DB.localFilesIn(albumId, since);
    let appAlbum = await Album.get(st.albumName);
    for (const f of locals) {
      const d = decisions.get(f.id);
      if (d?.kind !== 'match' || saved.has(f.id)) continue;
      try {
        const a = await copyLocalToAlbum(f.id, f.name, appAlbum);
        if (!appAlbum) appAlbum = await Album.create(st.albumName, [a], true);
        await DB.markSaved(f.id, a.id);
      } catch (e) {
        console.warn('copy failed', f.name, e);
      }
    }

    // 整理結果
    const labels = new Map((await DB.loadLabels()).map((l) => [l.faceId, l.label]));
    const savedNow = await DB.savedMap();
    let kept = 0, review = 0;
    const remove: CleanPlan['remove'] = [];
    for (const f of locals) {
      const d = decisions.get(f.id);
      if (d?.kind === 'match' || savedNow.has(f.id)) { kept++; continue; }
      if (d?.kind === 'review' && labels.get(d.faceId) !== -1) { review++; continue; }
      if (f.status === 'bad') continue; // 讀不到的照片不刪
      remove.push({ fileId: f.id, name: f.name });
    }
    await DB.setMeta('clean_last_' + albumId, String(Date.now()));
    return { albumTitle: title, scanned: todo.length, kept, review, remove };
  } finally {
    deactivateKeepAwake('clean');
    setState({ running: false, phase: 'idle', message: '' });
    setState({ counts: await DB.counts() });
    bump();
  }
}

/** 刪除家長確認過的照片（Android 會再跳出系統的確認視窗）。回傳實際刪掉的張數。 */
export async function deleteLocal(fileIds: string[]): Promise<number> {
  if (!fileIds.length) return 0;
  const assets = fileIds.map((id) => new Asset(assetIdOf(id)));
  await Asset.delete(assets); // 家長在系統視窗按取消會丟出錯誤
  await DB.forgetLocalFiles(fileIds);
  for (const id of fileIds) uriCache.delete(id);
  setState({ counts: await DB.counts() });
  bump();
  return fileIds.length;
}

/** 上次整理這個相簿的時間（第一次預設是 24 小時前） */
export async function lastCleanTime(albumId: string): Promise<number | null> {
  const v = await DB.getMeta('clean_last_' + albumId);
  return v ? Number(v) : null;
}
