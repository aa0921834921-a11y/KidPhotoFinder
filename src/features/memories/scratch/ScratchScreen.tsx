/**
 * 刮刮樂：去年的今天（新頁面 /memory-scratch）。
 * - 底下是一張用真實照片＋活動名稱＋日期排出來的回憶卡（羊皮紙、緞帶）；上面蓋一層完整的銀箔（Skia），手指刮掉
 * - 刮到 88% 才能按「揭曉」（不會自己把剩下的銀箔清掉）；真的刮到 98% 才自動打開
 * - 一天一張（每個孩子各一張），同一天再進來還是同一張，刮痕也還在；只有示範模式可以重刮、換一張
 * - 沒有資料夾日期的照片只會說「今天的隨機回憶」，不會說是去年的今天
 * 每一層都是分開的：背景星空、城堡、火車、下方的孩子和狗、標題圖、金框、銀箔、照片、羊皮紙。
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as TM from '../../../core/timeMachine';
import { getLang, tr, useLang } from '../../../i18n';
import * as DB from '../../../services/db';
import { useApp } from '../../../services/state';
import { useTheme } from '../../../ui/theme';
import { saveCard, swapDemoCard, todayCard, type DailyCard } from '../daily';
import { demoMemories, forKid, loadMemories, type Memory, type MemoryData } from '../data';
import { DaySheet } from '../ui/DaySheet';
import { useSerif, type MemFont } from '../ui/fonts';
import { Glyph, GOLD, GoldButton, Sparkle } from '../ui/GoldIcon';
import { MemPhoto } from '../ui/OrbPhoto';
import { FOIL_H, FOIL_W } from './coverage';
import ScratchFoil from './ScratchFoil';

/** 背景：參考稿同一張畫（星空、城堡、火車、雲、孩子和小狗），沒有字和按鈕 */
const BG = require('../../../../assets/memory-ui/scratch_bg.webp');
const TITLE = require('../../../../assets/memory-ui/title.webp');
const HEADLINE = require('../../../../assets/memory-ui/headline_zh.webp');
const FRAME = require('../../../../assets/memory-ui/frame.webp');
const PAPER = require('../../../../assets/memory-ui/paper.webp');
const RIBBON = require('../../../../assets/memory-ui/ribbon.webp');
const FLAKES = [
  require('../../../../assets/memory-ui/flake_1.webp'), require('../../../../assets/memory-ui/flake_2.webp'),
  require('../../../../assets/memory-ui/flake_3.webp'), require('../../../../assets/memory-ui/flake_4.webp'),
] as number[];
/** 金框圖 1760 × 1466：銀箔放在 (48, 48)，大小 1664 × 1370（銀箔單位的 2 倍） */
const FRAME_W = 1760, FRAME_H = 1466, FRAME_IN = 48;
const TITLE_AR = 1065 / 414, HEAD_AR = 1493 / 453;
const UNLOCK = 0.88;
const AUTO = 0.98;
const lang = () => getLang() as TM.TMLang;
const abs = (x: number, y: number, w: number, h: number) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: h });

export function kindLabel(c: Pick<DailyCard, 'kind' | 'years'>): string {
  if (c.kind === 'exact') return TM.yearsAgo(c.years, lang());
  if (c.kind === 'near') return tr('sc.near', { n: c.years });
  return tr('sc.random');
}

/* ---------------------------------------------------------------- 底下的回憶卡（真實照片＋羊皮紙） */

