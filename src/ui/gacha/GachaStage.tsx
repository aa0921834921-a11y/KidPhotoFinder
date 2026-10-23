/**
 * 回憶扭蛋機（整個畫面的動畫視窗）。
 *
 * 狀態：IDLE → TURNING → MIXING → DROPPING → OPENING → REVEAL → COMPLETE
 * - IDLE：組裝好的扭蛋機，扭蛋輕輕浮動、玻璃反光慢慢變、旋鈕偶爾閃一下；點旋鈕或機器開始
 * - 整段約 4.3 秒，全部在原生端播（同一條時間軸），JS 忙的時候也不會卡
 * - 玻璃罩裡每一顆扭蛋的翻滾是 core/gacha.ts 物理算好的；其他動作的腳本在 core/gachaShow.ts
 * - 抽到的回憶用 App 裡真的照片（臉放中間），放進拍立得
 * - 播放中不能再按；「再扭一次」會把所有圖層歸位重來；關掉視窗會停掉所有動畫和計時
 * - 手機開了「減少動態」：旋鈕轉一下，照片直接出現
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View,
  type ImageSourcePropType, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mix as runMix, REST, SET, type Cap, type Mix } from '../../core/gacha';
import { ART, CAP_FRAC, POLAROID, SCENE, type Rect } from '../../core/gachaArt';
import { choreography, CUES, dense, PHASE, PHASE_REDUCED, TWINKLES, wobble, type PhaseName, type Show, type Track } from '../../core/gachaShow';
import * as TM from '../../core/timeMachine';
import { getLang, tr, useLang } from '../../i18n';
import { backdropStyle, Btn, Icon, NightGlow } from '../kit';
import { Photo, useBest } from '../memPhoto';
import { useTheme, type Theme } from '../theme';
import { IMG } from './images';
import { makeSounds } from './sound';

type AV = Animated.Value | Animated.AnimatedInterpolation<number | string> | Animated.AnimatedNode;
type N = Animated.AnimatedInterpolation<number>;

const lang = () => getLang() as TM.TMLang;
const clampCfg = { extrapolate: 'clamp' as const };

export function GachaStage({ visible, events, onClose, onPicked, onOpenEvent }: {
  visible: boolean;
  events: TM.TMEvent[];
  onClose: () => void;
  onPicked: (e: TM.TMEvent) => void;
  onOpenEvent: (e: TM.TMEvent) => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent={false}>
      {visible ? <Stage events={events} onClose={onClose} onPicked={onPicked} onOpenEvent={onOpenEvent} /> : null}
    </Modal>
  );
}

/* ---------------------------------------------------------------- 版面 */

function layout(W: number, H: number, top: number, bottom: number) {
  const headerH = 54, hintH = 40;
  const availTop = top + headerH;
  const availH = Math.max(200, H - availTop - bottom - hintH);
  // 寬度用蕾絲墊的寬來算（兩邊的花葉可以稍微超出畫面），機器才夠大
  const s = Math.min((W - 8) / 1700, availH / SCENE.h, 0.34);
  const sw = SCENE.w * s, sh = SCENE.h * s;
  const left = (W - sw) / 2;
  const sceneTop = availTop + Math.max(0, (availH - sh) / 2) * 0.7;
  const cardH = 200;
  const cardTop = H - bottom - cardH - 10;
  let wP = Math.min(W * 0.66, 300, availH * 0.5);
  let hP = (wP * POLAROID.h) / POLAROID.w;
  let cy = sceneTop + (560 - SCENE.y) * s;
  const minTop = availTop + 8, maxBottom = cardTop - 16;
  if (cy - hP / 2 < minTop) cy = minTop + hP / 2;
  if (cy + hP / 2 > maxBottom) {
    hP = Math.max(110, maxBottom - minTop);
    wP = (hP * POLAROID.w) / POLAROID.h;
    cy = minTop + hP / 2;
  }
  return {
    s, left, top: sceneTop, sw, sh, cardTop, cardH, wP, hP, hintTop: sceneTop + sh - 6,
    pol: { cx: 605.5, cy: (cy - sceneTop) / s + SCENE.y, w: wP / s, h: hP / s },
  };
}

/* ---------------------------------------------------------------- 動畫值 */

