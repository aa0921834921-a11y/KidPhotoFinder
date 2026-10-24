/**
 * 回憶星空、刮刮樂用的金色線條圖示，和圓形金框按鈕。
 * 金框只畫一次（按鈕本身），圖示畫在正中間；按下去的光暈跟圖示同一個中心。
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import type { IconKey } from '../constellations';

export const GOLD = '#FFE2A2';
export const GOLD_DEEP = '#FFD17A';
export const NAVY = '#060A21';

export type GlyphName = IconKey | 'back' | 'filter' | 'recenter' | 'calendar' | 'close' | 'chevron' | 'lock' | 'photos' | 'spark' | 'wand' | 'tag' | 'drag' | 'pinch' | 'tap';

/** 64 × 64 的線條圖 */
const G: Record<GlyphName, { d: string; fill?: string; dots?: [number, number, number][] }> = {
  back: { d: 'M39 17L23 32L39 47' },
  filter: { d: 'M16 21H48M16 32H48M16 43H48', dots: [[26, 21, 4], [40, 32, 4], [27, 43, 4]] },
  recenter: { d: 'M15 25V15H25M39 15H49V25M49 39V49H39M25 49H15V39', dots: [[32, 32, 4]] },
  calendar: { d: 'M15 21H49V50H15Z M15 30H49 M24 14V24 M40 14V24' },
  close: { d: 'M21 21L43 43M43 21L21 43' },
  chevron: { d: 'M26 17L41 32L26 47' },
  lock: { d: 'M19 30H45V51H19Z M24 30V23C24 14 40 14 40 23V30 M32 38V43' },
  photos: { d: 'M13 21H43V49H13Z M21 13H51V41H43 M13 43L23 33L31 41L36 36L43 43' },
  spark: { d: 'M32 6C34 24 40 30 58 32C40 34 34 40 32 58C30 40 24 34 6 32C24 30 30 24 32 6Z', fill: 'currentColor' },
  wand: { d: 'M14 50L40 24 M44 10V18M40 14H48 M52 26V32M49 29H55 M30 12V16M28 14H32' },
  tag: { d: 'M12 34L30 16H50V36L32 54Z', dots: [[42, 24, 3]] },
  drag: { d: 'M32 10V54M10 32H54M25 17L32 10L39 17M25 47L32 54L39 47M17 25L10 32L17 39M47 25L54 32L47 39' },
  pinch: { d: 'M12 52L27 37M12 52V41M12 52H23M52 12L37 27M52 12V23M52 12H41' },
  tap: { d: 'M32 11A21 21 0 1 1 31.9 11Z', dots: [[32, 32, 7]] },
  runner: { d: 'M22 14H42V24C42 32 37 36 32 36C27 36 22 32 22 24Z M22 18H15C15 25 18 28 23 28 M42 18H49C49 25 46 28 41 28 M32 36V44 M26 44H38V50H26Z M22 50H42' },
  cake: { d: 'M14 50H50 M17 50V34H47V50 M17 41C21 45 25 45 28.5 41C32 45 36 45 39.5 41C43 45 45 45 47 41 M24 34V26 M32 34V26 M40 34V26 M24 21C22 19 24 17 24 15C26 17 26 19 24 21Z M32 21C30 19 32 17 32 15C34 17 34 19 32 21Z M40 21C38 19 40 17 40 15C42 17 42 19 40 21Z' },
  plane: { d: 'M8 31L56 12L43 52L31 38Z M31 38L56 12 M31 38L30 51L37 44' },
  book: { d: 'M32 49C24 45 20 44 12 45V16C22 14 29 16 32 20C36 16 45 14 52 16V45C41 44 37 46 32 49Z M32 20V48' },
  house: { d: 'M14 30L32 15L50 30 M18 27V49H46V27 M27 49V37H37V49' },
  palette: { d: 'M32 12C20 12 12 21 12 31C12 42 21 50 30 50C34 50 35 47 33 44C31 41 33 38 37 38H43C49 38 52 34 52 29C52 19 43 12 32 12Z', dots: [[23, 29, 3.2], [29, 20, 3.2], [39, 20, 3.2], [45, 28, 3.2]] },
};

export function Glyph({ name, size = 24, color = GOLD, stroke = 3.4 }: { name: GlyphName; size?: number; color?: string; stroke?: number }) {
  const g = G[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" pointerEvents="none">
      <Path d={g.d} fill={g.fill ? color : 'none'} stroke={g.fill ? 'none' : color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {g.dots?.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} fill={NAVY} stroke={color} strokeWidth={stroke * 0.7} />)}
    </Svg>
  );
}

/** 四角星（✦）：手機有些字型沒有這個字，所以用畫的 */
export function Sparkle({ size = 12, color = GOLD, style }: { size?: number; color?: string; style?: ViewStyle }) {
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Path d={G.spark.d} fill={color} />
      </Svg>
    </View>
  );
}

/** 圓形金框按鈕（下面可以有小字），點擊範圍至少 48dp */
export function GoldButton({ icon, label, onPress, size = 46, a11y, disabled, active, style }: {
  icon: GlyphName; label?: string; onPress: () => void; size?: number; a11y: string; disabled?: boolean; active?: boolean; style?: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !!disabled, selected: !!active }}
      hitSlop={Math.max(0, (48 - size) / 2)} style={[{ alignItems: 'center', gap: 3, opacity: disabled ? 0.45 : 1 }, style]}>
      {({ pressed }) => (
        <>
          <View style={{ width: size, height: size }}>
            {/* 按下去的光暈：跟圓框、圖示同一個中心 */}
            {pressed || active ? (
              <Svg width={size * 1.7} height={size * 1.7} style={{ position: 'absolute', left: -size * 0.35, top: -size * 0.35 }} pointerEvents="none">
                <Defs>
                  <RadialGradient id="gb" cx="50%" cy="50%" r="50%">
                    <Stop offset="0.45" stopColor={GOLD_DEEP} stopOpacity={0.55} />
                    <Stop offset="1" stopColor={GOLD_DEEP} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={size * 0.85} cy={size * 0.85} r={size * 0.85} fill="url(#gb)" />
              </Svg>
            ) : null}
            <View style={[s.ring, { width: size, height: size, borderRadius: size / 2 }]}>
              <Glyph name={icon} size={size * 0.56} />
            </View>
          </View>
          {label ? <Text style={s.label} numberOfLines={1}>{label}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  ring: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,18,38,0.78)', borderWidth: 1.5, borderColor: GOLD,
    boxShadow: '0px 0px 10px rgba(255,209,122,0.35)',
  } as ViewStyle,
  label: { color: GOLD, fontSize: 11.5, letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
