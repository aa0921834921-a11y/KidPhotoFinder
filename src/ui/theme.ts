/**
 * 主題（像 LINE 主題一樣可以換）：水彩手帳、簡約清爽、星空晚安、糖果泡泡、翻頁故事書。
 * 畫面用 useTheme() 拿到目前主題；makeStyles() 依主題產生樣式。換主題會記在手機裡。
 */
import { useSyncExternalStore } from 'react';
import { Platform, type TextStyle } from 'react-native';
import { getLang, onLangChange } from '../i18n';
import { getMeta, setMeta } from '../services/db';

export type ThemeId = 'watercolor' | 'minimal' | 'starry' | 'candy' | 'book';

export type Colors = {
  bg: string; card: string; card2: string;
  ink: string; ink2: string; muted: string; line: string; dash: string;
  accent: string; accentDeep: string; accentWash: string; onAccent: string; accentPress: string;
  yes: string; yesWash: string; yesPress: string; no: string; noDeep: string; skip: string;
  tan: string; note: string; noteLine: string; tab: string; tabLine: string; pol: string; polCap: string;
  rib: string; ribText: string; segOn: string; segOnText: string;
  ic: [string, string, string, string];
  // 標題類
  coverTitle: string; coverEm: string; heart: string; lead: string; eyebrow: string;
  tagBg: string; tagText: string; chapTitle: string; chapOv: string; calloutTitle: string;
  headTitle: string; groupTitle: string; statNum: string; overlay: string; toastBg: string; toastText: string;
};

export type Theme = {
  id: ThemeId;
  name: string;
  desc: string;
  dark: boolean;
  c: Colors;
  /** 圓體字（簡約清爽用系統字） */
  round: TextStyle;
  /** 標題字 */
  title: TextStyle;
  /** 數字字 */
  num: TextStyle;
  /** 卡片圓角 */
  radius: { tl: number; tr: number; br: number; bl: number };
  /** 卡片陰影（CSS 寫法） */
  shadow: string;
  /** 小東西的陰影 */
  shadowSm: string;
  /** 拍立得會不會歪一點、有沒有紙膠帶和手寫說明 */
  tilt: boolean;
  tape: 'washi' | 'candy' | 'none';
  captions: boolean;
  /** 卡片邊框粗細 */
  border: number;
  /** 裝飾插畫的種類 */
  art: 'watercolor' | 'minimal' | 'starry' | 'candy';
};

const HUNINN = 'Huninn';
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
/** 手機內建的字（粉圓體沒有簡體字，簡體中文改用這個，才不會一句話裡混兩種字） */
export const SYSTEM_FONT = Platform.select({
  ios: 'System', android: 'sans-serif',
  default: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
});

const watercolor: Theme = {
  id: 'watercolor', name: '水彩手帳', desc: '溫暖水彩、拍立得', dark: false,
  c: {
    bg: '#F8F0E3', card: '#FFFAF1', card2: '#FFFDF7',
    ink: '#654639', ink2: '#7A5A4C', muted: '#84695B', line: '#E6D4BD', dash: '#DCC0A6',
    accent: '#C27A7C', accentDeep: '#A0505B', accentWash: '#F9E1DA', onAccent: '#FFFFFF', accentPress: '#A4625F',
    yes: '#6F906E', yesWash: '#E6EFDF', yesPress: '#57755A', no: '#C27A7C', noDeep: '#A0505B', skip: '#C7B6A6',
    tan: '#B07E45', note: '#FDF1E6', noteLine: '#E8CBBB', tab: '#FFF9EE', tabLine: '#EAD9C4', pol: '#FFFDF6', polCap: '#8C7364',
    rib: '#C98586', ribText: '#FFFFFF', segOn: '#C27A7C', segOnText: '#FFFFFF',
    ic: ['#F6D9D0', '#F8E3DE', '#E1EAD6', '#F7E6C7'],
    coverTitle: '#6E4436', coverEm: '#C27A7C', heart: '#C27A7C', lead: '#8A6A58', eyebrow: '#B2796F',
    tagBg: 'rgba(237,188,171,0.45)', tagText: '#9C5F5A', chapTitle: '#9A605D', chapOv: '#B68D7C', calloutTitle: '#915D5B',
    headTitle: '#654639', groupTitle: '#885B52', statNum: '#654639', overlay: 'rgba(30,20,15,0.45)', toastBg: '#654639', toastText: '#FFF6EA',
  },
  round: { fontFamily: HUNINN }, title: { fontFamily: HUNINN }, num: { fontFamily: SERIF, fontWeight: '700' },
  radius: { tl: 10, tr: 15, br: 13, bl: 11 },
  shadow: '0px 8px 18px rgba(138,103,68,0.14)', shadowSm: '0px 4px 10px rgba(104,69,43,0.16)',
  tilt: true, tape: 'washi', captions: true, border: 1, art: 'watercolor',
};

