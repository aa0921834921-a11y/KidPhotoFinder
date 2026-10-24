/**
 * 星空裡會動的光：選中星星的光圈、許願的流星、命中時的金色漣漪和粒子。
 * 都畫在世界座標裡（跟星星同一個變換），所以位置一定對齊。k = 1 / 鏡頭縮放，讓光的大小在螢幕上看起來固定。
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { bezier } from '../camera';
import { CONS } from '../constellations';
import type { Star } from '../layout';

/* ---------------------------------------------------------------- 選中的光圈（跟星球同一個中心） */

export function SelectRing({ star, still }: { star: Star; still: boolean }) {
  const c = CONS[star.cons].color;
  const v = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    v.value = 0;
    v.value = withTiming(1, { duration: still ? 1 : 320, easing: Easing.out(Easing.cubic) });
    pulse.value = 0;
    if (!still) pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) })), -1, false);
  }, [star, still, v, pulse]);
  const R = star.r + Math.max(10, star.r * 0.22);
  const ring = useAnimatedStyle(() => ({
    opacity: v.value * (0.75 + pulse.value * 0.25),
    transform: [{ scale: interpolate(v.value, [0, 0.7, 1], [0.7, 1.08, 1]) * (1 + pulse.value * 0.04) }],
  }));
  const size = R * 2 + 40;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: star.x - size / 2, top: star.y - size / 2, width: size, height: size }, ring]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="sr" cx="50%" cy="50%" r="50%">
            <Stop offset={String((R - 6) / (size / 2))} stopColor={c} stopOpacity={0} />
            <Stop offset={String(R / (size / 2))} stopColor="#FFF6D8" stopOpacity={0.8} />
            <Stop offset="1" stopColor={c} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#sr)" />
        <Circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#FFF3CF" strokeWidth={2.2} />
      </Svg>
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- 流星 */

const TRAIL = 14;

function TrailDot({ i, pts, p, k }: { i: number; pts: SharedValue<number[]>; p: SharedValue<number>; k: number }) {
  const st = useAnimatedStyle(() => {
    const t = p.value - (i + 1) * 0.021;
    if (t <= 0 || p.value >= 1) return { opacity: 0 };
    const b = bezier(pts.value, t);
    const f = 1 - i / TRAIL;
    return { opacity: 0.85 * f, transform: [{ translateX: b.x }, { translateY: b.y }, { scale: 0.35 + f * 0.75 }] };
  });
  const d = 12 * k;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: i < 4 ? '#FFF1C2' : i < 9 ? '#C9B8FF' : '#7FA8FF' }, st]} />
  );
}

/** pts：[x0,y0, x1,y1, x2,y2, x3,y3] 世界座標的貝茲曲線；p：0 → 1 */
export function Meteor({ pts, p, k }: { pts: SharedValue<number[]>; p: SharedValue<number>; k: number }) {
  const L = 230 * k, T = 16 * k, H = 64 * k;
  const head = useAnimatedStyle(() => {
    const b = bezier(pts.value, Math.min(1, p.value));
    return { opacity: p.value <= 0 || p.value >= 1 ? 0 : 1, transform: [{ translateX: b.x }, { translateY: b.y }, { rotate: `${b.a}rad` }] };
  });
  return (
    <>
      {Array.from({ length: TRAIL }, (_, i) => <TrailDot key={i} i={i} pts={pts} p={p} k={k} />)}
      {/* 0×0 的盒子放在流星頭上，轉向前進的方向；尾巴在後面 */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }, head]}>
        <Svg width={L} height={T} style={{ position: 'absolute', left: -L, top: -T / 2 }}>
          <Defs>
            <LinearGradient id="mt" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#5BAAFF" stopOpacity={0} />
              <Stop offset="0.55" stopColor="#9A7FFF" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#FFF5CA" stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={T * 0.2} width={L} height={T * 0.6} rx={T * 0.3} fill="url(#mt)" />
        </Svg>
        <Svg width={H} height={H} style={{ position: 'absolute', left: -H / 2, top: -H / 2 }}>
          <Defs>
            <RadialGradient id="mh" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.3" stopColor="#FFF4B7" />
              <Stop offset="1" stopColor="#FFB84C" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={H / 2} cy={H / 2} r={H / 2} fill="url(#mh)" />
          <Path d={`M${H / 2} ${H * 0.1}V${H * 0.9}M${H * 0.1} ${H / 2}H${H * 0.9}`} stroke="#FFF3C7" strokeWidth={2 * k} strokeOpacity={0.8} />
        </Svg>
      </Animated.View>
    </>
  );
}

/* ---------------------------------------------------------------- 命中：金色漣漪＋粒子 */

function Ring({ x, y, p, delay, max, color }: { x: number; y: number; p: SharedValue<number>; delay: number; max: number; color: string }) {
  const st = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (p.value - delay) / (1 - delay)));
    return { opacity: t <= 0 ? 0 : (1 - t) * 0.95, transform: [{ scale: 0.25 + t * 1 }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - max, top: y - max, width: max * 2, height: max * 2, borderRadius: max, borderWidth: Math.max(2, max * 0.05), borderColor: color }, st]} />;
}

function Bit({ x, y, p, ang, dist, size, color }: { x: number; y: number; p: SharedValue<number>; ang: number; dist: number; size: number; color: string }) {
  const st = useAnimatedStyle(() => {
    const t = p.value;
    const e = 1 - (1 - t) * (1 - t);
    return { opacity: t <= 0 || t >= 1 ? 0 : 1 - t * 0.9, transform: [{ translateX: Math.cos(ang) * dist * e }, { translateY: Math.sin(ang) * dist * e }, { scale: 1 - t * 0.6 }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, st]} />;
}

export function Impact({ star, p, k }: { star: Star; p: SharedValue<number>; k: number }) {
  const c = CONS[star.cons].color;
  const base = star.r + 30 * k;
  const flash = useAnimatedStyle(() => ({ opacity: p.value <= 0 ? 0 : Math.max(0, 1 - p.value * 1.6), transform: [{ scale: 0.6 + p.value * 0.8 }] }));
  const F = base * 2.4;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[{ position: 'absolute', left: star.x - F / 2, top: star.y - F / 2, width: F, height: F }, flash]}>
        <Svg width={F} height={F}>
          <Defs>
            <RadialGradient id="fl" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
              <Stop offset="0.35" stopColor="#FFE2A2" stopOpacity={0.6} />
              <Stop offset="1" stopColor="#FFB547" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={F / 2} cy={F / 2} r={F / 2} fill="url(#fl)" />
        </Svg>
      </Animated.View>
      {[0, 0.16, 0.32].map((d, i) => <Ring key={i} x={star.x} y={star.y} p={p} delay={d} max={base * (1.9 + i * 0.35)} color={i === 1 ? c : '#FFE2A2'} />)}
      {Array.from({ length: 14 }, (_, i) => (
        <Bit key={i} x={star.x} y={star.y} p={p} ang={(i / 14) * Math.PI * 2 + (i % 2) * 0.2} dist={base * (1.5 + (i % 3) * 0.45)} size={(i % 3 === 0 ? 9 : 6) * k} color={i % 2 ? c : '#FFF3CF'} />
      ))}
    </View>
  );
}