function interp(tl: Animated.Value, tr: Track | undefined, map: (v: number) => number = (v) => v, fallback = 0): N {
  if (!tr || !tr.length) return tl.interpolate({ inputRange: [0, 1], outputRange: [map(fallback), map(fallback)], ...clampCfg });
  const d = dense(tr);
  return tl.interpolate({ inputRange: d.t, outputRange: d.v.map(map), ...clampCfg });
}
function interpDeg(tl: Animated.Value, tr: Track | undefined): Animated.AnimatedInterpolation<string> {
  if (!tr || !tr.length) return tl.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '0deg'], ...clampCfg });
  const d = dense(tr);
  return tl.interpolate({ inputRange: d.t, outputRange: d.v.map((v) => `${v.toFixed(2)}deg`), ...clampCfg });
}
const toDeg = (n: AV) => (n as Animated.Value).interpolate({ inputRange: [-7200, 7200], outputRange: ['-7200deg', '7200deg'] });
/** 一個 0→1 的循環裡，用取樣點描出的形狀 */
function loopShape(v: Animated.Value, f: (u: number) => number, n = 48) {
  const inputRange: number[] = [], outputRange: number[] = [];
  for (let i = 0; i <= n; i++) { inputRange.push(i / n); outputRange.push(f(i / n)); }
  return v.interpolate({ inputRange, outputRange });
}

/* ---------------------------------------------------------------- 畫面 */

