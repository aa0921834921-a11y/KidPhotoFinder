/**
 * 回憶星空（新頁面 /memory-sky）。
 * - 整個世界（星雲、標題、六個星座、照片星球、孩子和狗）只有一個變換，一起拖曳、雙指縮放、滾輪縮放（網頁）
 * - 固定不動的只有：返回、篩選、全景、許願按鈕、回憶卡
 * - 點星星：光圈 → 鏡頭飛過去 → 回憶卡 →「進入那一天」看全部照片 → 點照片用原本的看照片畫面
 * - 許願：集氣 700ms → 流星 1400ms → 命中（漣漪 450ms）→ 回憶卡 420ms；動畫中不能再按，離開頁面會取消
 * - 「減少動態效果」打開時：不飛、不放流星，直接打開回憶
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewInstance, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture, usePinchGesture, useCompetingGestures, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDecay, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import * as TM from '../../../core/timeMachine';
import { getLang, tr, useLang } from '../../../i18n';
import * as DB from '../../../services/db';
import { useApp } from '../../../services/state';
import { useTheme } from '../../../ui/theme';
import { clampCam, clampT, focusCam, homeCam, maxScale, minScale, zoomAt, type Cam } from '../camera';
import { CONS_ORDER, WORLD_H, WORLD_W, type ConsKey } from '../constellations';
import { demoMemories, forKid, loadMemories, type Memory, type MemoryData } from '../data';
import { layoutSky, nearestStar, type Star } from '../layout';
import { DaySheet } from '../ui/DaySheet';
import { FilterSheet } from '../ui/FilterSheet';
import { useSerif } from '../ui/fonts';
import { Glyph, GOLD, GoldButton, Sparkle } from '../ui/GoldIcon';
import { MemoryCard } from '../ui/MemoryCard';
import { Impact, Meteor, SelectRing } from './SkyFx';
import { ConsPulse, SkyWorld, StarA11y } from './SkyWorld';

type Phase = 'idle' | 'charging' | 'flying' | 'impact';
const ALL_ON: Record<ConsKey, boolean> = { sport: true, birthday: true, travel: true, school: true, family: true, hobby: true };
const tap = (k: 'light' | 'success') => {
  if (Platform.OS === 'web') return;
  (k === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(() => {});
};

/* ---------------------------------------------------------------- 許願的集氣粒子（畫面座標，聚到按鈕中心） */

const CHARGE = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.4;
  const r = 70 + ((i * 53) % 110);
  return { x: Math.cos(a) * r * 1.6, y: Math.sin(a) * r * 0.9 - 40, d: (i % 5) * 0.08, size: 6 + (i % 3) * 3 };
});

function ChargeDot({ p, x, y, d, size }: { p: SharedValue<number>; x: number; y: number; d: number; size: number }) {
  const st = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (p.value - d) / (1 - d)));
    const e = t * t * (3 - 2 * t);
    return { opacity: p.value <= 0 || p.value >= 1 ? 0 : Math.min(1, t * 3) * (1 - e * 0.5), transform: [{ translateX: x * (1 - e) }, { translateY: y * (1 - e) }, { scale: 1 - e * 0.5 }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: size, backgroundColor: '#FFF6D6', boxShadow: '0px 0px 10px #FFD17A' } as ViewStyle, st]} />;
}

/* ---------------------------------------------------------------- 畫面 */

