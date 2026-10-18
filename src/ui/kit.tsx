/** 共用元件：背景、卡片、按鈕、標題、進度條、臉的小圖……全部跟著目前主題變。 */
import { Image } from 'expo-image';
import React, { createContext, useContext } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { makeStyles, radii, useTheme, type Theme } from './theme';

export const art = {
  blooms: require('../../assets/art/watercolor-blooms.png'),
  leaves: require('../../assets/art/watercolor-leaves.png'),
  school: require('../../assets/art/watercolor-school.png'),
  children: require('../../assets/art/watercolor-children.png'),
  border: require('../../assets/art/botanical-border.png'),
};

/* ---------------------------------------------------------------- 背景 */

/** 整個畫面的底（每個主題不一樣） */
export function Backdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle(t), style]} />;
}

export function backdropStyle(t: Theme): ViewStyle {
  switch (t.id) {
    case 'starry':
      return {
        backgroundColor: t.c.bg,
        backgroundImage:
          'radial-gradient(circle at 24px 38px, rgba(255,255,255,0.85) 1.2px, transparent 1.7px),' +
          'radial-gradient(circle at 120px 90px, rgba(255,255,255,0.6) 1px, transparent 1.5px),' +
          'radial-gradient(circle at 200px 20px, rgba(255,233,176,0.9) 1.5px, transparent 2px),' +
          'radial-gradient(circle at 280px 140px, rgba(255,255,255,0.55) 1px, transparent 1.5px),' +
          'radial-gradient(circle at 60px 190px, rgba(255,255,255,0.7) 1px, transparent 1.5px),' +
          'radial-gradient(circle at 330px 230px, rgba(217,208,255,0.85) 1.3px, transparent 1.8px)',
        backgroundSize: '360px 260px',
        backgroundRepeat: 'repeat',
      } as ViewStyle;
    case 'candy':
      return {
        backgroundColor: t.c.bg,
        backgroundImage: 'radial-gradient(circle at 11px 11px, #FFD3E6 1.7px, transparent 2px)',
        backgroundSize: '22px 22px',
        backgroundRepeat: 'repeat',
      } as ViewStyle;
    case 'book':
      return {
        backgroundColor: '#C99A70',
        backgroundImage: 'linear-gradient(125deg, #D4A77D 0%, #CF9F72 45%, #BB8761 100%)',
      } as ViewStyle;
    case 'minimal':
      return { backgroundColor: t.c.bg };
    default:
      return {
        backgroundColor: t.c.bg,
        backgroundImage: 'radial-gradient(ellipse at 100% 0%, rgba(244,206,196,0.35) 0%, transparent 45%), radial-gradient(ellipse at 0% 100%, rgba(214,228,204,0.35) 0%, transparent 50%)',
      } as ViewStyle;
  }
}

/** 星空主題：右上角的夜光、左下角的紫色光暈 */
export function NightGlow() {
  const t = useTheme();
  if (t.id !== 'starry') return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
      backgroundImage: 'radial-gradient(ellipse at 85% -10%, rgba(61,65,143,0.6) 0%, transparent 55%), radial-gradient(ellipse at 0% 105%, rgba(67,48,122,0.45) 0%, transparent 50%)',
    } as ViewStyle]} />
  );
}

/** 分頁裡的畫面會由分頁框架畫背景；其他畫面自己畫 */
export const InTabs = createContext(false);

/**
 * 每個畫面的最外層。
 * - 一般主題：處理狀態列的空間
 * - 翻頁故事書（在分頁裡）：畫成一頁紙，有書脊陰影、折角和頁首小標
 */
