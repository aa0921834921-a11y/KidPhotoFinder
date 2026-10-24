/**
 * 回憶星空、刮刮樂用的字：
 * - 標題、星座名稱、說明用明體（思源宋體 Noto Serif，SIL OFL 授權，只放這兩頁固定會用到的字，所以檔案很小）
 * - 活動名稱這種不固定的字還是用 App 原本的字型（title / round），才不會缺字
 * 其他語言用手機內建的襯線字。
 */
import { useFonts } from 'expo-font';
import { Platform, type TextStyle } from 'react-native';
import { getLang } from '../../../i18n';

export type MemFont = { title: TextStyle; round: TextStyle; serif: TextStyle; serifR: TextStyle };
export type SerifFont = { serif: TextStyle; serifR: TextStyle; latin: boolean };

const SYS_SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
// 同一個物件（畫面用 memo，字型物件不能每次都換新的）
const TC: SerifFont = { serif: { fontFamily: 'MemSerifTC', fontWeight: 'normal' }, serifR: { fontFamily: 'MemSerifTCR', fontWeight: 'normal' }, latin: false };
const SC: SerifFont = { serif: { fontFamily: 'MemSerifSC', fontWeight: 'normal' }, serifR: { fontFamily: 'MemSerifSCR', fontWeight: 'normal' }, latin: false };
const SYS_CJK: SerifFont = { serif: { fontFamily: SYS_SERIF, fontWeight: '600' }, serifR: { fontFamily: SYS_SERIF, fontWeight: 'normal' }, latin: false };
const SYS_LATIN: SerifFont = { serif: { fontFamily: SYS_SERIF, fontWeight: '600' }, serifR: { fontFamily: SYS_SERIF, fontWeight: 'normal' }, latin: true };

export function useSerif(): SerifFont {
  const [ok] = useFonts({
    MemSerifTC: require('../../../../assets/fonts/NotoSerifTC-SemiBold-mem.ttf'),
    MemSerifTCR: require('../../../../assets/fonts/NotoSerifTC-Regular-mem.ttf'),
    MemSerifSC: require('../../../../assets/fonts/NotoSerifSC-SemiBold-mem.ttf'),
    MemSerifSCR: require('../../../../assets/fonts/NotoSerifSC-Regular-mem.ttf'),
  });
  const lang = getLang();
  if (lang === 'zh-Hant') return ok ? TC : SYS_CJK;
  if (lang === 'zh-Hans') return ok ? SC : SYS_CJK;
  return SYS_LATIN;
}
