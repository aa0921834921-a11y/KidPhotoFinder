/**
 * 判斷每張照片裡有沒有自己的小孩（兄弟姊妹各自判斷，任何一個孩子確定就存進相簿）。
 * 雲端照片和 LINE 照片都用這裡。
 */
import { buildReferences, decide, THRESHOLDS } from '../core/decide';
import { AppState } from 'react-native';
import * as DB from './db';

/**
 * 判斷很久時讓畫面喘口氣：只在 App 開在前景時才停一下（讓你可以繼續按）。
 * 螢幕關掉、在背景時直接算完——那時候計時器可能不會跑，停下來等它反而會整個卡住。
 */
function screenYield() {
  let last = Date.now();
  return async () => {
    if (AppState.currentState !== 'active' || Date.now() - last < 12) return;
    await new Promise<void>((resolve) => {
      let sub: { remove: () => void } | null = null;
      const done = () => { clearTimeout(t); sub?.remove(); resolve(); };
      const t = setTimeout(done, 0);
      sub = AppState.addEventListener('change', (st) => { if (st !== 'active') done(); });
    });
    last = Date.now();
  };
}

/** 某個孩子的參考照片特徵（順便更新每張參考照片的狀態：可以用／合照／不像） */
export async function referenceFeatures(person = ''): Promise<Float32Array[]> {
  const refs = await DB.listRefs(person);
  const { feats, results } = buildReferences(refs.map((r) => ({ id: r.id, faces: r.faces })));
  for (const r of results) {
    const old = refs.find((x) => x.id === r.id);
    if (old && (old.status !== r.status || old.chosen !== (r.chosen ?? null))) await DB.setRefStatus(r.id, r.status, r.chosen ?? null);
  }
  return feats;
}

/** 每張照片最後的結果：任何一個孩子確定 → 確定；不然有待確認 → 待確認 */
export type FileDecision = { kind: 'match' | 'review'; score: number; faceId: number; person: string };

/** 用全部孩子的參考照片和家長的答案重新判斷，存進資料庫；回傳每張照片的結果 */
export async function judgeAll(): Promise<Map<string, FileDecision>> {
  const s = await DB.getSettings();
  const [m, r] = THRESHOLDS[s.strictness] || THRESHOLDS.standard;
  const faces = await DB.loadFaces();
  const kids = await DB.getKids();
  const all: DB.PersonDecision[] = [];
  const byFile = new Map<string, FileDecision>();
  for (const kid of kids) {
    const refs = await referenceFeatures(kid.key);
    if (!refs.length) continue;
    const { decisions } = await decide(faces, refs, await DB.loadLabels(kid.key), m, r, screenYield());
    for (const [fileId, d] of decisions) {
      all.push({ fileId, person: kid.key, kind: d.kind, score: d.score, faceId: d.faceId });
      const cur = byFile.get(fileId);
      const better = !cur || (d.kind === 'match' && cur.kind !== 'match') || (d.kind === cur.kind && d.score > cur.score);
      if (better) byFile.set(fileId, { ...d, person: kid.key });
    }
  }
  await DB.saveDecisions(all);
  return byFile;
}