export function Paper({ children, style, pad = true, cap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean; cap?: string }) {
  const ins = useSafeAreaInsets();
  const t = useTheme();
  const inTabs = useContext(InTabs);
  if (inTabs && t.id === 'book') {
    return (
      <View style={[stPage.page, style]}>
        {cap ? (
          <View style={stPage.cap}>
            <Text style={stPage.capFlower}>✿</Text>
            <Text style={stPage.capText}>{cap}</Text>
            <Text style={stPage.capHeart}>♡</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>{children}</View>
        <View pointerEvents="none" style={stPage.spine} />
        <View pointerEvents="none" style={stPage.dog} />
      </View>
    );
  }
  return (
    <View style={[{ flex: 1 }, !inTabs && { backgroundColor: t.c.bg }, pad && { paddingTop: ins.top }, style]}>
      {!inTabs ? <><Backdrop /><NightGlow /></> : null}
      {children}
    </View>
  );
}

const stPage = StyleSheet.create({
  page: {
    flex: 1, overflow: 'hidden', backgroundColor: '#FFF9EE',
    borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 10, borderBottomRightRadius: 10,
  },
  cap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 12, paddingBottom: 9, marginHorizontal: 18, borderBottomWidth: 1, borderColor: '#E2C9B5', borderStyle: 'dashed' },
  capText: { fontFamily: 'Huninn', fontSize: 16, color: '#8C6154' },
  capFlower: { fontSize: 14, color: '#E19E91' },
  capHeart: { fontSize: 14, color: '#E19E91' },
  spine: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 30,
    backgroundImage: 'linear-gradient(90deg, rgba(110,72,48,0.30) 0%, rgba(110,72,48,0.08) 45%, rgba(110,72,48,0) 100%)',
  } as ViewStyle,
  dog: {
    position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderTopLeftRadius: 6,
    backgroundImage: 'linear-gradient(315deg, rgba(0,0,0,0) 50%, #E9D3B6 50%, #D9B995 100%)',
    boxShadow: '-2px -2px 4px rgba(110,80,60,0.16)',
  } as ViewStyle,
});

/** 畫面內容可以用的寬度（扣掉左右留白；故事書還要扣掉木框） */
export function useContentWidth(pad = 16) {
  const { width } = useWindowDimensions();
  const t = useTheme();
  const inTabs = useContext(InTabs);
  return Math.min(width, 720) - (inTabs && t.id === 'book' ? 28 : 0) - pad * 2;
}

/** 虛線（iOS 不能只畫單邊虛線框，所以用 SVG 畫） */
export function DashLine({ vertical, color, style, length = 2000 }: { vertical?: boolean; color?: string; style?: StyleProp<ViewStyle>; length?: number }) {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={[vertical ? { width: 1, alignSelf: 'stretch', overflow: 'hidden' } : { height: 1, alignSelf: 'stretch', overflow: 'hidden' }, style]}>
      <Svg width={vertical ? 1 : length} height={vertical ? length : 1}>
        <Line x1={vertical ? 0.5 : 0} y1={vertical ? 0 : 0.5} x2={vertical ? 0.5 : length} y2={vertical ? length : 0.5}
          stroke={color || t.c.dash} strokeWidth={1} strokeDasharray="4 3" />
      </Svg>
    </View>
  );
}

/* ---------------------------------------------------------------- 卡片與文字 */

export function cardStyle(t: Theme): ViewStyle {
  return {
    backgroundColor: t.c.card, borderWidth: t.border, borderColor: t.c.line, ...radii(t),
    boxShadow: t.shadow,
  } as ViewStyle;
}

export function Card({ children, style, tint, pad = 18 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tint?: string; pad?: number }) {
  const t = useTheme();
  return <View style={[cardStyle(t), { padding: pad }, tint ? { backgroundColor: tint } : null, style]}>{children}</View>;
}

