/**
 * 時光娃娃機的「收藏冊」：夾到、按「收進收藏冊」的照片，App 會記住（關掉 App 也還在）。
 * 只記照片 ID、回憶 ID、時間；收藏冊打開時再做小圖。示範模式只記在這一次（不會混進正式資料）。
 */
import { tr } from '../../../i18n';
import * as DB from '../../../services/db';
import type { MemoryData } from '../data';
import { dateLine, niceTitle, thumbOf } from './photos';

export type Kept = { id: string; mem: string; at: number; prop?: number };

const KEY = 'claw_album';
const MAX = 300;

export async function loadKept(): Promise<Kept[]> {
  try {
    const v = await DB.getMeta(KEY);
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

/** 加一張（同一張只留最新的一次）；回傳新的清單 */
export async function addKept(k: Kept, list?: Kept[]): Promise<Kept[]> {
  const cur = list ?? (await loadKept());
  const same = (x: Kept) => x.id === k.id && x.mem === k.mem && (x.prop ?? -1) === (k.prop ?? -1);
  const next = [k, ...cur.filter((x) => !same(x))].slice(0, MAX);
  await DB.setMeta(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

const PROP_IMG = ['a/prop_bear.webp', 'a/prop_train.webp'];
const PROP_NAME = () => [tr('claw.propBear'), tr('claw.propTrain')];

/** 收藏冊的內容（最新的在前面，最多 n 張）：小圖、活動名稱、日期 */
export async function albumItems(list: Kept[], data: MemoryData, n = 30): Promise<{ img: string; name: string; date: string }[]> {
  const mems = new Map(data.items.map((m) => [m.id, m]));
  const out: { img: string; name: string; date: string }[] = [];
  for (const k of list) {
    if (out.length >= n) break;
    if (k.prop != null && k.prop >= 0) {
      if (PROP_IMG[k.prop]) out.push({ img: PROP_IMG[k.prop], name: PROP_NAME()[k.prop], date: tr('claw.propLine') });
      continue;
    }
    const m = mems.get(k.mem);
    if (!m) continue; // 回憶已經不在了（照片被刪掉）
    const img = await thumbOf(data, m, k.id);
    if (img) out.push({ img, name: niceTitle(m.title), date: dateLine(m) });
  }
  return out;
}
