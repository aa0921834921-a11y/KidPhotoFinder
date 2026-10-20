/**
 * 新照片通知的設定怎麼解讀（通知、背景檢查、設定畫面共用）。
 * 這裡只有計算和文字，不碰手機功能。
 */
import { tr, type TStrKey } from '../i18n';
import type { Settings } from './db';

/** 多久看一次老師的資料夾（分鐘） */
export const checkEvery = (freq: unknown): 15 | 30 | 60 => (freq === 15 || freq === 60 ? freq : 30);

export const EVERY_OPTIONS: { k: 15 | 30 | 60; label: TStrKey; desc: TStrKey; word: TStrKey }[] = [
  { k: 15, label: 'nset.f15', desc: 'nset.f15d', word: 'nset.w15' },
  { k: 30, label: 'nset.f30', desc: 'nset.f30d', word: 'nset.w30' },
  { k: 60, label: 'nset.f60', desc: 'nset.f60d', word: 'nset.w60' },
];

/** 句子裡的「每 30 分鐘」 */
export const everyWord = (s: Pick<Settings, 'freq'>) => tr(EVERY_OPTIONS.find((o) => o.k === checkEvery(s.freq))!.word);

const hour = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 24 ? Math.floor(v) : d);

/** 通知時段（幾點到幾點） */
export const dayHours = (s: Pick<Settings, 'dayFrom' | 'dayTo'>) => ({ from: hour(s.dayFrom, 7), to: hour(s.dayTo, 21) });

/** 「早上 7:00 到晚上 9:00」或「全天都通知」 */
export const hoursText = (s: Pick<Settings, 'quiet' | 'dayFrom' | 'dayTo'>) => (s.quiet ? tr('nset.hoursRange', dayHours(s)) : tr('nset.allDay'));

/** 現在是不是通知時段以外（晚上不吵家長） */
export function quietNow(s: Pick<Settings, 'quiet' | 'dayFrom' | 'dayTo'>, d = new Date()): boolean {
  if (!s.quiet) return false;
  const { from, to } = dayHours(s);
  const h = d.getHours();
  if (from === to) return false;
  return from < to ? h < from || h >= to : h < from && h >= to;
}

/** 通知裡怎麼稱呼孩子（沒填小名就寫「孩子」） */
export const kidName = (s: Pick<Settings, 'childName'>) => (s.childName || '').trim() || tr('ntf.kid');
