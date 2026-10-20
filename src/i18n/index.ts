/**
 * 多語系：繁體中文、简体中文、English、Bahasa Indonesia、Tiếng Việt。
 * - 文字用 tr('鍵', 參數) 拿；畫面裡先呼叫 useLang()，換語言時才會重畫
 * - 第一次打開時依手機語言先選好，家長在首次設定或「設定」裡都可以換，換了馬上生效、會記住
 * - 每一種語言的檔案都要有全部的鍵（少一個打包就會失敗），以繁體中文為準
 */
import { useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';
import { getMeta, getSettings, setMeta } from '../services/db';
import en from './en';
import id from './id';
import vi from './vi';
import zhHans from './zh-Hans';
import zhHant, { type Dict } from './zh-Hant';

export type Lang = 'zh-Hant' | 'zh-Hans' | 'en' | 'id' | 'vi';

/** 選單上的順序；name 用那個語言自己寫，看不懂中文的家長也找得到 */
export const LANGS: { k: Lang; name: string; hint: string }[] = [
  { k: 'zh-Hant', name: '繁體中文', hint: 'Traditional Chinese' },
  { k: 'zh-Hans', name: '简体中文', hint: 'Simplified Chinese' },
  { k: 'en', name: 'English', hint: '英文' },
  { k: 'id', name: 'Bahasa Indonesia', hint: 'Indonesian · 印尼文' },
  { k: 'vi', name: 'Tiếng Việt', hint: 'Vietnamese · 越南文' },
];

const DICTS: Record<Lang, Dict> = { 'zh-Hant': zhHant, 'zh-Hans': zhHans, en, id, vi };
const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in DICTS;

/* ---------------------------------------------------------------- 手機的語言 */

function deviceLocale(): string {
  try {
    const c = (I18nManager as any).getConstants?.();
    if (c?.localeIdentifier) return String(c.localeIdentifier); // Android：例如 zh_TW_#Hant
  } catch {}
  try {
    const l = Intl.DateTimeFormat().resolvedOptions().locale;
    if (l) return l;
  } catch {}
  try {
    return String((globalThis as any).navigator?.language || '');
  } catch {}
  return '';
}

/** 依手機語言猜一個；都不是這五種的話用英文（台灣的手機通常是繁體中文） */
export function detectLang(): Lang {
  const l = deviceLocale().replace(/_/g, '-').toLowerCase();
  if (!l) return 'zh-Hant';
  if (l.startsWith('zh')) return /hans|-cn\b|-sg\b|-my\b/.test(l) ? 'zh-Hans' : 'zh-Hant';
  if (l.startsWith('vi')) return 'vi';
  if (l.startsWith('id') || l.startsWith('in')) return 'id'; // 舊版 Android 印尼文是 "in"
  if (l.startsWith('en')) return 'en';
  return 'en';
}

/* ---------------------------------------------------------------- 目前的語言（全域、會記住） */

let cur: Lang = detectLang();
let chosen = false; // 家長自己選過（或之前存過）
const listeners = new Set<() => void>();

export const getLang = () => cur;
/** 是不是家長自己選過語言（沒選過的話，首次設定會先問） */
export const langChosen = () => chosen;
/** 中文（字比較短、標題可以大一點） */
export const isCJK = () => cur === 'zh-Hant' || cur === 'zh-Hans';
/** 字和字中間的空白：中文用全形空白，其他語言用一般空白 */
export const sp = () => (isCJK() ? '　' : '  ');

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => cur,
  );
}

/** 換語言時要做的其他事（例如通知分類的名字） */
export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLang(l: Lang) {
  if (!isLang(l)) return;
  chosen = true;
  setMeta('lang', l).catch(() => {});
  if (l === cur) return;
  cur = l;
  listeners.forEach((fn) => fn());
}

/** App 一開始先讀出上次選的語言（背景自動整理時也會呼叫） */
export async function loadLang() {
  let v: unknown = await getMeta('lang').catch(() => null);
  if (!isLang(v)) {
    // 有多語系之前就已經在用的家長：維持原本的繁體中文（想換再到「設定 → 語言」），
    // 不要因為手機是英文介面，更新後畫面突然變成英文
    const s = await getSettings().catch(() => null);
    if (!s?.onboarded) return; // 新安裝：先依手機語言，首次設定第一頁會讓家長選
    v = 'zh-Hant';
    setMeta('lang', 'zh-Hant').catch(() => {});
  }
  chosen = true;
  if (v !== cur) { cur = v as Lang; listeners.forEach((fn) => fn()); }
}

/* ---------------------------------------------------------------- 拿文字 */

export type TKey = keyof Dict;
/** 不用參數的鍵（可以先放在表格裡，畫面上再拿文字） */
export type TStrKey = { [K in TKey]: Dict[K] extends string ? K : never }[TKey];
type Args<K extends TKey> = Dict[K] extends (p: infer P) => string ? [p: P] : [];

/** 例：tr('home.findNow')、tr('common.photos', { n: 3 }) */
export function tr<K extends TKey>(key: K, ...args: Args<K>): string {
  const v: unknown = (DICTS[cur] as any)[key] ?? (zhHant as any)[key];
  if (typeof v === 'function') return v(args[0]);
  return typeof v === 'string' ? v : String(key);
}