export default function SkyScreen({ demo: demoParam }: { demo: boolean }) {
  const t = useTheme();
  useLang();
  const ins = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const still = !!reduced;
  const version = useApp((x) => x.version);
  const serif = useSerif();
  const font = useMemo(() => ({ title: t.title, round: t.round, serif: serif.serif, serifR: serif.serifR }), [t, serif]);

  const [demo, setDemo] = useState(demoParam);
  const [data, setData] = useState<MemoryData | null>(null);
  const [kids, setKids] = useState<DB.Kid[]>([]);
  const [kid, setKid] = useState<string | null>(null);
  const [consOn, setConsOn] = useState<Record<ConsKey, boolean>>(ALL_ON);
  const [sel, setSel] = useState<Star | null>(null);
  const [wishCard, setWishCard] = useState(false);
  const [day, setDay] = useState<Memory | null>(null);
  const [filter, setFilter] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState<Star | null>(null);
  const [meteorK, setMeteorK] = useState(1);
  const [hint, setHint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  /* ---------- 資料 */
  useEffect(() => {
    let alive = true;
    setData(null);
    if (demo) { setData(demoMemories()); return; }
    loadMemories().then((d) => alive && setData(d)).catch(() => alive && setData({ items: [], info: new Map(), demo: false }));
    DB.getKids().then((k) => alive && setKids(k)).catch(() => {});
    return () => { alive = false; };
  }, [demo, version]);
  useEffect(() => { DB.getMeta('mem_sky_hint').then((v) => { if (!v) setHint(true); }).catch(() => setHint(true)); }, []);

  const layout = useMemo(() => layoutSky(data?.items || []), [data]);
  const kidSet = useMemo(() => (kid == null || !data ? null : new Set(forKid(data.items, kid).map((m) => m.id))), [data, kid]);
  const visible = useCallback((s: Star) => consOn[s.cons] && (!kidSet || kidSet.has(s.m.id)), [consOn, kidSet]);
  const counts = useMemo(() => Object.fromEntries(CONS_ORDER.map((k) => [k, layout.clusters[k].count])) as Record<ConsKey, number>, [layout]);
  const empty = !!data && !data.items.length;

  /* ---------- 鏡頭（整個世界一個變換） */
  const s = useSharedValue(0.5), tx = useSharedValue(0), ty = useSharedValue(0);
  const vw = useSharedValue(0), vh = useSharedValue(0);
  const pinching = useSharedValue(false);
  const p0 = useSharedValue({ s: 1, tx: 0, ty: 0, fx: 0, fy: 0 });
  const worldStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }] }));
  const cam = (): Cam => ({ s: s.value, tx: tx.value, ty: ty.value });
  const moveTo = useCallback((c: Cam, ms: number) => {
    const cfg = { duration: still ? 1 : ms, easing: Easing.inOut(Easing.cubic) };
    s.value = withTiming(c.s, cfg); tx.value = withTiming(c.tx, cfg); ty.value = withTiming(c.ty, cfg);
  }, [s, tx, ty, still]);

  const placed = useRef(false);
  const onLayout = (w: number, h: number) => {
    vw.value = w; vh.value = h;
    setVp({ w, h });
    if (!placed.current) {
      placed.current = true;
      const home = homeCam(w, h);
      if (still) { s.value = home.s; tx.value = home.tx; ty.value = home.ty; return; }
      // 進場：從稍微放大的地方慢慢拉遠到整片星空
      const start = zoomAt(home, home.s * 1.18, w / 2, h * 0.3, w, h);
      s.value = start.s; tx.value = start.tx; ty.value = start.ty;
      moveTo(home, 1100);
    } else {
      const c = clampCam(cam(), w, h);
      s.value = c.s; tx.value = c.tx; ty.value = c.ty;
    }
  };

  /* ---------- 動畫的計時器：離開頁面全部取消 */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const charge = useSharedValue(0), flight = useSharedValue(0), impact = useSharedValue(0), pulse = useSharedValue(0);
  const meteorPts = useSharedValue<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    [s, tx, ty, charge, flight, impact, pulse].forEach((v) => cancelAnimation(v));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissHint = useCallback(() => {
    if (!hint) return;
    setHint(false);
    DB.setMeta('mem_sky_hint', '1').catch(() => {});
  }, [hint]);
  const say = (msg: string) => { setToast(msg); later(1800, () => setToast(null)); };

  /* ---------- 點星星 */
  const select = useCallback((star: Star, opts?: { wish?: boolean; keepCam?: boolean }) => {
    setSel(star);
    setWishCard(!!opts?.wish);
    tap('light');
    if (opts?.keepCam) return;
    const w = vw.value, h = vh.value;
    // 放大到照片看得清楚（小星星最多放大到 3 倍，不會突然衝太近）
    const want = Math.max(s.value, Math.min(maxScale(w, h), minScale(w, h) * 3, Math.max(minScale(w, h) * 1.7, 120 / (star.r * 2))));
    // 星星放在回憶卡上面的空間正中間
    const cardTop = h - (ins.bottom + 86 + 200);
    moveTo(focusCam(star.x, star.y, want, w, h, 0.5, Math.max(0.22, Math.min(0.45, (cardTop / 2) / h))), 700);
  }, [ins.bottom, moveTo, s, vh, vw]);

  const closeCard = useCallback(() => { setSel(null); setWishCard(false); }, []);

  const onTapAt = useCallback((x: number, y: number) => {
    dismissHint();
    const c = { s: s.value, tx: tx.value, ty: ty.value };
    const hit = nearestStar(layout.stars, (x - c.tx) / c.s, (y - c.ty) / c.s, c.s, visible);
    if (hit) select(hit);
    else if (sel) closeCard();
  }, [closeCard, dismissHint, layout, s, sel, select, tx, ty, visible]);

  /** 拖曳結束後，選中的星星如果已經不在畫面上，就收起回憶卡 */
  const onPanEnd = useCallback(() => {
    dismissHint();
    later(650, () => {
      setSel((cur) => {
        if (!cur) return cur;
        const x = cur.x * s.value + tx.value, y = cur.y * s.value + ty.value;
        return x < -20 || y < -20 || x > vw.value + 20 || y > vh.value + 20 ? null : cur;
      });
    });
  }, [dismissHint, s, tx, ty, vh, vw]);

  const nextStar = useCallback(() => {
    if (!sel) return;
    const list = layout.clusters[sel.cons].stars.filter(visible).sort((a, b) => (a.m.day < b.m.day ? -1 : a.m.day > b.m.day ? 1 : 0));
    const i = list.findIndex((x) => x.m.id === sel.m.id);
    const nx = list[(i + 1) % list.length];
    if (nx && nx !== sel) select(nx);
  }, [layout, sel, select, visible]);

  /* ---------- 許願流星 */
  const lastWish = useRef<string | null>(null);
  const busy = useRef(false);
  const wish = useCallback(() => {
    if (phase !== 'idle' || busy.current) return; // 動畫中連按也不會重來（同一瞬間按兩下也一樣）
    dismissHint();
    const pool = layout.stars.filter(visible);
    if (!pool.length) { say(tr('sky.noWish')); return; }
    busy.current = true;
    const cand = pool.filter((x) => x.m.id !== lastWish.current);
    const star = (cand.length ? cand : pool)[Math.floor(Math.random() * (cand.length || pool.length))];
    lastWish.current = star.m.id;
    setSel(null); setWishCard(false); setDay(null);
    const w = vw.value, h = vh.value;
    const ts = Math.min(maxScale(w, h), Math.max(s.value, minScale(w, h) * 1.35));
    const c = focusCam(star.x, star.y, ts, w, h, 0.5, 0.36);
    tap('light');
    if (still) { // 減少動態效果：直接打開那一天
      s.value = c.s; tx.value = c.tx; ty.value = c.ty;
      select(star, { wish: true, keepCam: true });
      busy.current = false;
      return;
    }
    setTarget(star);
    setPhase('charging');
    charge.value = 0;
    charge.value = withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) });
    moveTo(c, 700);
    later(700, () => {
      // 流星從離目標比較遠的那個上方角落飛進來（畫面外）
      const sx = star.x * c.s + c.tx;
      const fromLeft = sx > w / 2;
      const P0 = [((fromLeft ? -80 : w + 80) - c.tx) / c.s, (-60 - c.ty) / c.s];
      const P3 = [star.x, star.y];
      const dx = P3[0] - P0[0], dy = P3[1] - P0[1];
      meteorPts.value = [P0[0], P0[1], P0[0] + dx * 0.42, P0[1] + dy * 0.02, P3[0] - dx * 0.12, P3[1] - dy * 0.5, P3[0], P3[1]];
      setMeteorK(1 / c.s);
      setPhase('flying');
      flight.value = 0;
      flight.value = withTiming(1, { duration: 1400, easing: Easing.bezier(0.42, 0, 0.6, 1) });
      later(1400, () => {
        setPhase('impact');
        tap('success');
        impact.value = 0;
        impact.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) });
        pulse.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 700 }));
        setSel(star); setWishCard(true);
        later(450, () => { setPhase('idle'); setTarget(null); busy.current = false; });
      });
    });
  }, [phase, dismissHint, layout, visible, vw, vh, s, still, charge, moveTo, meteorPts, flight, impact, pulse, select, tx, ty]); // eslint-disable-line react-hooks/exhaustive-deps

  const recenter = () => { closeCard(); moveTo(homeCam(vw.value, vh.value), 650); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/search'));

  /* ---------- 手勢：一指拖曳、兩指以中點縮放、輕點選星星 */
  const interactive = phase === 'idle' && !day && !filter;
  const pan = usePanGesture({
    enabled: interactive,
    maxPointers: 1,
    onBegin: () => { 'worklet'; cancelAnimation(s); cancelAnimation(tx); cancelAnimation(ty); },
    onUpdate: (e) => {
      'worklet';
      if (pinching.value) return;
      tx.value = clampT(tx.value + e.changeX, s.value, vw.value, WORLD_W);
      ty.value = clampT(ty.value + e.changeY, s.value, vh.value, WORLD_H);
    },
    onDeactivate: (e) => {
      'worklet';
      const cw = WORLD_W * s.value, ch = WORLD_H * s.value;
      if (!pinching.value) {
        tx.value = withDecay({ velocity: e.velocityX, clamp: [Math.min(0, vw.value - cw), Math.max(0, (vw.value - cw) / 2)] });
        ty.value = withDecay({ velocity: e.velocityY, clamp: [Math.min(0, vh.value - ch), Math.max(0, (vh.value - ch) / 2)] });
      }
      scheduleOnRN(onPanEnd);
    },
  });
  const pinch = usePinchGesture({
    enabled: interactive,
    onActivate: (e) => {
      'worklet';
      pinching.value = true;
      cancelAnimation(s); cancelAnimation(tx); cancelAnimation(ty);
      p0.value = { s: s.value, tx: tx.value, ty: ty.value, fx: e.focalX, fy: e.focalY };
    },
    onUpdate: (e) => {
      'worklet';
      const a = p0.value;
      const ns = Math.min(maxScale(vw.value, vh.value), Math.max(minScale(vw.value, vh.value), a.s * e.scale));
      const wx = (a.fx - a.tx) / a.s, wy = (a.fy - a.ty) / a.s; // 兩指中點下面的世界座標，縮放時跟著手指
      const c = clampCam({ s: ns, tx: e.focalX - wx * ns, ty: e.focalY - wy * ns }, vw.value, vh.value);
      s.value = c.s; tx.value = c.tx; ty.value = c.ty;
    },
    onFinalize: () => { 'worklet'; pinching.value = false; scheduleOnRN(onPanEnd); },
  });
  const tapG = useTapGesture({
    enabled: interactive,
    maxDistance: 12,
    onActivate: (e) => { 'worklet'; scheduleOnRN(onTapAt, e.x, e.y); },
  });
  const gesture = useSimultaneousGestures(pinch, useCompetingGestures(pan, tapG));

  /* ---------- 網頁：滾輪以游標為中心縮放 */
  const boxRef = useRef<ViewInstance>(null);
  const live = useRef(interactive);
  live.current = interactive;
  const hintOff = useRef(dismissHint);
  hintOff.current = dismissHint;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = boxRef.current as unknown as { addEventListener?: Function; removeEventListener?: Function; getBoundingClientRect: () => { left: number; top: number } } | null;
    if (!el?.addEventListener) return;
    const onWheel = (ev: { preventDefault: () => void; deltaY: number; clientX: number; clientY: number }) => {
      ev.preventDefault();
      if (!live.current) return;
      hintOff.current();
      const r = el.getBoundingClientRect();
      const c = zoomAt(cam(), s.value * Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top, vw.value, vh.value);
      cancelAnimation(s); cancelAnimation(tx); cancelAnimation(ty);
      s.value = c.s; tx.value = c.tx; ty.value = c.ty;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener?.('wheel', onWheel);
  }, [vp.w > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 畫面上的光（集氣時整個畫面亮一點） */
  const glowStyle = useAnimatedStyle(() => ({ opacity: Math.sin(Math.min(1, charge.value) * Math.PI) * 0.5 }));
  const wishBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + Math.sin(Math.min(1, charge.value) * Math.PI) * 0.06 }] }));

  const starLabel = useCallback((x: Star) => tr('mem.dayA11y', { name: x.m.title, date: x.m.trusted ? TM.fmtDay(x.m.day, getLang() as TM.TMLang) : tr('mem.noDate'), n: x.m.photos.length }), []);
  const a11yStars = useMemo(() => layout.stars.filter(visible), [layout, visible]);
  const bottomCard = ins.bottom + 86;

  return (
    <View style={s_.root}>
      <StatusBar style="light" />
      <GestureDetector gesture={gesture} touchAction="none">
        <View ref={boxRef} style={StyleSheet.absoluteFill} collapsable={false}
          onLayout={(e) => onLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}>
          <Animated.View style={[s_.world, worldStyle]}>
            <SkyWorld layout={layout} info={data?.info || EMPTY_INFO} visible={visible} consOn={consOn} font={font} latin={serif.latin} still={still} />
            <ConsPulse layout={layout} cons={target?.cons ?? sel?.cons ?? null} v={pulse} />
            {sel ? <SelectRing star={sel} still={still} /> : null}
            {phase === 'flying' ? <Meteor pts={meteorPts} p={flight} k={meteorK} /> : null}
            {phase === 'impact' && target ? <Impact star={target} p={impact} k={meteorK} /> : null}
            <StarA11y stars={a11yStars} onPick={(x) => select(x)} label={starLabel} />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* 集氣時畫面微微變亮 */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="cg" cx="50%" cy="85%" r="75%">
              <Stop offset="0" stopColor="#FFD98A" stopOpacity={0.45} />
              <Stop offset="1" stopColor="#FFD98A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#cg)" />
        </Svg>
      </Animated.View>

      {/* ---------- 固定的按鈕（不跟著星空動） */}
      <View pointerEvents="box-none" style={[s_.top, { top: ins.top + 8 }]}>
        <GoldButton icon="back" label={tr('mem.back')} a11y={tr('mem.back')} onPress={back} />
        <View style={{ flex: 1 }} pointerEvents="none" />
        <GoldButton icon="filter" label={tr('sky.filter')} a11y={tr('sky.filter')} onPress={() => setFilter(true)} active={!CONS_ORDER.every((k) => consOn[k]) || kid != null} disabled={phase !== 'idle'} />
      </View>
      {demo ? <View pointerEvents="none" style={[s_.demo, { top: ins.top + 84 }]}><Text style={[font.round, s_.demoText]}>{tr('mem.demo')}</Text></View> : null}

      {hint && !sel && !empty ? (
        <View pointerEvents="none" style={[s_.hint, { bottom: ins.bottom + 92 }]}>
          {([['drag', 'sky.hintDrag', 'sky.hintDragSub'], ['pinch', 'sky.hintPinch', 'sky.hintPinchSub'], ['tap', 'sky.hintTap', 'sky.hintTapSub']] as const).map(([ic, a, b]) => (
            <View key={ic} style={s_.hintItem}>
              <Glyph name={ic} size={26} stroke={3.4} />
              <View>
                <Text style={[font.serif, s_.hintA]}>{tr(a)}</Text>
                <Text style={[font.serifR, s_.hintB]}>{tr(b)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* 許願按鈕＋集氣粒子 */}
      <View pointerEvents="box-none" style={[s_.wishWrap, { bottom: ins.bottom + 18 }]}>
        <View pointerEvents="none" style={s_.chargeCenter}>
          {phase === 'charging' ? CHARGE.map((c, i) => <ChargeDot key={i} p={charge} {...c} />) : null}
        </View>
        <GoldButton icon="recenter" label={tr('sky.recenter')} a11y={tr('sky.recenterA11y')} onPress={recenter} disabled={phase !== 'idle'} size={42}
          style={{ position: 'absolute', right: 14, bottom: 0 }} />
        <Animated.View style={wishBtnStyle}>
          <Pressable onPress={wish} disabled={phase !== 'idle' || empty} accessibilityRole="button" accessibilityLabel={tr('sky.wish')}
            accessibilityState={{ disabled: phase !== 'idle' || empty, busy: phase !== 'idle' }}
            style={({ pressed }) => [s_.wish, (phase !== 'idle' || empty) && { opacity: phase !== 'idle' ? 0.9 : 0.5 }, pressed && { transform: [{ scale: 0.97 }] }]}>
            <Sparkle size={14} />
            <Text style={[font.serif, s_.wishText]}>{phase === 'idle' ? tr('sky.wish') : tr('sky.wishing')}</Text>
            <Sparkle size={14} />
          </Pressable>
        </Animated.View>
      </View>

      {sel && phase === 'idle' && !day ? (
        <MemoryCard m={sel.m} info={data?.info || EMPTY_INFO} wish={wishCard} font={font} still={still} bottom={bottomCard}
          onOpen={() => setDay(sel.m)} onNext={nextStar} onClose={closeCard} onWishAgain={wish} />
      ) : null}

      {/* 還沒有存下來的照片 */}
      {empty ? (
        <View style={[s_.empty, { top: ins.top + 150 }]}>
          <Text style={[font.title, s_.emptyT]}>{tr('mem.emptyTitle')}</Text>
          <Text style={[font.round, s_.emptyB]}>{tr('mem.emptyBody')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Pressable onPress={() => router.navigate('/')} style={s_.emptyBtn} accessibilityRole="button">
              <Text style={[font.round, { color: '#2C2008', fontSize: 15, fontWeight: '700' }]}>{tr('mem.goHome')}</Text>
            </Pressable>
            <Pressable onPress={() => setDemo(true)} style={s_.emptyGhost} accessibilityRole="button">
              <Text style={[font.round, { color: GOLD, fontSize: 15 }]}>{tr('mem.tryDemo')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {!data ? <Text style={[font.round, s_.loading, { top: ins.top + 160 }]}>{tr('mem.loading')}</Text> : null}

      {toast ? <View pointerEvents="none" style={[s_.toast, { top: ins.top + 80 }]}><Text style={[font.round, { color: '#fff', fontSize: 13.5 }]}>{toast}</Text></View> : null}

      {filter ? (
        <FilterSheet kids={kids} kid={kid} setKid={(k) => { setKid(k); closeCard(); }} consOn={consOn} counts={counts} font={font}
          toggle={(k) => { setConsOn((c) => ({ ...c, [k]: !c[k] })); closeCard(); }} onClose={() => setFilter(false)} />
      ) : null}
      {day && data ? <DaySheet m={day} info={data.info} font={font} still={still} onClose={() => setDay(null)} onDemoTap={() => say(tr('mem.demoPhoto'))} /> : null}
    </View>
  );
}

const EMPTY_INFO = new Map<string, DB.PhotoInfo>();

const s_ = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060A21', overflow: 'hidden' },
  world: { position: 'absolute', left: 0, top: 0, width: WORLD_W, height: WORLD_H, transformOrigin: 'top left' } as ViewStyle,
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  demo: { position: 'absolute', right: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,145,100,0.92)' },
  demoText: { color: '#2A1206', fontSize: 12.5, fontWeight: '700', letterSpacing: 1 },
  hint: {
    position: 'absolute', left: 12, right: 12, maxWidth: 520, alignSelf: 'center', marginHorizontal: 'auto', flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 10, paddingHorizontal: 8, borderRadius: 18, backgroundColor: 'rgba(8,12,38,0.62)',
  } as ViewStyle,
  hintItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintA: { color: GOLD, fontSize: 13.5, letterSpacing: 1 },
  hintB: { color: '#E3DDFA', fontSize: 11.5, letterSpacing: 0.5 },
  wishWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  chargeCenter: { position: 'absolute', left: '50%', top: 26, width: 0, height: 0 },
  wish: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 30, borderRadius: 999,
    backgroundColor: 'rgba(58,38,22,0.92)', borderWidth: 2, borderColor: '#FFD98A', boxShadow: '0px 0px 22px rgba(255,200,110,0.6)',
  } as ViewStyle,
  wishText: { color: '#FFE9B8', fontSize: 20, letterSpacing: 3 },
  empty: {
    position: 'absolute', left: 20, right: 20, maxWidth: 440, alignSelf: 'center', marginHorizontal: 'auto', alignItems: 'center', gap: 8, padding: 20,
    borderRadius: 22, backgroundColor: 'rgba(10,14,42,0.86)', borderWidth: 1, borderColor: 'rgba(255,226,162,0.4)',
  } as ViewStyle,
  emptyT: { fontSize: 20, color: GOLD, textAlign: 'center' },
  emptyB: { fontSize: 14, lineHeight: 22, color: '#D9D2F5', textAlign: 'center' },
  emptyBtn: { minHeight: 46, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#FFD98A', justifyContent: 'center' },
  emptyGhost: { minHeight: 46, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.2, borderColor: GOLD, justifyContent: 'center' },
  loading: { position: 'absolute', alignSelf: 'center', color: '#D9D2F5', fontSize: 14 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(20,20,50,0.9)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
});
