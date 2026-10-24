/**
 * 每天一張刮刮卡：
 * - 先找「去年的今天」（資料夾名稱寫了日期的活動，例如「1018 運動會」），再找兩年、三年…前的今天
 * - 沒有的話找那幾年的「這幾天」（前後 3 天）
 * - 都沒有，就是「今天的隨機回憶」（盡量兩週以前、最近抽過的不要再抽）；這時不會說是去年的今天
 * - 同一天（手機的日期）再打開還是同一張，刮痕也留著；每個孩子各一張
 * 存在資料庫的 meta（mem_scratch_v1），不動原本的資料。示範模式只放在記憶體裡。
 */
import * as TM from '../../core/timeMachine';
import * as DB from '../../services/db';
import type { Memory } from './data';

export type ScratchKind = 'exact' | 'near' | 'random';
export type DailyCard = {
  memId: string;
  kind: ScratchKind;
  /** 幾年前（random 時是 0） */
  years: number;
  revealed: boolean;
  /** 刮痕：每一筆是 [x0, y0, x1, y1, …]（銀箔單位） */
  strokes: number[][];
};
type Store = { date: string; cards: Record<string, DailyCard>; hist: string[] };

const KEY = 'mem_scratch_v1';
let demoStore: Store | null = null;

const pad = (n: number) => String(n).padStart(2, '0');
export const todayStr = (d = new Date()) => TM.ymd(d);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;

async function read(demo: boolean): Promise<Store> {
  if (demo) return demoStore ? JSON.parse(JSON.stringify(demoStore)) : { date: '', cards: {}, hist: [] };
  try {
    const v = await DB.getMeta(KEY);
    const s = v ? (JSON.parse(v) as Store) : null;
    if (s && typeof s.date === 'string' && s.cards) return { date: s.date, cards: s.cards, hist: s.hist || [] };
  } catch {}
  return { date: '', cards: {}, hist: [] };
}

async function write(demo: boolean, s: Store) {
  if (demo) { demoStore = s; return; }
  await DB.setMeta(KEY, JSON.stringify(s)).catch(() => {});
}

/** 選今天的回憶（純計算，方便測試） */
export function pickMemory(items: Memory[], today: Date, avoid: Set<string>, rnd = Math.random): { m: Memory; kind: ScratchKind; years: number } | null {
  if (!items.length) return null;
  const y = today.getFullYear(), mo = today.getMonth() + 1, d = today.getDate();
  const trusted = items.filter((m) => m.trusted);
  const most = (list: Memory[]) => [...list].sort((a, b) => b.photos.length - a.photos.length)[0];
  // 1) 幾年前的今天（2/29：平年用 2/28；今天是 2/28 時也看閏年的 2/29）
  for (let k = 1; k <= 6; k++) {
    const yy = y - k;
    const days = new Set<string>();
    if (mo === 2 && d === 29 && !isLeap(yy)) days.add(`${yy}-02-28`);
    else days.add(`${yy}-${pad(mo)}-${pad(d)}`);
    if (mo === 2 && d === 28 && !isLeap(y) && isLeap(yy)) days.add(`${yy}-02-29`);
    const list = trusted.filter((m) => days.has(m.day));
    if (list.length) return { m: most(list), kind: 'exact', years: k };
  }
  // 2) 幾年前的這幾天（前後 3 天）
  for (let k = 1; k <= 6; k++) {
    const yy = y - k;
    const center = dayNum(`${yy}-${pad(mo)}-${pad(mo === 2 && d === 29 && !isLeap(yy) ? 28 : d)}`);
    const list = trusted.filter((m) => Math.abs(dayNum(m.day) - center) <= 3);
    if (list.length) {
      list.sort((a, b) => Math.abs(dayNum(a.day) - center) - Math.abs(dayNum(b.day) - center) || b.photos.length - a.photos.length);
      return { m: list[0], kind: 'near', years: k };
    }
  }
  // 3) 隨機：兩週以前的、最近沒抽過的
  const cut = dayNum(TM.ymd(today)) - 14;
  let pool = items.filter((m) => !avoid.has(m.id) && dayNum(m.day) <= cut);
  if (!pool.length) pool = items.filter((m) => !avoid.has(m.id));
  if (!pool.length) pool = items;
  return { m: pool[Math.floor(rnd() * pool.length)], kind: 'random', years: 0 };
}

/** 今天的卡（沒有就抽一張並記住） */
export async function todayCard(items: Memory[], kid: string, demo: boolean, now = new Date()): Promise<{ card: DailyCard; m: Memory } | null> {
  if (!items.length) return null;
  const st = await read(demo);
  const date = todayStr(now);
  const s: Store = st.date === date ? st : { date, cards: {}, hist: st.hist };
  const ex = s.cards[kid];
  const m0 = ex && items.find((x) => x.id === ex.memId);
  if (ex && m0) return { card: ex, m: m0 };
  const p = pickMemory(items, now, new Set(s.hist.slice(-20)));
  if (!p) return null;
  const card: DailyCard = { memId: p.m.id, kind: p.kind, years: p.years, revealed: false, strokes: [] };
  s.cards[kid] = card;
  s.hist = [...s.hist.filter((h) => h !== p.m.id), p.m.id].slice(-40);
  await write(demo, s);
  return { card, m: p.m };
}

export async function saveCard(kid: string, card: DailyCard, demo: boolean, now = new Date()) {
  const st = await read(demo);
  const date = todayStr(now);
  const s: Store = st.date === date ? st : { date, cards: {}, hist: st.hist };
  s.cards[kid] = card;
  await write(demo, s);
}

/** 示範模式的「換一張」：抽另一個回憶，刮痕清掉 */
export async function swapDemoCard(items: Memory[], kid: string, current: string): Promise<{ card: DailyCard; m: Memory } | null> {
  const others = items.filter((m) => m.id !== current);
  if (!others.length) return null;
  const m = others[Math.floor(Math.random() * others.length)];
  const p = pickMemory([m], new Date(), new Set());
  const card: DailyCard = { memId: m.id, kind: p?.kind || 'random', years: p?.years || 0, revealed: false, strokes: [] };
  await saveCard(kid, card, true);
  return { card, m };
}

/** 回憶玩法的小卡：今天打開過了沒 */
export async function openedToday(now = new Date()): Promise<boolean> {
  const st = await read(false);
  return st.date === todayStr(now) && Object.values(st.cards).some((c) => c.revealed);
}