function CardFace({ m, info, card, w, h, font }: { m: Memory; info: Map<string, DB.PhotoInfo>; card: DailyCard; w: number; h: number; font: MemFont }) {
  const k = w / FOIL_W;
  // 羊皮紙（圖 1040 × 600，四周是撕開的毛邊）放左下角
  const pw = w * 0.58, ph = pw * (600 / 1040);
  const rw = pw * 0.8, rh = rw * (100 / 640);
  return (
    <View style={{ width: w, height: h, borderRadius: 28 * k, overflow: 'hidden', backgroundColor: '#141A44' }}>
      <MemPhoto m={m} id={m.cover} info={m.cover ? info.get(m.cover) : null} w={w} h={h} />
      {/* 下面一點暗，羊皮紙比較清楚 */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="fd" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#120A20" stopOpacity={0.5} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#fd)" />
      </Svg>
      <View style={[abs(18 * k, h - ph - 18 * k, pw, ph), cs.paperShadow]}>
        <Image source={PAPER} style={abs(0, 0, pw, ph)} contentFit="fill" />
        <View style={{ position: 'absolute', left: pw * 0.075, right: pw * 0.07, top: ph * 0.2, bottom: ph * 0.1, justifyContent: 'center', gap: 3 * k }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * k }}>
            <Glyph name="calendar" size={Math.max(12, 30 * k)} color="#6C4A28" stroke={4.5} />
            <Text style={[font.serifR, cs.date, { fontSize: Math.max(11, 27 * k) }]} numberOfLines={1}>
              {m.trusted ? TM.fmtDay(m.day, lang()).replace(/\//g, '.') : tr('mem.noDate')}
            </Text>
          </View>
          <Text style={[font.title, cs.title, { fontSize: Math.max(14, 40 * k), lineHeight: Math.max(19, 52 * k) }]} numberOfLines={2}>{m.title}</Text>
          <Text style={[font.round, cs.meta, { fontSize: Math.max(10.5, 24 * k) }]} numberOfLines={1}>
            {tr('common.photos', { n: m.photos.length })}{m.parent ? `　·　${m.parent}` : ''}
          </Text>
        </View>
        {/* 愛心小塗鴉 */}
        <Svg width={34 * k + 10} height={30 * k + 10} viewBox="0 0 64 56" style={{ position: 'absolute', right: pw * 0.06, bottom: ph * 0.1 }}>
          <Path d="M32 50C14 38 6 27 13 17C19 9 28 12 32 19C36 12 45 9 51 17C58 27 50 38 32 50Z M46 8l6-6M50 10h7" stroke="#B5704A" strokeWidth={3} fill="none" strokeLinecap="round" />
        </Svg>
        {/* 緞帶：一年前的今天 */}
        <View style={abs((pw - rw) / 2, -rh * 0.42, rw, rh)}>
          <Image source={RIBBON} style={abs(0, 0, rw, rh)} contentFit="fill" />
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: rw * 0.16 }]}>
            <Text style={[font.serif, cs.ribbonText, { fontSize: Math.max(10.5, 27 * k) }]} numberOfLines={1}>— {kindLabel(card)} —</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- 揭曉時撒出來的星光 */

function Burst({ p, w, h }: { p: SharedValue<number>; w: number; h: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {Array.from({ length: 18 }, (_, i) => <BurstBit key={i} p={p} i={i} w={w} h={h} />)}
    </View>
  );
}
function BurstBit({ p, i, w, h }: { p: SharedValue<number>; i: number; w: number; h: number }) {
  const a = (i / 18) * Math.PI * 2;
  const dist = (0.42 + (i % 3) * 0.08) * Math.max(w, h);
  const st = useAnimatedStyle(() => {
    const t = p.value;
    const e = 1 - (1 - t) * (1 - t);
    return { opacity: t <= 0 || t >= 1 ? 0 : 1 - t, transform: [{ translateX: Math.cos(a) * dist * e }, { translateY: Math.sin(a) * dist * e * 0.8 }, { scale: 0.6 + (1 - t) * 0.6 }] };
  });
  return <Animated.View style={[{ position: 'absolute' }, st]}><Sparkle size={i % 3 ? 12 : 18} color={i % 2 ? '#FFE2A2' : '#FFFFFF'} /></Animated.View>;
}

/* ---------------------------------------------------------------- 刮的時候飛出來的銀箔碎屑 */

type FlakeGo = (x: number, y: number, vx: number, vy: number, size: number, spin: number) => void;
const FLAKE_N = 14;

function Flake({ src, reg }: { src: number; reg: (go: FlakeGo) => void }) {
  const p = useSharedValue(1);
  const v = useSharedValue({ x: 0, y: 0, vx: 0, vy: 0, s: 10, r: 0, spin: 1 });
  useEffect(() => {
    reg((x, y, vx, vy, s, spin) => {
      v.value = { x, y, vx, vy, s, r: Math.round(Math.random() * 360), spin };
      p.value = 0;
      p.value = withTiming(1, { duration: 760, easing: Easing.out(Easing.quad) });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => {
    const a = v.value, t = p.value;
    return {
      width: a.s, height: a.s, opacity: t >= 1 ? 0 : Math.min(1, (1 - t) * 1.5),
      transform: [{ translateX: a.x - a.s / 2 + a.vx * t }, { translateY: a.y - a.s / 2 + a.vy * t + 110 * t * t }, { rotate: `${a.r + a.spin * 320 * t}deg` }],
    };
  });
  return <Animated.Image source={src} style={[{ position: 'absolute', left: 0, top: 0 }, st]} resizeMode="contain" />;
}

/* ---------------------------------------------------------------- 畫面 */

export default function ScratchScreen({ demo: demoParam }: { demo: boolean }) {
  const t = useTheme();
  const lng = useLang();
  const ins = useSafeAreaInsets();
  const still = !!useReducedMotion();
  const version = useApp((x) => x.version);
  const serif = useSerif();
  const font = useMemo<MemFont>(() => ({ title: t.title, round: t.round, serif: serif.serif, serifR: serif.serifR }), [t, serif]);
  const { width: W, height: H } = useWindowDimensions();

  const [demo, setDemo] = useState(demoParam);
  const [data, setData] = useState<MemoryData | null>(null);
  const [kids, setKids] = useState<DB.Kid[]>([]);
  const [kid, setKid] = useState('');
  const [cur, setCur] = useState<{ card: DailyCard; m: Memory } | null>(null);
  const [foilVer, setFoilVer] = useState(0);
  const [ratio, setRatio] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [gone, setGone] = useState(false);
  const [day, setDay] = useState<Memory | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const foilOp = useSharedValue(1);
  const burst = useSharedValue(0);
  const glow = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealing = useRef(false);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    let alive = true;
    setData(null);
    if (demo) { setData(demoMemories()); setKids([]); return; }
    loadMemories().then((d) => alive && setData(d)).catch(() => alive && setData({ items: [], info: new Map(), demo: false }));
    DB.getKids().then((k) => { if (alive) { setKids(k); setKid(k[0]?.key ?? ''); } }).catch(() => {});
    return () => { alive = false; };
  }, [demo, version]);

  const multi = kids.length > 1;
  const items = useMemo(() => (data ? (multi ? forKid(data.items, kid) : data.items) : []), [data, multi, kid]);
  const cardKey = multi ? kid : '';

  // 今天的卡
  useEffect(() => {
    if (!data) return;
    let alive = true;
    todayCard(items, cardKey, demo).then((r) => {
      if (!alive) return;
      setCur(r);
      revealing.current = !!r?.card.revealed;
      setRevealed(!!r?.card.revealed);
      setGone(!!r?.card.revealed);
      foilOp.value = r?.card.revealed ? 0 : 1;
      setRatio(0);
      setFoilVer((v) => v + 1);
    }).catch(() => alive && setCur(null));
    return () => { alive = false; };
  }, [data, items, cardKey, demo]);

  /* ---------- 大小：一個畫面放得下（卡片依螢幕高度縮放） */
  const contentW = Math.min(W - 28, 460);
  const avail = H - ins.top - ins.bottom;
  const compact = avail < 760;
  const tiny = avail < 660;
  const gap = compact ? 6 : 10;
  const titleH = tiny ? 50 : compact ? 60 : 74;
  const headH = tiny ? 44 : compact ? 56 : 70;
  const copyH = compact ? 0 : 60;
  const fixed = ins.top + ins.bottom + 6 + titleH + 28 + (compact ? 0 : 18) + (demo ? 32 : 0) + (multi ? 46 : 0)
    + headH + copyH + 34 + 50 + (demo ? 44 : 0) + 22 + gap * 7;
  const cw = Math.round(Math.max(260, Math.min(contentW, ((H - fixed) * FRAME_W) / FRAME_H)));
  const chh = Math.round((cw * FRAME_H) / FRAME_W);
  const fo = (cw * FRAME_IN) / FRAME_W;
  const fw = (cw * FOIL_W * 2) / FRAME_W;
  const fh = (fw * FOIL_H) / FOIL_W;

  /* ---------- 銀箔 */
  useEffect(() => {
    if (ratio >= UNLOCK && !revealed && !still) glow.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.3, { duration: 700 })), -1, false);
    else glow.value = 0;
  }, [ratio >= UNLOCK, revealed, still]); // eslint-disable-line react-hooks/exhaustive-deps
  const foilStyle = useAnimatedStyle(() => ({ opacity: foilOp.value, transform: [{ scale: 1 + (1 - foilOp.value) * 0.03 }] }));
  const revealBtnStyle = useAnimatedStyle(() => ({ boxShadow: `0px 0px ${8 + glow.value * 18}px rgba(255,205,120,${0.35 + glow.value * 0.5})` } as ViewStyle));

  const persist = useCallback((patch: Partial<DailyCard>) => {
    setCur((c) => {
      if (!c) return c;
      const card = { ...c.card, ...patch };
      saveCard(cardKey, card, demo).catch(() => {});
      return { ...c, card };
    });
  }, [cardKey, demo]);

  const reveal = useCallback(() => {
    if (revealed || revealing.current) return; // 自動揭曉時，同一瞬間可能被叫好幾次
    revealing.current = true;
    setRevealed(true);
    persist({ revealed: true });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    foilOp.value = withTiming(0, { duration: still ? 1 : 700, easing: Easing.out(Easing.cubic) });
    timers.current.push(setTimeout(() => setGone(true), still ? 30 : 800));
    burst.value = 0;
    if (!still) burst.value = withDelay(80, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
  }, [revealed, persist, foilOp, burst, still]);

  const onProgress = useCallback((r: number) => {
    setRatio(r);
    if (r >= AUTO) reveal(); // 真的刮到 98% 才自己打開
  }, [reveal]);
  const onStrokeEnd = useCallback((strokes: number[][]) => { persist({ strokes }); }, [persist]);

  // 銀箔碎屑：輪流用固定的幾片（不會一直新增畫面上的東西）
  const flakeGo = useRef<FlakeGo[]>([]);
  const flakeI = useRef(0);
  const onScratch = useCallback((x: number, y: number, dx: number, dy: number) => {
    if (still) return;
    const len = Math.hypot(dx, dy) || 1;
    for (let j = 0; j < 2; j++) {
      const go = flakeGo.current[flakeI.current++ % FLAKE_N];
      if (!go) continue;
      go(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 18,
        (-dx / len) * 26 * Math.random() + (Math.random() - 0.5) * 80, -26 - Math.random() * 46,
        7 + Math.random() * 9, Math.random() > 0.5 ? 1 : -1);
    }
  }, [still]);

  // 銀箔只在換卡時重畫，所以給它固定的函式，裡面再呼叫最新的
  const live = useRef({ onProgress, onStrokeEnd, reveal, onScratch });
  live.current = { onProgress, onStrokeEnd, reveal, onScratch };
  const foilCb = useMemo(() => ({
    onProgress: (r: number) => live.current.onProgress(r),
    onStrokeEnd: (strokes: number[][]) => live.current.onStrokeEnd(strokes),
    onScratch: (x: number, y: number, dx: number, dy: number) => live.current.onScratch(x, y, dx, dy),
    onA11yReveal: () => live.current.reveal(),
  }), []);

  const redo = () => { // 示範：重刮
    if (!cur) return;
    const card = { ...cur.card, strokes: [], revealed: false };
    revealing.current = false;
    setCur({ ...cur, card }); setRevealed(false); setGone(false); setRatio(0); foilOp.value = 1; setFoilVer((v) => v + 1);
    saveCard(cardKey, card, true).catch(() => {});
  };
  const swap = async () => { // 示範：換一張
    if (!cur || !data) return;
    const r = await swapDemoCard(items, cardKey, cur.m.id);
    if (!r) return;
    revealing.current = false;
    setCur(r); setRevealed(false); setGone(false); setRatio(0); foilOp.value = 1; setFoilVer((v) => v + 1);
  };
  const say = (msg: string) => { setToast(msg); timers.current.push(setTimeout(() => setToast(null), 1800)); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/search'));

  const pct = Math.floor(ratio * 100);
  const ready = ratio >= UNLOCK;
  const empty = !!data && !items.length;
  // 背景的城堡、火車：照參考稿的比例（畫面很寬時不要放太大）

  return (
    <View style={st.root}>
      <StatusBar style="light" />
      {/* 背景：一整張畫（不會動） */}
      <Image source={BG} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="bottom" />
      <Svg width={W} height={H * 0.4} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Defs>
          <LinearGradient id="tv" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#040616" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#040616" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H * 0.4} fill="url(#tv)" />
      </Svg>

      <ScrollView contentContainerStyle={{ paddingTop: ins.top + 6, paddingBottom: ins.bottom + 22, alignItems: 'center', minHeight: H }} scrollEnabled={H < 640} showsVerticalScrollIndicator={false}>
        <View style={{ width: contentW, alignItems: 'center', gap }}>
          {/* 上面一排：返回、標題（參考稿的金字和月亮） */}
          <View style={[st.top, { height: titleH }]}>
            <GoldButton icon="back" label={tr('mem.back')} a11y={tr('mem.back')} onPress={back} size={42} />
            <View style={{ flex: 1, alignItems: 'center' }} pointerEvents="none">
              <Image source={TITLE} style={{ width: titleH * TITLE_AR, height: titleH }} contentFit="contain" accessibilityLabel="童年拾光" />
            </View>
            <View style={{ width: 42 }} />
          </View>
          <View style={{ alignItems: 'center', marginTop: -gap }} pointerEvents="none">
            <View style={st.subRow}>
              <View style={st.rule} />
              <View style={st.diamond} />
              <Text style={[font.serif, st.sub, serif.latin && { fontSize: 15, letterSpacing: 0.5 }]} numberOfLines={1}>{tr('sc.title')}</Text>
              <View style={st.diamond} />
              <View style={st.rule} />
            </View>
            {!compact ? <Text style={[font.serifR, st.tag]} numberOfLines={1}>{tr('sc.sub')}</Text> : null}
            {demo ? <View style={st.demo}><Text style={[font.round, st.demoText]}>{tr('mem.demo')}</Text></View> : null}
          </View>
          {multi ? (
            <View style={st.kids}>
              {kids.map((k) => {
                const on = k.key === kid;
                return (
                  <Pressable key={k.key} onPress={() => setKid(k.key)} style={[st.kid, on && st.kidOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    accessibilityLabel={tr('sc.kidCard', { name: k.name || tr('refs.myChild') })}>
                    <Text style={[font.round, st.kidText, on && { color: '#2C2008' }]} numberOfLines={1}>{k.name || tr('refs.myChild')}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* 大標：刮開今天的回憶（繁體中文用參考稿的金色手寫字；揭曉後換成「去年的今天」） */}
          <View style={{ height: headH, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            {revealed && cur ? (
              <Text style={[font.serif, st.head, { fontSize: Math.min(32, headH * 0.5) }]} numberOfLines={1}>{kindLabel(cur.card)}</Text>
            ) : lng === 'zh-Hant' ? (
              <Image source={HEADLINE} style={{ width: Math.min(contentW, headH * HEAD_AR), height: Math.min(contentW / HEAD_AR, headH) }} contentFit="contain" accessibilityLabel={tr('sc.head')} />
            ) : (
              <Text style={[font.serif, st.head, { fontSize: Math.min(serif.latin ? 26 : 32, headH * 0.5) }]} numberOfLines={1} adjustsFontSizeToFit>{tr('sc.head')}</Text>
            )}
          </View>
          {copyH ? <Text style={[font.serifR, st.copy, { height: copyH }]} numberOfLines={3}>{tr('sc.copy')}</Text> : null}

          {/* 卡片：金框（一張圖）裡面放銀箔，銀箔底下是回憶卡 */}
          {empty ? (
            <View style={[st.empty, { width: cw, minHeight: chh }]}>
              <Text style={[font.title, st.emptyT]}>{tr('mem.emptyTitle')}</Text>
              <Text style={[font.round, st.emptyB]}>{tr('mem.emptyBody')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Pressable onPress={() => router.navigate('/')} style={st.primary} accessibilityRole="button">
                  <Text style={[font.round, st.primaryText]}>{tr('mem.goHome')}</Text>
                </Pressable>
                <Pressable onPress={() => setDemo(true)} style={st.ghost} accessibilityRole="button">
                  <Text style={[font.round, st.ghostText]}>{tr('mem.tryDemo')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ width: cw, height: chh }}>
              {/* 金框外面的光 */}
              <View pointerEvents="none" style={[abs(cw * 0.016, cw * 0.016, cw * 0.968, chh - cw * 0.032), st.cardGlow, { borderRadius: cw * 0.045 }]} />
              <View style={abs(fo, fo, fw, fh)}>
                {cur && data ? <CardFace m={cur.m} info={data.info} card={cur.card} w={fw} h={fh} font={font} /> : <View style={{ width: fw, height: fh, borderRadius: 16, backgroundColor: '#C9CEE3' }} />}
                {/* 揭曉後拿掉銀箔（網頁版留著但看不見：網頁的 Skia 拿掉時會出錯） */}
                {cur && (!gone || Platform.OS === 'web') ? (
                  <Animated.View style={[StyleSheet.absoluteFill, foilStyle]} pointerEvents={revealed ? 'none' : 'auto'}>
                    <ScratchFoil width={fw} height={fh} strokes={cur.card.strokes} version={foilVer} disabled={revealed}
                      onProgress={foilCb.onProgress} onStrokeEnd={foilCb.onStrokeEnd} onScratch={foilCb.onScratch}
                      a11yLabel={tr('sc.foilA11y')} a11yReveal={tr('sc.revealA11y')} onA11yReveal={foilCb.onA11yReveal} />
                  </Animated.View>
                ) : null}
              </View>
              {/* 金框（只畫一次，蓋在銀箔外圈） */}
              <Image source={FRAME} style={abs(0, 0, cw, chh)} contentFit="fill" pointerEvents="none" />
              <View pointerEvents="none" style={abs(fo, fo, fw, fh)}>
                {FLAKES.length ? Array.from({ length: FLAKE_N }, (_, i) => <Flake key={i} src={FLAKES[i % FLAKES.length]} reg={(go) => { flakeGo.current[i] = go; }} />) : null}
              </View>
              <Burst p={burst} w={cw} h={chh} />
            </View>
          )}

          {/* 進度、按鈕 */}
          {cur && !empty ? (
            <>
              {!revealed ? (
                <View style={{ width: cw - 16, gap: 6 }}>
                  <View style={st.barBox}>
                    <View style={[st.barFill, { width: `${Math.min(100, ratio * 100)}%` }, ready && { backgroundColor: '#FFD98A' }]} />
                    <View style={[st.tick, { left: `${UNLOCK * 100}%` }]} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[font.round, st.pct]}>{tr('sc.progress', { n: pct })}</Text>
                    <Text style={[font.round, st.need, ready && { color: '#FFE2A2' }]}>{ready ? tr('sc.ready') : tr('sc.need')}</Text>
                  </View>
                </View>
              ) : null}
              <View style={[st.btnRow, { width: cw - 16 }]}>
                {!revealed ? (
                  <Animated.View style={[{ flex: 1, borderRadius: 999 }, ready ? revealBtnStyle : null]}>
                    <Pressable onPress={reveal} disabled={!ready} accessibilityRole="button" accessibilityState={{ disabled: !ready }} accessibilityLabel={tr('sc.reveal')}
                      style={({ pressed }) => [st.primary, !ready && st.locked, pressed && { opacity: 0.85 }]}>
                      {!ready ? <Glyph name="lock" size={18} color="#C9C2E8" stroke={4.5} /> : <Sparkle size={14} color="#3A2A10" />}
                      <Text style={[font.round, st.primaryText, !ready && { color: '#C9C2E8' }]}>{tr('sc.reveal')}</Text>
                    </Pressable>
                  </Animated.View>
                ) : (
                  <>
                    <Pressable onPress={() => setDay(cur.m)} style={({ pressed }) => [st.primary, { flex: 1.3 }, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                      <Glyph name="book" size={20} color="#3A2A10" stroke={4} />
                      <Text style={[font.round, st.primaryText]}>{tr('mem.openDay')}</Text>
                      <Glyph name="chevron" size={14} color="#3A2A10" stroke={6} />
                    </Pressable>
                    <View style={[st.ghost, { flex: 1, opacity: 0.8 }]} accessible accessibilityLabel={tr('sc.tomorrow')}>
                      <Glyph name="lock" size={16} color={GOLD} stroke={4.5} />
                      <Text style={[font.round, st.ghostText, { fontSize: 12.5 }]} numberOfLines={2}>{tr('sc.tomorrow')}</Text>
                    </View>
                  </>
                )}
              </View>
              {demo ? (
                <View style={st.demoRow}>
                  <Text style={[font.round, st.demoOnly]}>{tr('sc.demoOnly')}</Text>
                  <Pressable onPress={redo} style={st.mini} accessibilityRole="button"><Text style={[font.round, st.miniText]}>{tr('sc.redo')}</Text></Pressable>
                  <Pressable onPress={swap} style={st.mini} accessibilityRole="button"><Text style={[font.round, st.miniText]}>{tr('sc.swap')}</Text></Pressable>
                </View>
              ) : null}
              {revealed && cur.card.kind === 'random' ? <Text style={[font.round, st.note, { width: cw }]}>{tr('sc.randomNote')}</Text> : null}
            </>
          ) : null}
          {!data ? <Text style={[font.round, { color: '#D9D2F5', marginTop: 20 }]}>{tr('mem.loading')}</Text> : null}
        </View>
      </ScrollView>

      {toast ? <View pointerEvents="none" style={[st.toast, { top: ins.top + 80 }]}><Text style={[font.round, { color: '#fff', fontSize: 13.5 }]}>{toast}</Text></View> : null}
      {day && data ? <DaySheet m={day} info={data.info} font={font} still={still} onClose={() => setDay(null)} onDemoTap={() => say(tr('mem.demoPhoto'))} /> : null}
    </View>
  );
}

const GLOW = { textShadowOffset: { width: 0, height: 0 } };
const cs = StyleSheet.create({
  paperShadow: { filter: 'drop-shadow(0px 6px 10px rgba(30,14,6,0.45))' } as ViewStyle,
  ribbonText: { color: '#4E3216', letterSpacing: 1 },
  date: { color: '#6C4A28', letterSpacing: 0.5 },
  title: { color: '#3E2A18' },
  meta: { color: '#8A6E52' },
});

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060A21' },
  top: { width: '100%', flexDirection: 'row', alignItems: 'flex-start' },
  demo: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,145,100,0.92)' },
  demoText: { color: '#2A1206', fontSize: 12.5, fontWeight: '700', letterSpacing: 1 },
  kids: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  kid: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.2, borderColor: 'rgba(255,226,162,0.6)', justifyContent: 'center', backgroundColor: 'rgba(8,12,38,0.6)' },
  kidOn: { backgroundColor: '#FFD98A', borderColor: '#FFD98A' },
  kidText: { color: GOLD, fontSize: 13 },
  subRow: { flexDirection: 'row', alignItems: 'center', height: 28 },
  rule: { width: 30, height: 1.2, backgroundColor: 'rgba(255,226,162,0.7)' },
  diamond: { width: 5, height: 5, marginHorizontal: 7, backgroundColor: '#FFE2A2', transform: [{ rotate: '45deg' }] },
  sub: { fontSize: 17, lineHeight: 26, color: '#FFEBC4', letterSpacing: 2, textShadowColor: 'rgba(255,178,80,0.8)', textShadowRadius: 8, ...GLOW },
  tag: { fontSize: 12.5, lineHeight: 18, color: '#E9E3FF', letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 4, ...GLOW },
  head: { lineHeight: 44, color: '#FFE2A2', letterSpacing: 2, textShadowColor: '#FFB547', textShadowRadius: 14, textAlign: 'center', ...GLOW },
  copy: { fontSize: 12.5, lineHeight: 19, color: '#EDE8FF', textAlign: 'center', marginTop: -4, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4, ...GLOW },
  cardGlow: { boxShadow: '0px 0px 34px rgba(255,205,120,0.85), 0px 0px 12px rgba(255,230,170,0.9), 0px 16px 30px rgba(0,0,0,0.5)' } as ViewStyle,
  barBox: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'visible' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: '#C9C2E8' },
  tick: { position: 'absolute', top: -4, width: 2, height: 16, marginLeft: -1, backgroundColor: '#FFE2A2', borderRadius: 1 },
  pct: { fontSize: 12.5, color: '#E9E3FF', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4, ...GLOW },
  need: { fontSize: 12.5, color: '#C9C2EE', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4, ...GLOW },
  btnRow: { flexDirection: 'row', gap: 10 },
  primary: {
    minHeight: 50, borderRadius: 999, backgroundColor: '#FFD98A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16,
  },
  locked: { backgroundColor: 'rgba(40,36,80,0.85)', borderWidth: 1.2, borderColor: 'rgba(201,194,232,0.5)' },
  primaryText: { color: '#3A2A10', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  ghost: { minHeight: 50, borderRadius: 999, borderWidth: 1.2, borderColor: 'rgba(255,226,162,0.7)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, backgroundColor: 'rgba(8,12,38,0.6)' },
  ghostText: { color: GOLD, fontSize: 14.5 },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(8,10,32,0.78)' },
  demoOnly: { fontSize: 12, color: '#FFB48A' },
  mini: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,180,138,0.8)', justifyContent: 'center' },
  miniText: { color: '#FFD2B8', fontSize: 13 },
  note: { fontSize: 12, lineHeight: 18, color: '#D9D2F5', textAlign: 'center' },
  empty: {
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20, borderRadius: 22, backgroundColor: 'rgba(10,14,42,0.86)', borderWidth: 1, borderColor: 'rgba(255,226,162,0.4)',
  },
  emptyT: { fontSize: 20, color: GOLD, textAlign: 'center' },
  emptyB: { fontSize: 14, lineHeight: 22, color: '#D9D2F5', textAlign: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(20,20,50,0.9)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
});