const minimal: Theme = {
  id: 'minimal', name: '簡約清爽', desc: '白底薄荷綠，最清楚', dark: false,
  c: {
    bg: '#F3F6F5', card: '#FFFFFF', card2: '#FFFFFF',
    ink: '#1F2D2A', ink2: '#34443F', muted: '#5D6B66', line: '#E3E9E6', dash: '#D3DDD8',
    accent: '#24845F', accentDeep: '#1D6E4F', accentWash: '#E4F3EC', onAccent: '#FFFFFF', accentPress: '#1A6649',
    yes: '#24845F', yesWash: '#E4F3EC', yesPress: '#1A6649', no: '#D2513F', noDeep: '#B63F2F', skip: '#AEB9B4',
    tan: '#A26F1E', note: '#EEF6F2', noteLine: '#D7EADF', tab: '#FFFFFF', tabLine: '#E3E9E6', pol: '#FFFFFF', polCap: '#5D6B66',
    rib: '#24845F', ribText: '#FFFFFF', segOn: '#24845F', segOnText: '#FFFFFF',
    ic: ['#E4F3EC', '#FDECEA', '#E8F0FB', '#FBF1DE'],
    coverTitle: '#1F2D2A', coverEm: '#24845F', heart: '#24845F', lead: '#34443F', eyebrow: '#24845F',
    tagBg: '#E4F3EC', tagText: '#1D6E4F', chapTitle: '#1F2D2A', chapOv: '#24845F', calloutTitle: '#1F2D2A',
    headTitle: '#1F2D2A', groupTitle: '#1F2D2A', statNum: '#1F2D2A', overlay: 'rgba(16,30,26,0.45)', toastBg: '#1F2D2A', toastText: '#FFFFFF',
  },
  round: {}, title: { fontWeight: '700' }, num: { fontWeight: '700' },
  radius: { tl: 18, tr: 18, br: 18, bl: 18 },
  shadow: '0px 1px 2px rgba(16,40,32,0.05), 0px 8px 20px rgba(16,40,32,0.06)', shadowSm: '0px 2px 6px rgba(16,40,32,0.08)',
  tilt: false, tape: 'none', captions: false, border: 0, art: 'minimal',
};

const starry: Theme = {
  id: 'starry', name: '星空晚安', desc: '深藍夜空，晚上不刺眼', dark: true,
  c: {
    bg: '#121834', card: '#1C2448', card2: '#222B54',
    ink: '#EEF0FF', ink2: '#D3D7F3', muted: '#A6ACD2', line: '#323C6A', dash: '#3E4880',
    accent: '#F4C96B', accentDeep: '#FFD98A', accentWash: '#2C3160', onAccent: '#2B2008', accentPress: '#C9A04D',
    yes: '#8FD9B6', yesWash: '#1E3A3B', yesPress: '#5FA886', no: '#FF8B9B', noDeep: '#FFB3BF', skip: '#5A6294',
    tan: '#F4C96B', note: '#252C5C', noteLine: '#3C4580', tab: '#0E132A', tabLine: '#2A335E', pol: '#F6F2FF', polCap: '#5B5A86',
    rib: '#B9AEFF', ribText: '#16163A', segOn: '#B9AEFF', segOnText: '#16163A',
    ic: ['#2B3168', '#3A2B5E', '#1F3D45', '#3A3424'],
    coverTitle: '#F3F4FF', coverEm: '#C3B8FF', heart: '#FF9FB0', lead: '#D3D7F3', eyebrow: '#C3B8FF',
    tagBg: 'rgba(185,174,255,0.18)', tagText: '#FFE2A3', chapTitle: '#FFE2A3', chapOv: '#C3B8FF', calloutTitle: '#FFE2A3',
    headTitle: '#FFE2A3', groupTitle: '#EEF0FF', statNum: '#FFE2A3', overlay: 'rgba(4,6,20,0.6)', toastBg: '#EEF0FF', toastText: '#121834',
  },
  round: { fontFamily: HUNINN }, title: { fontFamily: HUNINN }, num: { fontFamily: SERIF, fontWeight: '700' },
  radius: { tl: 20, tr: 20, br: 20, bl: 20 },
  shadow: '0px 12px 28px rgba(0,0,0,0.32)', shadowSm: '0px 4px 12px rgba(0,0,0,0.3)',
  tilt: false, tape: 'none', captions: false, border: 1, art: 'starry',
};