export function H1({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const s = useKit();
  return <Text style={[s.h1, style]} numberOfLines={numberOfLines}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const s = useKit();
  return <Text style={[s.h2, style]}>{children}</Text>;
}
export function P({ children, style, muted, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; numberOfLines?: number }) {
  const s = useKit();
  return <Text style={[s.p, muted && s.muted, style]} numberOfLines={numberOfLines}>{children}</Text>;
}
/** 圓體字的一般文字 */
export function T({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const s = useKit();
  return <Text style={[s.t, style]} numberOfLines={numberOfLines}>{children}</Text>;
}

/* ---------------------------------------------------------------- 按鈕 */

type BtnKind = 'primary' | 'ghost' | 'yes' | 'no' | 'soft';
export function Btn({ title, onPress, kind = 'primary', disabled, icon, style, busy, small, textStyle }: {
  title: string; onPress?: () => void; kind?: BtnKind; disabled?: boolean; icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>; busy?: boolean; small?: boolean; textStyle?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  const s = useKit();
  const k = btnKind(t, kind);
  return (
    <Pressable
      onPress={disabled || busy ? undefined : onPress}
      style={({ pressed }) => [s.btn, small && s.btnSm, k.box, (disabled || busy) && { opacity: 0.5 },
        pressed && { transform: [{ translateY: 2 }], boxShadow: k.pressed } as ViewStyle, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      {busy ? <ActivityIndicator color={k.text.color as string} /> : icon}
      <Text style={[s.btnText, small && s.btnTextSm, k.text, textStyle]}>{title}</Text>
    </Pressable>
  );
}

function btnKind(t: Theme, kind: BtnKind): { box: ViewStyle; text: TextStyle; pressed: string } {
  const c = t.c;
  switch (kind) {
    case 'primary':
      return { box: { backgroundColor: c.accent, boxShadow: `0px 4px 0px ${c.accentPress}${t.dark ? '' : `, 0px 10px 18px ${c.accent}44`}` } as ViewStyle, text: { color: c.onAccent }, pressed: `0px 1px 0px ${c.accentPress}` };
    case 'yes':
      return { box: { backgroundColor: c.yes, boxShadow: `0px 4px 0px ${c.yesPress}` } as ViewStyle, text: { color: t.dark ? '#10241C' : '#FFFFFF' }, pressed: `0px 1px 0px ${c.yesPress}` };
    case 'no':
      return { box: { backgroundColor: c.card2, borderWidth: 2, borderColor: c.no }, text: { color: c.noDeep }, pressed: 'none' };
    case 'soft':
      return { box: { backgroundColor: c.accentWash }, text: { color: c.accentDeep }, pressed: 'none' };
    default:
      return { box: { backgroundColor: c.card2, borderWidth: 1.5, borderColor: c.line }, text: { color: c.ink2 }, pressed: 'none' };
  }
}

/** 文字連結 */
export function Link({ title, onPress, color, style }: { title: string; onPress: () => void; color?: string; style?: StyleProp<TextStyle> }) {
  const s = useKit();
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [{ paddingVertical: 6, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[s.t, { color: color || t.c.accentDeep, fontSize: 14.5 }, style]}>{title}</Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- 其他小元件 */

export function Bar({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  const t = useTheme();
  const w = Math.round((indeterminate ? 0.34 : Math.max(0, Math.min(1, value))) * 100);
  return (
    <View style={{ height: 10, borderRadius: 99, backgroundColor: t.c.accentWash, overflow: 'hidden' }}>
      <View style={[{ height: '100%', width: `${w}%`, borderRadius: 99, backgroundColor: t.c.yes },
        t.id !== 'minimal' && { backgroundImage: `linear-gradient(90deg, ${t.id === 'starry' ? '#B9AEFF' : '#E6B3A6'}, ${t.c.yes})` } as ViewStyle]} />
    </View>
  );
}

/** 開關（顏色跟著主題） */
export function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label?: string }) {
  const t = useTheme();
  return (
    <Switch value={value} onValueChange={onValueChange} accessibilityLabel={label}
      trackColor={{ false: t.c.line, true: t.c.yes }} thumbColor="#FFFFFF" ios_backgroundColor={t.c.line} />
  );
}

/** 分段選擇（待確認／我標記過的） */
export function Seg<K extends string>({ items, value, onChange, style }: { items: { k: K; t: string }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const s = useKit();
  return (
    <View style={[s.seg, style]}>
      {items.map((x) => {
        const on = x.k === value;
        return (
          <Pressable key={x.k} onPress={() => onChange(x.k)} style={[s.segBtn, on && { backgroundColor: t.c.segOn, boxShadow: t.dark ? 'none' : '0px 2px 6px rgba(120,80,70,0.2)' } as ViewStyle]}
            accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.segText, on && { color: t.c.segOnText }]} numberOfLines={1}>{x.t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 從一張照片裡只露出某張臉（不用另外裁圖）。box 是在 imgW x imgH 座標裡。 */
export function FaceThumb({ uri, box, imgW, imgH, size, round, style, radius = 6 }: {
  uri: string | null; box: number[]; imgW: number; imgH: number; size: number; round?: boolean; style?: StyleProp<ViewStyle>; radius?: number;
}) {
  const t = useTheme();
  const [x, y, w, h] = box;
  const side = Math.max(w, h) * 1.7;
  const k = size / side;
  const left = -(x + w / 2 - side / 2) * k, top = -(y + h / 2 - side / 2) * k;
  return (
    <View style={[{ width: size, height: size, overflow: 'hidden', backgroundColor: t.c.line, borderRadius: round ? size / 2 : radius }, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ position: 'absolute', left, top, width: imgW * k, height: imgH * k }} contentFit="fill" transition={150} />
      ) : null}
    </View>
  );
}

/** 紙膠帶（水彩：半透明；糖果：條紋；其他主題不貼） */
export function Tape({ i = 0, style, w = 58, h = 17 }: { i?: number; style?: StyleProp<ViewStyle>; w?: number; h?: number }) {
  const t = useTheme();
  if (t.tape === 'none') return null;
  const washi = ['rgba(231,190,160,0.75)', 'rgba(160,192,152,0.7)', 'rgba(236,204,128,0.75)'];
  const candy = [['#FFB3CF', '#FFD3E3'], ['#9FDCEF', '#CBEEF8'], ['#FFD979', '#FFEBB3']];
  const rot = ['-4deg', '3deg', '-2deg'][i % 3];
  const look: ViewStyle = t.tape === 'candy'
    ? { backgroundImage: `linear-gradient(45deg, ${candy[i % 3][0]} 25%, ${candy[i % 3][1]} 25%, ${candy[i % 3][1]} 50%, ${candy[i % 3][0]} 50%, ${candy[i % 3][0]} 75%, ${candy[i % 3][1]} 75%)`, backgroundSize: '12px 12px', borderRadius: 3 } as ViewStyle
    : { backgroundColor: washi[i % 3], borderRadius: 2 };
  return <View pointerEvents="none" style={[{ position: 'absolute', top: -8, alignSelf: 'center', width: w, height: h, zIndex: 3, transform: [{ rotate: rot }] }, look, style]} />;
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
      {t.art === 'watercolor' || t.art === 'candy' ? <Image source={art.blooms} style={{ width: 150, height: 82, marginBottom: 8 }} contentFit="contain" /> : null}
      {t.art === 'starry' ? <Text style={{ fontSize: 40, color: '#FFE2A3', marginBottom: 6 }}>☾</Text> : null}
      <H2 style={{ textAlign: 'center' }}>{title}</H2>
      {body ? <P muted style={{ textAlign: 'center', marginTop: 6 }}>{body}</P> : null}
      {children ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{children}</View> : null}
    </Card>
  );
}

/** 各分頁上面的標題卡（水彩會有垂下來的藤蔓和角落的小花） */
export function HeadCard({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  const t = useTheme();
  const s = useKit();
  const wc = t.art === 'watercolor';
  return (
    <View style={[cardStyle(t), s.head]}>
      {wc ? <Image source={art.blooms} style={s.headBlooms} contentFit="contain" /> : null}
      {wc ? <Image source={art.leaves} style={s.headVine} contentFit="contain" /> : null}
      <View style={[s.headRow, wc && { paddingRight: 30 }]}>
        {t.id !== 'minimal' ? <Text style={s.headFlower}>{t.id === 'starry' ? '✦' : '✿'}</Text> : null}
        <Text style={s.headTitle}>{title}</Text>
      </View>
      {sub ? <Text style={[s.p, s.muted, { marginTop: 6, paddingRight: wc ? 34 : 0 }]}>{sub}</Text> : null}
      {children}
    </View>
  );
}

/** 卡片裡的小標題（✿ 主題、★ 主題…） */
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  const s = useKit();
  const mark = t.id === 'minimal' ? '' : t.id === 'starry' ? '✦ ' : t.id === 'candy' ? '★ ' : '✿ ';
  return (
    <Text style={[s.secTitle, style]}>
      {mark ? <Text style={{ color: t.id === 'candy' ? '#FFC94D' : t.c.accent, fontSize: 15 }}>{mark}</Text> : null}
      {children}
    </Text>
  );
}

/* ---------------------------------------------------------------- 圖示（線條風格） */
export type IconName = 'home' | 'check' | 'album' | 'face' | 'gear' | 'camera' | 'star' | 'x' | 'undo' | 'folder' | 'plus' | 'cloud' | 'bell' | 'heart' | 'user' | 'video' | 'clock' | 'list' | 'trash' | 'reset' | 'palette';
const PATHS: Record<IconName, string> = {
  home: 'M4 11.5 12 4l8 7.5M6.5 10v9.5h11V10M10 19.5v-5h4v5',
  check: 'M8.5 12.3l2.4 2.4 4.8-5M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z',
  album: 'M6.5 5h11a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM4.5 17l4.5-4 3.2 2.8 2.8-2.3 4.5 3.5',
  face: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM9 10.2h.01M15 10.2h.01M8.8 14.2c1.8 1.8 4.6 1.8 6.4 0',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6',
  camera: 'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5zM12 9.1a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z',
  star: 'm12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z',
  x: 'M7 7l10 10M17 7 7 17',
  undo: 'M9 7 5 11l4 4M5 11h9a5 5 0 0 1 0 10h-2',
  folder: 'M3.5 7.5A2.5 2.5 0 0 1 6 5h3.5l2 2.2H18a2.5 2.5 0 0 1 2.5 2.5v7.8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z',
  plus: 'M12 6v12M6 12h12',
  cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.5 4.3 4.3 0 0 0 7 18z',
  bell: 'M6.5 16.5h11l-1.3-2V10a4.2 4.2 0 0 0-8.4 0v4.5zM10.3 19a1.9 1.9 0 0 0 3.4 0',
  heart: 'M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  video: 'M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 16.5zM16 10.5l4-2.5v8l-4-2.5',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 1.8',
  list: 'M7 6h12M7 12h12M7 18h12M4 6h.01M4 12h.01M4 18h.01',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  reset: 'M5 12a7 7 0 1 0 2-4.9M5 4v4h4',
  palette: 'M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6h2.2a3.9 3.9 0 0 0 3.9-3.9c0-3.9-3.8-7-8.5-7zM8 11h.01M10.5 7.8h.01M14.5 7.8h.01',
};
export function Icon({ name, size = 22, color, stroke = 1.9 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || t.c.ink2} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d={PATHS[name]} />
    </Svg>
  );
}

/** 「是／不是」的圓形小印章 */
export function Stamp({ yes, size = 86 }: { yes: boolean; size?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={44} fill={yes ? t.c.yes : t.c.no} stroke="#fff" strokeWidth={6} />
      {yes ? (
        <Path d="M31 52l13 13 26-28" stroke="#fff" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <Path d="M35 35l30 30M65 35 35 65" stroke="#fff" strokeWidth={10} strokeLinecap="round" />
      )}
    </Svg>
  );
}

/* ---------------------------------------------------------------- 樣式 */

export const useKit = makeStyles((t) => StyleSheet.create({
  h1: { ...t.title, fontSize: 26, lineHeight: 35, color: t.c.headTitle, letterSpacing: 0.5 },
  h2: { ...t.title, fontSize: 19, lineHeight: 27, color: t.c.ink, letterSpacing: 0.3 },
  p: { ...t.round, fontSize: 14.5, lineHeight: 24, color: t.c.ink2 },
  t: { ...t.round, fontSize: 15, color: t.c.ink },
  muted: { color: t.c.muted },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, minHeight: 48 },
  btnSm: { minHeight: 38, paddingVertical: 7, paddingHorizontal: 15 },
  btnText: { ...t.round, fontSize: 16, letterSpacing: 0.5 },
  btnTextSm: { fontSize: 14.5 },
  seg: { flexDirection: 'row', backgroundColor: t.c.card2, borderRadius: 999, borderWidth: 1, borderColor: t.c.line, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 999, alignItems: 'center' },
  segText: { ...t.round, color: t.c.ink2, fontSize: 14.5 },
  head: { padding: 18, paddingBottom: 16, overflow: 'hidden', ...(t.id === 'starry' ? { backgroundImage: 'linear-gradient(160deg, #252E5C, #1C2349)', borderColor: '#38427A' } as ViewStyle : null) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headFlower: { fontSize: 22, color: t.c.accent },
  headTitle: { ...t.title, flex: 1, fontSize: 24, lineHeight: 32, color: t.c.headTitle },
  headBlooms: { position: 'absolute', right: -6, bottom: -4, width: 112, height: 46, transform: [{ scaleX: -1 }], opacity: 0.7 },
  headVine: { position: 'absolute', right: 12, top: -4, width: 30, height: 70, transform: [{ rotate: '-8deg' }], opacity: 0.85 },
  secTitle: { ...t.title, fontSize: 17, color: t.id === 'watercolor' || t.id === 'book' ? '#8D5D50' : t.c.ink, marginBottom: 4 },
}));