function Stage({ events, onClose, onPicked, onOpenEvent }: {
  events: TM.TMEvent[]; onClose: () => void; onPicked: (e: TM.TMEvent) => void; onOpenEvent: (e: TM.TMEvent) => void;
}) {
  const t = useTheme();
  useLang();
  const { width: W, height: H } = useWindowDimensions();
  const ins = useSafeAreaInsets();
  const L = useMemo(() => layout(W, H, ins.top, ins.bottom), [W, H, ins.top, ins.bottom]);
  const s = L.s;
  const st = useMemo(() => styles(t), [t]);

  const [phase, setPhase] = useState<PhaseName>('IDLE');
  const [reduced, setReduced] = useState(false);
  const [pick, setPick] = useState<TM.TMEvent | null>(null);
  const rest: Cap[] = REST;
  const [run, setRun] = useState<{ n: number; mix: Mix | null; show: Show } | null>(null);
  const tl = useRef(new Animated.Value(0)).current;
  const idle = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const idleLoop = useRef<Animated.CompositeAnimation | null>(null);
  const next = useRef<Mix | null>(null);
  const last = useRef<string | null>(null);
  const busy = useRef(false);
  const sounds = useRef<ReturnType<typeof makeSounds> | null>(null);

  // 減少動態
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);

  // 待機的循環：扭蛋浮動、反光、旋鈕的光、小星星
  useEffect(() => {
    if (reduced) return;
    idleLoop.current = Animated.loop(Animated.timing(idle, { toValue: 1, duration: 6400, easing: Easing.linear, useNativeDriver: true }));
    idleLoop.current.start();
    return () => idleLoop.current?.stop();
  }, [idle, reduced]);

  // 聲音、第一次轉動先算好；離開時全部清掉
  useEffect(() => {
    sounds.current = makeSounds();
    const id = setTimeout(() => { if (!next.current) next.current = runMix(rest, Date.now() >>> 0); }, 160);
    return () => {
      clearTimeout(id);
      timers.current.forEach(clearTimeout); timers.current = [];
      running.current?.stop(); idleLoop.current?.stop();
      tl.stopAnimation(); idle.stopAnimation(); fade.stopAnimation();
      sounds.current?.release(); sounds.current = null;
    };
  }, [rest, tl, idle, fade]);

  const spin = useCallback(() => {
    if (busy.current) return;
    const ev = TM.gacha(events, last.current);
    if (!ev) return;
    busy.current = true;
    last.current = ev.folder;
    setPick(ev);
    onPicked(ev);
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    let m: Mix | null = null;
    if (!reduced) {
      m = next.current || runMix(run?.mix?.end || rest, seed);
      next.current = null;
    }
    const r = m ? SET[m.out].r : 136;
    const show = choreography({ r, pol: L.pol, reduced, seed });
    setRun((p) => ({ n: (p?.n || 0) + 1, mix: m, show }));
  }, [events, reduced, run, rest, L.pol, onPicked]);

  // 新的一次轉動：圖層都準備好之後才開始播
  useEffect(() => {
    if (!run) return;
    idleLoop.current?.stop();
    timers.current.forEach(clearTimeout); timers.current = [];
    tl.setValue(0);
    fade.setValue(1);
    const ph = reduced ? PHASE_REDUCED : PHASE;
    setPhase('TURNING');
    const at = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
    if (!reduced) {
      at(ph.MIXING, () => setPhase('MIXING'));
      at(ph.DROPPING, () => setPhase('DROPPING'));
      at(ph.OPENING, () => setPhase('OPENING'));
      for (const c of CUES) at(c.at, () => { if (c.sound) sounds.current?.play(c.sound, c.volume); if (c.tap) sounds.current?.tap(c.tap); });
    }
    at(ph.REVEAL, () => setPhase('REVEAL'));
    at(ph.COMPLETE, () => { setPhase('COMPLETE'); busy.current = false; });
    running.current = Animated.timing(tl, { toValue: run.show.end, duration: run.show.end, easing: Easing.linear, useNativeDriver: true });
    running.current.start();
    // 下一次轉動先算好（從這次停下來的樣子開始）
    if (run.mix) {
      const end = run.mix.end;
      at(ph.MIXING + 200, () => { next.current = runMix(end, (Date.now() * 7) >>> 0); });
    }
  }, [run, tl, fade, reduced]);

  const again = useCallback(() => {
    if (phase !== 'COMPLETE') return;
    setPhase('IDLE');
    Animated.timing(fade, { toValue: 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => spin());
  }, [phase, fade, spin]);

  /* ---------- 動畫值（每次轉動重算） */
  const show = run?.show;
  const mixNow = run?.mix || null;
  const A = useMemo(() => {
    const tk = show?.tracks || {};
    const X = (v: number) => (v - SCENE.x) * s;
    const Y = (v: number) => (v - SCENE.y) * s;
    const capR = show && mixNow ? SET[mixNow.out].r : 136;
    const capPx = ((2 * capR) / CAP_FRAC) * s;
    return {
      knobRot: interpDeg(tl, tk.knobRot),
      glintX: interp(tl, tk.glintX, (v) => v * ART.knob.d * s, -2),
      glintO: interp(tl, tk.glintO),
      shakeX: interp(tl, tk.shakeX, (v) => v * s),
      shadeO: interp(tl, tk.shadeO),
      holeGlowO: interp(tl, tk.holeGlowO),
      inO: interp(tl, tk.inO),
      inDark: interp(tl, tk.inDark),
      outO: interp(tl, tk.outO),
      openO: Animated.multiply(interp(tl, tk.openO), fade),
      capPx,
      capX: interp(tl, tk.capX, (v) => X(v) - capPx / 2),
      capY: interp(tl, tk.capY, (v) => Y(v) - capPx / 2),
      capXr: interp(tl, tk.capX),
      capYr: interp(tl, tk.capY),
      capS: interp(tl, tk.capS, (v) => v, 1),
      capSY: interp(tl, tk.capSY, (v) => v, 1),
      capRn: interp(tl, tk.capR),
      upDX: interp(tl, tk.upDX), upDY: interp(tl, tk.upDY), upR: interp(tl, tk.upR),
      loDX: interp(tl, tk.loDX), loDY: interp(tl, tk.loDY), loR: interp(tl, tk.loR),
      shX: interp(tl, tk.shX, (v) => X(v)), shO: interp(tl, tk.shO), shS: interp(tl, tk.shS, (v) => v, 1),
      glowO: Animated.multiply(interp(tl, tk.glowO), fade), glowS: interp(tl, tk.glowS, (v) => v, 1),
      polX: interp(tl, tk.polX, (v) => X(v) - L.wP / 2, L.pol.cx), polY: interp(tl, tk.polY, (v) => Y(v) - L.hP / 2, L.pol.cy),
      polS: interp(tl, tk.polS, (v) => v, 1), polR: interpDeg(tl, tk.polR), polO: Animated.multiply(interp(tl, tk.polO), fade),
      fxO: Animated.multiply(interp(tl, tk.fxO), fade), fxR: interpDeg(tl, tk.fxR), fxS: interp(tl, tk.fxS, (v) => v, 1),
      dimO: Animated.multiply(interp(tl, tk.dimO), fade),
      cardO: Animated.multiply(interp(tl, tk.cardO), fade), cardY: interp(tl, tk.cardY),
      mixGlow: interp(tl, [[250, 0], [600, 0.55], [1450, 0.55], [1900, 0]]),
      arrowsO: interp(tl, tk.arrowsO), arrowsR: interpDeg(tl, tk.arrowsR),
      orbitAO: interp(tl, tk.orbitAO), orbitAR: interpDeg(tl, tk.orbitAR), orbitAS: interp(tl, tk.orbitAS, (v) => v, 1),
      orbitBO: interp(tl, tk.orbitBO), orbitBR: interpDeg(tl, tk.orbitBR), orbitBS: interp(tl, tk.orbitBS, (v) => v, 1),
      motionO: interp(tl, tk.motionO), motionS: interp(tl, tk.motionS, (v) => v, 1),
      raysO: Animated.multiply(interp(tl, tk.raysO), fade), raysS: interp(tl, tk.raysS, (v) => v, 1), raysR: interpDeg(tl, tk.raysR),
    };
  }, [show, mixNow, s, tl, fade, L.wP, L.hP, L.pol.cx, L.pol.cy]);

  const X = (v: number) => (v - SCENE.x) * s;
  const Y = (v: number) => (v - SCENE.y) * s;
  const R = (r: Rect) => ({ position: 'absolute' as const, left: X(r.x), top: Y(r.y), width: r.w * s, height: r.h * s });
  const img = (src: ImageSourcePropType, r: Rect, extra?: object) => (
    <Image source={src} style={[R(r), extra]} resizeMode="stretch" fadeDuration={0} />
  );

  const outKind = mixNow ? SET[mixNow.out].kind : 'pink';
  const idleOn = phase === 'IDLE' && !run;
  const canTap = phase === 'IDLE' && !busy.current;
  const lg = lang();

  /* ---------- 玻璃罩裡的扭蛋 */
  const caps = useMemo(() => SET.map((c, i) => {
    const size = ((2 * c.r) / CAP_FRAC) * s;
    const cx = (v: number) => (v - ART.clip.x) * s - size / 2;
    const cy = (v: number) => (v - ART.clip.y) * s - size / 2;
    let tx: AV | number, ty: AV | number, rot: AV | string, op: AV | number = 1;
    if (mixNow && !reduced) {
      const f = mixNow.frames[i];
      const xs: number[] = [], ys: number[] = [], as: string[] = [];
      for (let k = 0; k < mixNow.times.length; k++) { xs.push(cx(f[k * 3])); ys.push(cy(f[k * 3 + 1])); as.push(`${f[k * 3 + 2].toFixed(1)}deg`); }
      tx = tl.interpolate({ inputRange: mixNow.times, outputRange: xs, ...clampCfg });
      ty = tl.interpolate({ inputRange: mixNow.times, outputRange: ys, ...clampCfg });
      rot = tl.interpolate({ inputRange: mixNow.times, outputRange: as, ...clampCfg });
      if (mixNow.showAt[i]) op = tl.interpolate({ inputRange: [0, 280], outputRange: [0, 1], ...clampCfg });
    } else {
      const p = rest[i];
      tx = cx(p.x); ty = cy(p.y); rot = `${p.a.toFixed(1)}deg`;
      if (!p.on) op = 0;
    }
    const w = wobble(i);
    const wy = loopShape(idle, (u) => Math.sin(2 * Math.PI * (w.cycles * u + w.phase)) * w.dy * s);
    const wr = loopShape(idle, (u) => Math.sin(2 * Math.PI * (w.cycles * u + w.phase + 0.25)) * w.rot).interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] });
    return { i, layer: c.layer, el: (
      <Animated.View key={`c${i}-${run?.n || 0}`} style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, opacity: op as never,
        transform: [{ translateX: tx as never }, { translateY: ty as never }] }}>
        <Animated.View style={{ width: size, height: size, transform: idleOn ? [{ translateY: wy }, { rotate: wr }] : [] }}>
          <Animated.Image source={IMG.cap[c.kind]} style={{ width: size, height: size, opacity: c.layer === 0 ? 0.95 : 1, transform: [{ rotate: rot as never }] }} fadeDuration={0} />
        </Animated.View>
      </Animated.View>
    ) };
  }), [mixNow, reduced, rest, s, tl, idle, idleOn, run?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 掉出來的那顆（兩個半殼合起來） */
  const capRot = useMemo(() => toDeg(A.capRn), [A]);
  const capsule = (opacity: AV, key: string, withShift: boolean) => {
    const size = A.capPx;
    const half = (src: number, dx: N, dy: N, r: N) => (
      <Animated.Image source={src} fadeDuration={0} style={{
        position: 'absolute', left: 0, top: 0, width: size, height: size,
        // 容器在打開時放大 1.35 倍，位移要除回來
        transform: withShift
          ? [{ translateX: Animated.multiply(dx, s / 1.35) as never }, { translateY: Animated.multiply(dy, s / 1.35) as never }, { rotate: toDeg(Animated.add(A.capRn, r)) as never }]
          : [{ rotate: capRot as never }],
      }} />
    );
    return (
      <Animated.View key={key} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, opacity: opacity as never,
        transform: [{ translateX: A.capX as never }, { translateY: A.capY as never }, { scale: A.capS as never }, { scaleY: A.capSY as never }] }}>
        {half(IMG.half[outKind].l, A.loDX, A.loDY, A.loR)}
        {half(IMG.half[outKind].u, A.upDX, A.upDY, A.upR)}
      </Animated.View>
    );
  };

  const inCap = useMemo(() => (run && !reduced ? capsule(A.inO, 'in', false) : null), [A, run, reduced, outKind]); // eslint-disable-line react-hooks/exhaustive-deps
  const outCap = useMemo(() => (run && !reduced ? capsule(A.outO, 'out', false) : null), [A, run, reduced, outKind]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCap = useMemo(() => (run && !reduced ? capsule(A.openO, 'open', true) : null), [A, run, reduced, outKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const bits = useMemo(() => (!reduced && show ? show.bits.map((b, i) => {
    const sz = b.size * s;
    const src = b.kind === 'star' ? IMG.star : b.kind === 'heart' ? IMG.heart : IMG.heart2;
    return (
      <Animated.Image key={`b${i}`} source={src} fadeDuration={0} style={{
        position: 'absolute', left: 0, top: 0, width: sz, height: sz,
        opacity: Animated.multiply(interp(tl, b.o), fade),
        transform: [{ translateX: interp(tl, b.x, (v) => X(v) - sz / 2) }, { translateY: interp(tl, b.y, (v) => Y(v) - sz / 2) }, { rotate: interpDeg(tl, b.r) }, { scale: interp(tl, b.s, (v) => v, 1) }],
      }} />
    );
  }) : null), [show, reduced, s, tl, fade]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = ART.knob;
  const kd = k.d * s;
  const tagW = (POLAROID.tag.w / POLAROID.w) * L.wP;

  return (
    <View style={[StyleSheet.absoluteFill, t.id === 'book' ? { backgroundColor: '#FFF9EE' } : backdropStyle(t)]}>
      <NightGlow />
      {/* 標題列 */}
      <View style={[st.header, { paddingTop: ins.top + 6 }]}>
        <Pressable onPress={onClose} hitSlop={10} style={st.close} accessibilityRole="button" accessibilityLabel={tr('tm.close')}>
          <Icon name="x" size={22} color={t.c.ink2} />
        </Pressable>
        <Text style={st.title} numberOfLines={1}>{tr('tm.gacha')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 扭蛋機 */}
      <Pressable onPress={canTap ? spin : undefined} disabled={!canTap} accessibilityRole="button" accessibilityLabel={tr('gacha.machine')}
        accessibilityState={{ disabled: !canTap }} style={{ position: 'absolute', left: L.left, top: L.top, width: L.sw, height: L.sh }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* 旁邊一閃一閃的小星星 */}
          {!reduced && TWINKLES.map((tw, i) => {
            const sz = tw.size * s;
            const o = loopShape(idle, (u) => Math.pow(Math.max(0, Math.sin(2 * Math.PI * (2 * u + tw.phase))), 3) * (idleOn ? 0.95 : 0));
            const sc = loopShape(idle, (u) => 0.6 + 0.4 * Math.max(0, Math.sin(2 * Math.PI * (2 * u + tw.phase))));
            return <Animated.Image key={`tw${i}`} source={IMG.star} fadeDuration={0} style={{ position: 'absolute', left: X(tw.x) - sz / 2, top: Y(tw.y) - sz / 2, width: sz, height: sz, opacity: o, transform: [{ scale: sc }] }} />;
          })}
          {img(IMG.doily, ART.doily)}
          {img(IMG.shadow, { x: ART.base.x - 40, y: ART.base.y + ART.base.h - 74, w: ART.base.w + 80, h: 130 }, { opacity: 0.5 })}

          {/* 底座（轉動時輕輕震動；玻璃罩不動） */}
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: A.shakeX }] }]}>
            {img(IMG.base, ART.base)}
            <Animated.Image source={IMG.holeShade} fadeDuration={0} style={[R(ART.holeShade), { opacity: A.shadeO }]} />
            <Animated.Image source={IMG.holeGlow} fadeDuration={0} style={[R(ART.holeGlow), { opacity: A.holeGlowO }]} />
            {inCap}
            <Animated.Image source={IMG.holeShade} fadeDuration={0} style={[R(ART.holeShade), { opacity: A.inDark }]} />
            {img(IMG.baseFront, ART.baseFront)}
            {/* 旋鈕：繞自己的圓心轉；金屬的光掃過去 */}
            <View style={{ position: 'absolute', left: X(k.cx) - kd / 2, top: Y(k.cy) - kd / 2, width: kd, height: kd, transform: [{ scaleY: k.sy }] }}>
              <Animated.Image source={IMG.knob} fadeDuration={0} style={{ width: kd, height: kd, transform: [{ rotate: A.knobRot }] }} />
              <View style={{ position: 'absolute', left: kd * 0.05, top: kd * 0.05, width: kd * 0.9, height: kd * 0.9, borderRadius: kd, overflow: 'hidden' }}>
                <Animated.Image source={IMG.knobGlint} fadeDuration={0} style={{ position: 'absolute', left: 0, top: 0, width: kd * 0.9, height: kd * 0.9, opacity: A.glintO, transform: [{ translateX: A.glintX }] }} />
                {idleOn && !reduced ? (
                  <Animated.Image source={IMG.knobGlint} fadeDuration={0} style={{
                    position: 'absolute', left: 0, top: 0, width: kd * 0.9, height: kd * 0.9,
                    opacity: loopShape(idle, (u) => (u > 0.52 && u < 0.7 ? Math.sin(((u - 0.52) / 0.18) * Math.PI) * 0.75 : 0)),
                    transform: [{ translateX: loopShape(idle, (u) => (Math.min(1, Math.max(0, (u - 0.52) / 0.18)) * 2.2 - 1.1) * kd) }],
                  }} />
                ) : null}
              </View>
              {idleOn && !reduced ? (
                <Animated.View style={{
                  position: 'absolute', left: 0, top: 0, width: kd, height: kd, borderRadius: kd, borderWidth: Math.max(2, kd * 0.035), borderColor: '#F3D58A',
                  opacity: loopShape(idle, (u) => { const v = (u * 3) % 1; return v < 0.45 ? (1 - v / 0.45) * 0.7 : 0; }),
                  transform: [{ scale: loopShape(idle, (u) => { const v = (u * 3) % 1; return 1 + Math.min(v / 0.45, 1) * 0.32; }) }],
                }} />
              ) : null}
              {/* 轉動時旋鈕旁的弧形箭頭 */}
              {run && !reduced ? (
                <Animated.Image source={IMG.arrows} fadeDuration={0} style={{
                  position: 'absolute', left: -kd * 0.27, top: -kd * 0.27, width: kd * 1.54, height: kd * 1.54,
                  opacity: A.arrowsO, transform: [{ rotate: A.arrowsR }],
                }} />
              ) : null}
            </View>
          </Animated.View>

          {/* 玻璃罩：後面的玻璃 → 扭蛋 → 前面的反光 → 頂蓋、金框 */}
          {img(IMG.globeBack, ART.globeBack)}
          <View style={[R(ART.clip), { overflow: 'hidden' }]}>
            {caps.filter((c) => c.layer === 0).map((c) => c.el)}
            {caps.filter((c) => c.layer === 1).map((c) => c.el)}
          </View>
          {img(IMG.globeFront, ART.globeFront)}
          {!reduced ? (
            <Animated.Image source={IMG.globeGlow} fadeDuration={0} style={[R(ART.globeGlow), {
              opacity: idleOn ? loopShape(idle, (u) => 0.12 + 0.3 * Math.pow(Math.sin(Math.PI * u), 2)) : A.mixGlow,
            }]} />
          ) : null}
          {img(IMG.globeTop, ART.globeTop)}
          {img(IMG.globeRim, ART.globeRim)}
          {/* 翻滾時：繞著玻璃罩的金色光帶、兩旁的動態線 */}
          {run && !reduced ? (() => {
            const gb = ART.globeBack;
            const gcx = gb.x + gb.w / 2, gcy = gb.y + gb.h / 2;
            const orbit = (w: number, cy: number, o: AV, r: AV, sc: AV, flip: boolean) => (
              <Animated.Image source={IMG.orbit} fadeDuration={0} style={{
                position: 'absolute', left: X(gcx - w / 2), top: Y(cy - w * 0.2), width: w * s, height: w * 0.4 * s,
                opacity: o as never, transform: [{ rotate: r as never }, { scale: sc as never }, { scaleX: flip ? -1 : 1 }],
              }} />
            );
            const mw = 150, mh = 250;
            const line = (x: number, flip: boolean) => (
              <Animated.Image source={IMG.motion} fadeDuration={0} style={{
                position: 'absolute', left: X(x), top: Y(gcy - mh / 2), width: mw * s, height: mh * s,
                opacity: A.motionO, transform: [{ scale: A.motionS }, { scaleX: flip ? -1 : 1 }],
              }} />
            );
            return (
              <>
                {orbit(1420, gcy + 62, A.orbitAO, A.orbitAR, A.orbitAS, false)}
                {orbit(1300, gcy - 78, A.orbitBO, A.orbitBR, A.orbitBS, true)}
                {line(gb.x + gb.w + 18, false)}
                {line(gb.x - 18 - mw, true)}
              </>
            );
          })() : null}
          {img(IMG.flowerL, ART.flowerL)}
          {img(IMG.flowerR, ART.flowerR)}

          {/* 地上的影子、掉出來的扭蛋（前景） */}
          {run && !reduced ? (
            <>
              <Animated.Image source={IMG.shadow} fadeDuration={0} style={{
                position: 'absolute', left: -A.capPx * 0.45, top: Y(2122) - A.capPx * 0.13, width: A.capPx * 0.9, height: A.capPx * 0.26,
                opacity: A.shO, transform: [{ translateX: A.shX }, { scaleX: A.shS }],
              }} />
              {outCap}
            </>
          ) : null}
        </View>
      </Pressable>

      {/* 待機提示 */}
      {phase === 'IDLE' && !run ? (
        <Text style={[st.hint, { top: L.hintTop }]} pointerEvents="none">{tr('gacha.tapKnob')}</Text>
      ) : null}

      {/* 揭曉：背景淡一點、光、光環、打開的扭蛋、拍立得、星星愛心 */}
      {run ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.id === 'book' ? '#FFF9EE' : t.c.bg, opacity: A.dimO }]} />
          <View style={{ position: 'absolute', left: L.left, top: L.top, width: L.sw, height: L.sh }}>
            {!reduced && show ? (() => {
              const g = A.capPx * 3.1;
              return <Animated.Image source={IMG.rays} fadeDuration={0} style={{ position: 'absolute', left: X(show.spot.x) - g / 2, top: Y(show.spot.y) - g / 2, width: g, height: g, opacity: A.raysO, transform: [{ rotate: A.raysR }, { scale: A.raysS }] }} />;
            })() : null}
            {!reduced && show ? (() => {
              const g = A.capPx * CAP_FRAC * 1.35 * 1.3;
              return <Animated.Image source={IMG.glow} fadeDuration={0} style={{ position: 'absolute', left: X(show.spot.x) - g / 2, top: Y(show.spot.y) - g / 2, width: g, height: g, opacity: A.glowO, transform: [{ scale: A.glowS }] }} />;
            })() : null}
            {!reduced ? (() => {
              const f = L.wP * 1.55;
              return <Animated.Image source={IMG.fx} fadeDuration={0} style={{ position: 'absolute', left: X(L.pol.cx) - f / 2, top: Y(L.pol.cy) - f / 2, width: f, height: f, opacity: A.fxO, transform: [{ rotate: A.fxR }, { scale: A.fxS }] }} />;
            })() : null}
            {/* 拍立得 */}
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: L.wP, height: L.hP, opacity: A.polO,
              transform: [{ translateX: A.polX }, { translateY: A.polY }, { rotate: A.polR }, { scale: A.polS }] }}>
              {pick ? <PolaroidPhoto ev={pick} w={L.wP} h={L.hP} /> : null}
              <Image source={IMG.polaroid} style={{ position: 'absolute', left: 0, top: 0, width: L.wP, height: L.hP }} resizeMode="stretch" fadeDuration={0} />
              {pick ? (
                <View style={{
                  position: 'absolute', width: tagW, left: (POLAROID.tag.cx / POLAROID.w) * L.wP - tagW / 2,
                  top: (POLAROID.tag.cy / POLAROID.h) * L.hP - Math.max(10, L.wP * 0.052) * 0.72, transform: [{ rotate: `${POLAROID.tag.rot}deg` }],
                }}>
                  <Text style={[st.tag, { fontSize: Math.max(10, L.wP * 0.052) }]} numberOfLines={1}>{TM.fmtDay(pick.day, lg)}</Text>
                </View>
              ) : null}
            </Animated.View>
            {/* 打開的兩個半殼（在拍立得前面，像參考圖） */}
            {!reduced ? openCap : null}
            {bits}
          </View>
        </View>
      ) : null}

      {/* 結果卡 */}
      {run && pick ? (
        <Animated.View pointerEvents={phase === 'COMPLETE' ? 'auto' : 'none'} accessibilityLiveRegion="polite"
          style={[st.card, { top: L.cardTop, minHeight: L.cardH, opacity: A.cardO, transform: [{ translateY: A.cardY }] }]}>
          <Text style={st.cardTitle} numberOfLines={2}>{pick.name}</Text>
          <Text style={st.cardDate} numberOfLines={1}>{TM.fmtDay(pick.day, lg)}　·　{tr('common.photos', { n: pick.photos.length })}</Text>
          <Text style={st.cardAgo} numberOfLines={1}>{TM.since(pick.day, lg)}{pick.parent ? `　·　${pick.parent}` : ''}</Text>
          <View style={st.btns}>
            <Btn title={tr('gacha.view')} onPress={() => onOpenEvent(pick)} style={{ flex: 1 }} small />
            <Btn title={tr('gacha.again')} kind="ghost" onPress={again} style={{ flex: 1 }} small />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** 拍立得裡的照片：放在相框的窗口位置、跟相框一樣的傾斜角度 */
function PolaroidPhoto({ ev, w, h }: { ev: TM.TMEvent; w: number; h: number }) {
  const best = useBest(ev, 1);
  const id = best[0]?.file_id || ev.photos[0]?.id;
  const p = POLAROID.photo;
  const pw = (p.w / POLAROID.w) * w, ph = (p.h / POLAROID.h) * h;
  return (
    <View style={{ position: 'absolute', left: (p.cx / POLAROID.w) * w - pw / 2, top: (p.cy / POLAROID.h) * h - ph / 2, width: pw, height: ph, transform: [{ rotate: `${p.rot}deg` }] }}>
      {id ? <Photo id={id} info={best[0]} w={pw} h={ph} radius={1} bg="#F6EFE6" /> : null}
    </View>
  );
}

function styles(t: Theme) {
  const c = t.c;
  return StyleSheet.create({
    header: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, zIndex: 5 },
    close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' },
    title: { ...t.title, flex: 1, textAlign: 'center', fontSize: 19, color: c.headTitle },
    hint: { ...t.round, position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 15, color: c.accentDeep },
    tag: { ...t.round, textAlign: 'center', color: '#8A6A58' },
    card: {
      position: 'absolute', left: 14, right: 14, padding: 16, paddingBottom: 14, gap: 4,
      backgroundColor: c.card, borderWidth: t.border, borderColor: c.line,
      borderTopLeftRadius: t.radius.tl + 4, borderTopRightRadius: t.radius.tr + 4, borderBottomRightRadius: t.radius.br + 4, borderBottomLeftRadius: t.radius.bl + 4,
      boxShadow: t.shadow,
    } as ViewStyle,
    cardTitle: { ...t.title, fontSize: 19, lineHeight: 26, color: c.ink },
    cardDate: { ...t.round, fontSize: 14, color: c.accentDeep },
    cardAgo: { ...t.round, fontSize: 13, color: c.muted },
    btns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  });
}