const candy: Theme = {
  id: 'candy', name: '糖果泡泡', desc: '粉紅圓點，活潑可愛', dark: false,
  c: {
    bg: '#FFF3F8', card: '#FFFFFF', card2: '#FFFFFF',
    ink: '#4A3A5C', ink2: '#5A4A6D', muted: '#766887', line: '#F3D6E6', dash: '#F2C6DA',
    accent: '#E0528A', accentDeep: '#C23E73', accentWash: '#FFE4EF', onAccent: '#FFFFFF', accentPress: '#C23E73',
    yes: '#1F9A80', yesWash: '#DDF6EF', yesPress: '#157562', no: '#E0528A', noDeep: '#C23E73', skip: '#CDB8C9',
    tan: '#A8740A', note: '#FFF4D6', noteLine: '#FFD36B', tab: '#FFFFFF', tabLine: '#F3D6E6', pol: '#FFFFFF', polCap: '#766887',
    rib: '#7CC6FF', ribText: '#0F3556', segOn: '#7CC6FF', segOnText: '#0F3556',
    ic: ['#FFE4EF', '#E3F2FF', '#DDF6EF', '#FFF1CC'],
    coverTitle: '#4A3A5C', coverEm: '#E0528A', heart: '#E0528A', lead: '#5A4A6D', eyebrow: '#7CA8D8',
    tagBg: '#E4F4FF', tagText: '#2F78B8', chapTitle: '#C23E73', chapOv: '#7CA8D8', calloutTitle: '#4A3A5C',
    headTitle: '#C23E73', groupTitle: '#4A3A5C', statNum: '#4A3A5C', overlay: 'rgba(60,30,50,0.4)', toastBg: '#4A3A5C', toastText: '#FFFFFF',
  },
  round: { fontFamily: HUNINN }, title: { fontFamily: HUNINN }, num: { fontFamily: SERIF, fontWeight: '700' },
  radius: { tl: 24, tr: 24, br: 24, bl: 24 },
  shadow: '0px 5px 0px #F4CDE0', shadowSm: '0px 4px 0px #F4CDE0',
  tilt: true, tape: 'candy', captions: true, border: 2, art: 'candy',
};

const book: Theme = {
  ...watercolor,
  id: 'book', name: '翻頁故事書', desc: '換頁時真的會翻頁',
  c: {
    ...watercolor.c,
    bg: '#FFF9EE', card: 'rgba(255,251,243,0.94)',
    ink: '#5E3F33', ink2: '#6E4B3E', muted: '#7F6455', line: '#EAD6C1', dash: '#DFC3AA',
    accent: '#C46F78', accentDeep: '#A4515C', accentWash: '#F9E1DC', accentPress: '#A4515C',
    yes: '#6C9273', yesWash: '#E6EFE2', yesPress: '#56785C', no: '#C06F77', noDeep: '#A4515C',
    tan: '#A9773F', note: '#FDF0E6', tab: 'transparent', headTitle: '#5E3F33', toastBg: '#5E3F33',
  },
  radius: { tl: 9, tr: 14, br: 12, bl: 10 },
  shadow: '0px 6px 14px rgba(120,82,58,0.12)',
};

export const THEMES: Record<ThemeId, Theme> = { watercolor, minimal, starry, candy, book };
export const THEME_ORDER: ThemeId[] = ['watercolor', 'minimal', 'starry', 'candy', 'book'];

/* ---------------------------------------------------------------- 目前主題（全域、會記住） */

let current: ThemeId = 'watercolor';
const listeners = new Set<() => void>();

/** 簡體中文：把粉圓體換成手機內建的字（同一個主題只做一次） */
const sysVariants = new Map<ThemeId, Theme>();
function forLang(base: Theme): Theme {
  if (getLang() !== 'zh-Hans') return base;
  let v = sysVariants.get(base.id);
  if (!v) {
    const fix = (s: TextStyle, weight?: TextStyle['fontWeight']): TextStyle =>
      s.fontFamily === HUNINN ? { ...s, fontFamily: SYSTEM_FONT, ...(weight ? { fontWeight: weight } : null) } : s;
    v = { ...base, round: fix(base.round), title: fix(base.title, '600') };
    sysVariants.set(base.id, v);
  }
  return v;
}

export const getTheme = () => forLang(THEMES[current]);

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => forLang(THEMES[current]),
  );
}

// 換語言時字型可能跟著換，讓畫面重新排版
onLangChange(() => listeners.forEach((l) => l()));

export function setTheme(id: ThemeId) {
  if (!THEMES[id] || id === current) return;
  current = id;
  listeners.forEach((l) => l());
  setMeta('theme', id).catch(() => {});
}

/** App 一開始先讀出上次選的主題，避免畫面先閃一下預設主題 */
export async function loadTheme() {
  const v = (await getMeta('theme').catch(() => null)) as ThemeId | null;
  if (v && THEMES[v]) current = v;
}

/** 依主題產生樣式；同一個主題（和字型）只算一次 */
export function makeStyles<T>(fn: (t: Theme) => T): () => T {
  const cache = new Map<Theme, T>();
  return () => {
    const t = useTheme();
    let v = cache.get(t);
    if (!v) { v = fn(t); cache.set(t, v); }
    return v;
  };
}

/** 卡片圓角（水彩/故事書四個角不一樣，像手撕的紙） */
export const radii = (t: Theme, k = 1) => ({
  borderTopLeftRadius: t.radius.tl * k, borderTopRightRadius: t.radius.tr * k,
  borderBottomRightRadius: t.radius.br * k, borderBottomLeftRadius: t.radius.bl * k,
});

/** 舊程式還在用的常數 */
export const F = { round: HUNINN };
export const R = { s: 8, m: 14, l: 20, xl: 26 };
