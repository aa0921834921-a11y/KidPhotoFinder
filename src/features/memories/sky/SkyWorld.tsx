/**
 * 回憶星空的「世界」：背景星雲、行星、標題、六個星座（線、星星、照片星球、名稱）、下方的孩子和狗。
 * 全部畫在同一個 941 × 1672 的座標裡，外面用同一個變換一起拖曳、縮放（見 SkyScreen）。
 * 每一層都是分開的圖（參考稿裡拿出來的標題、圖示、行星；照片星球的光環、星星是另外畫的透明圖），
 * 照片是真的相簿照片放在光環中間，不是整張圖貼上去。
 * 這裡只畫靜態的東西；選中的光圈、流星、漣漪在 SkyFx。
 */
import { Image } from 'expo-image';
import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg';
import { tr } from '../../../i18n';
import type * as DB from '../../../services/db';
import { CONS, CONS_ORDER, LABEL_LINE, PLANETS, WORLD_H, WORLD_W, type ConsKey, type PlanetKey } from '../constellations';
import type { SkyLayout, Star } from '../layout';
import type { MemFont } from '../ui/fonts';
import { Sparkle } from '../ui/GoldIcon';
import { MemPhoto } from '../ui/OrbPhoto';
import { consName, consTag } from '../text';

const SKY = require('../../../../assets/memory-ui/sky.webp');
const TITLE = require('../../../../assets/memory-ui/title.webp');
const GLOSS = require('../../../../assets/memory-ui/orb_gloss.webp');
const RING: Record<ConsKey, number> = {
  sport: require('../../../../assets/memory-ui/orb_sport.webp'),
  birthday: require('../../../../assets/memory-ui/orb_birthday.webp'),
  travel: require('../../../../assets/memory-ui/orb_travel.webp'),
  school: require('../../../../assets/memory-ui/orb_school.webp'),
  family: require('../../../../assets/memory-ui/orb_family.webp'),
  hobby: require('../../../../assets/memory-ui/orb_hobby.webp'),
};
const STAR: Record<ConsKey, number> = {
  sport: require('../../../../assets/memory-ui/star_sport.webp'),
  birthday: require('../../../../assets/memory-ui/star_birthday.webp'),
  travel: require('../../../../assets/memory-ui/star_travel.webp'),
  school: require('../../../../assets/memory-ui/star_school.webp'),
  family: require('../../../../assets/memory-ui/star_family.webp'),
  hobby: require('../../../../assets/memory-ui/star_hobby.webp'),
};
const ICON: Record<ConsKey, number> = {
  sport: require('../../../../assets/memory-ui/icon_sport.webp'),
  birthday: require('../../../../assets/memory-ui/icon_birthday.webp'),
  travel: require('../../../../assets/memory-ui/icon_travel.webp'),
  school: require('../../../../assets/memory-ui/icon_school.webp'),
  family: require('../../../../assets/memory-ui/icon_family.webp'),
  hobby: require('../../../../assets/memory-ui/icon_hobby.webp'),
};
const PLANET: Record<PlanetKey, number> = {
  right: require('../../../../assets/memory-ui/planet_right.webp'),
  earth: require('../../../../assets/memory-ui/planet_earth.webp'),
  saturn1: require('../../../../assets/memory-ui/planet_saturn1.webp'),
  purple: require('../../../../assets/memory-ui/planet_purple.webp'),
  saturn2: require('../../../../assets/memory-ui/planet_saturn2.webp'),
  small: require('../../../../assets/memory-ui/planet_small.webp'),
};
/** 光環圖（600）中間透明的洞是 420：光環圖的大小 = 照片直徑 ÷ 0.7 */
const RING_K = 600 / 420;
/** 細長的手機（20:9）最小縮放時，左右各切掉大約這麼多：名稱太長就換行，不要被切掉 */
const PHONE_CUT = 94;
/** 標題圖在參考稿裡的位置（世界座標） */
const TITLE_BOX = { x: 273, y: 18, w: 355, h: 138 };

/* ---------------------------------------------------------------- 小工具 */

/** 固定位置的亂數（每次打開星空都一樣） */
function seeded(n: number, seed: number) {
  let s = seed;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: n }, () => [r(), r(), r(), r()]);
}
const abs = (x: number, y: number, w: number, h: number) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: h });

/* ---------------------------------------------------------------- 一閃一閃的星 */

function Twinkle({ x, y, size, delay, dur, still }: { x: number; y: number; size: number; delay: number; dur: number; still: boolean }) {
  const v = useSharedValue(0.5);
  useEffect(() => {
    if (still) return;
    v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), withTiming(0.25, { duration: dur, easing: Easing.inOut(Easing.sin) })), -1, false));
  }, [v, delay, dur, still]);
  const st = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.7 + v.value * 0.4 }] }));
  return (
    <Animated.View pointerEvents="none" style={[abs(x - size / 2, y - size / 2, size, size), st]}>
      <Sparkle size={size} color="#FFF4D6" />
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- 照片星球：照片＋玻璃反光＋光環 */

const Orb = memo(function Orb({ star, info, dim }: { star: Star; info: Map<string, DB.PhotoInfo>; dim: boolean }) {
  const d = star.r * 2;
  const ring = d * RING_K;
  const o = (ring - d) / 2;
  return (
    <View pointerEvents="none" style={[abs(star.x - ring / 2, star.y - ring / 2, ring, ring), { opacity: dim ? 0.16 : 1 }]}>
      <View style={[abs(o, o, d, d), st.photo, { borderRadius: star.r }]}>
        <MemPhoto m={star.m} id={star.m.cover} info={star.m.cover ? info.get(star.m.cover) : null} w={d} h={d} radius={star.r} />
      </View>
      <Image source={GLOSS} style={abs(o, o, d, d)} contentFit="fill" />
      <Image source={RING[star.cons]} style={abs(0, 0, ring, ring)} contentFit="fill" />
    </View>
  );
});

/* ---------------------------------------------------------------- 星座名稱（名稱、旁邊的金色圖示、一句話） */

function Label({ k, count, on, font, latin }: { k: ConsKey; count: number; on: boolean; font: MemFont; latin: boolean }) {
  const d = CONS[k];
  const { label: l, art: a } = d;
  const name = (
    <Text style={[font.serif, st.name, latin && st.nameLatin, { color: d.color, textShadowColor: d.glow }]} allowFontScaling={false}>{consName(k)}</Text>
  );
  const rest = (
    <>
      <Text style={[font.serifR, st.tag, latin && st.tagLatin, l.align === 'right' && { textAlign: 'right' }]} allowFontScaling={false}>{consTag(k)}</Text>
      {/* 還沒有回憶的星座：說一下還沒點亮（有回憶的就看星星） */}
      {!count ? <Text style={[font.serifR, st.unlit, { color: d.color }, l.align === 'right' && { textAlign: 'right' }]} allowFontScaling={false}>{tr('sky.unlit')}</Text> : null}
    </>
  );
  if (l.align === 'left') {
    return (
      <View pointerEvents="none" style={[st.label, { left: l.x, top: l.y, maxWidth: Math.min(240, WORLD_W - PHONE_CUT - l.x), opacity: on ? 1 : 0.3 }]}>
        <Image source={ICON[k]} style={abs(a.dx, LABEL_LINE.inset + a.dy, a.w, a.h)} contentFit="fill" />
        {name}
        {rest}
      </View>
    );
  }
  // 靠右的名稱：圖示放在名稱左邊同一行（名稱多長都對得齊）
  return (
    <View pointerEvents="none" style={[st.label, { right: WORLD_W - l.x, top: l.y, alignItems: 'flex-end', opacity: on ? 1 : 0.3 }]}>
      <View style={st.row}>
        <Image source={ICON[k]} style={{ width: a.w, height: a.h, marginTop: LABEL_LINE.inset + a.dy, marginBottom: LABEL_LINE.line - (LABEL_LINE.inset + a.dy + a.h), marginRight: -(a.dx + a.w) }} contentFit="fill" />
        {name}
      </View>
      {rest}
    </View>
  );
}

/* ---------------------------------------------------------------- 世界 */

export type WorldProps = {
  layout: SkyLayout;
  info: Map<string, DB.PhotoInfo>;
  /** 篩選掉的星座／星星畫淡一點 */
  visible: (s: Star) => boolean;
  consOn: Record<ConsKey, boolean>;
  font: MemFont;
  /** 不是中文：星座名稱的字小一點 */
  latin: boolean;
  still: boolean;
};

export const SkyWorld = memo(function SkyWorld({ layout, info, visible, consOn, font, latin, still }: WorldProps) {
  const twinkles = useMemo(() => seeded(18, 7).map(([a, b, c, d], i) => ({ x: 30 + a * (WORLD_W - 60), y: 250 + b * 880, size: 9 + c * 12, delay: Math.round(d * 2400), dur: 1100 + ((i * 337) % 1300) })), []);
  return (
    <View pointerEvents="none" style={abs(0, 0, WORLD_W, WORLD_H)}>
      {/* 1 背景星雲 */}
      <Image source={SKY} style={abs(0, 0, WORLD_W, WORLD_H)} contentFit="fill" />

      {/* 2 行星（裝飾，不能點） */}
      {PLANETS.map((p) => <Image key={p.key} source={PLANET[p.key]} style={abs(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h)} contentFit="fill" />)}

      {/* 3 標題：童年拾光（參考稿的金字和月亮）＋ 回憶星空 ＋ 一句話 */}
      <Image source={TITLE} style={abs(TITLE_BOX.x, TITLE_BOX.y, TITLE_BOX.w, TITLE_BOX.h)} contentFit="fill" />
      <View style={st.subRow}>
        <View style={st.rule} />
        <View style={st.diamond} />
        <Text style={[font.serif, st.sub, latin && st.subLatin]} allowFontScaling={false}>{tr('sky.title')}</Text>
        <View style={st.diamond} />
        <View style={st.rule} />
      </View>
      <Text style={[font.serifR, st.tagline, latin && st.taglineLatin]} allowFontScaling={false}>{tr('sky.tagline')}</Text>

      {/* 4 下方的孩子、狗、雲海（在星座下面，照片星球不會被蓋住） */}

      {/* 5 星座的線（三層：光暈、顏色、亮芯）、照片星球後面的光 */}
      <Svg width={WORLD_W} height={WORLD_H} style={StyleSheet.absoluteFill}>
        <Defs>
          {CONS_ORDER.map((k) => (
            <RadialGradient key={k} id={`gl-${k}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.45" stopColor={CONS[k].color} stopOpacity={0.55} />
              <Stop offset="0.7" stopColor={CONS[k].glow} stopOpacity={0.18} />
              <Stop offset="1" stopColor={CONS[k].glow} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {CONS_ORDER.map((k) => {
          const cl = layout.clusters[k];
          const c = CONS[k].color;
          return (
            <G key={k} opacity={consOn[k] ? 1 : 0.16}>
              {cl.edges.map((e, i) => (e.lit ? (
                <G key={i}>
                  <Line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={c} strokeOpacity={0.16} strokeWidth={7} strokeLinecap="round" />
                  <Line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={c} strokeOpacity={0.5} strokeWidth={2.6} strokeLinecap="round" />
                  <Line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#FFFBEE" strokeOpacity={0.9} strokeWidth={1} strokeLinecap="round" />
                </G>
              ) : (
                <Line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={c} strokeOpacity={0.26} strokeWidth={1.2} strokeDasharray="4 6" strokeLinecap="round" />
              )))}
              {cl.stars.filter((s) => s.photo).map((s) => (
                <Circle key={s.m.id} cx={s.x} cy={s.y} r={s.r * 1.9} fill={`url(#gl-${k})`} opacity={!visible(s) ? 0.1 : s.primary ? 0.75 : 0.55} />
              ))}
            </G>
          );
        })}
      </Svg>

      {/* 6 還沒點亮的位置（暗暗的星）、小星星（一個活動一顆） */}
      {CONS_ORDER.map((k) => {
        const cl = layout.clusters[k];
        const on = consOn[k];
        return (
          <React.Fragment key={k}>
            {cl.ghosts.map((g, i) => {
              const sz = g.r * 5.5;
              return <Image key={`g${i}`} source={STAR[k]} style={[abs(g.x - sz / 2, g.y - sz / 2, sz, sz), { opacity: on ? 0.24 : 0.06 }]} contentFit="fill" />;
            })}
            {cl.stars.filter((s) => !s.photo).map((s) => {
              const sz = s.r * 7;
              return <Image key={s.m.id} source={STAR[k]} style={[abs(s.x - sz / 2, s.y - sz / 2, sz, sz), { opacity: !on || !visible(s) ? 0.16 : 1 }]} contentFit="fill" />;
            })}
          </React.Fragment>
        );
      })}

      {/* 7 照片星球 */}
      {layout.stars.filter((s) => s.photo).map((s) => <Orb key={s.m.id} star={s} info={info} dim={!visible(s) || !consOn[s.cons]} />)}

      {/* 8 星座名稱 */}
      {CONS_ORDER.map((k) => <Label key={k} k={k} count={layout.clusters[k].count} on={consOn[k]} font={font} latin={latin} />)}

      {/* 9 一閃一閃 */}
      {twinkles.map((p, i) => <Twinkle key={i} {...p} still={still} />)}
    </View>
  );
});

/* ---------------------------------------------------------------- 無障礙：讀螢幕的人可以一顆一顆點 */

export function StarA11y({ stars, onPick, label }: { stars: Star[]; onPick: (s: Star) => void; label: (s: Star) => string }) {
  return (
    <>
      {stars.map((s) => (
        <View key={s.m.id} accessible accessibilityRole="button" accessibilityLabel={label(s)}
          accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => onPick(s)}
          style={abs(s.x - Math.max(s.r, 14), s.y - Math.max(s.r, 14), Math.max(s.r, 14) * 2, Math.max(s.r, 14) * 2)} />
      ))}
    </>
  );
}

/** 星座線的「脈衝」：命中時那個星座的線亮一下 */
export function ConsPulse({ layout, cons, v }: { layout: SkyLayout; cons: ConsKey | null; v: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  if (!cons) return null;
  const cl = layout.clusters[cons];
  const c = CONS[cons].color;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: WORLD_W, height: WORLD_H }, style]}>
      <Svg width={WORLD_W} height={WORLD_H}>
        {cl.edges.filter((e) => e.lit).map((e, i) => (
          <G key={i}>
            <Line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={c} strokeOpacity={0.35} strokeWidth={10} strokeLinecap="round" />
            <Line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#FFFBEA" strokeWidth={2.4} strokeLinecap="round" />
          </G>
        ))}
      </Svg>
    </Animated.View>
  );
}

const GLOW = { textShadowOffset: { width: 0, height: 0 } };
const st = StyleSheet.create({
  photo: { overflow: 'hidden', backgroundColor: '#141A44' },
  subRow: { position: 'absolute', left: 0, right: 0, top: 153, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rule: { width: 64, height: 1.5, backgroundColor: 'rgba(255,226,162,0.7)' },
  diamond: { width: 7, height: 7, marginHorizontal: 9, backgroundColor: '#FFE2A2', transform: [{ rotate: '45deg' }] },
  sub: { fontSize: 33, lineHeight: 44, color: '#FFEBC4', letterSpacing: 7, paddingLeft: 7, textShadowColor: 'rgba(255,178,80,0.85)', textShadowRadius: 12, ...GLOW },
  subLatin: { fontSize: 27, letterSpacing: 2, paddingLeft: 2 },
  tagline: {
    position: 'absolute', left: 0, right: 0, top: 199, textAlign: 'center', fontSize: 17, lineHeight: 26, color: '#F3EEFF', letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 6, ...GLOW,
  },
  taglineLatin: { fontSize: 16, letterSpacing: 0.5 },
  label: { position: 'absolute', maxWidth: 240 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { fontSize: LABEL_LINE.size, lineHeight: LABEL_LINE.line, letterSpacing: 2, textShadowRadius: 14, ...GLOW },
  nameLatin: { fontSize: 25, lineHeight: 32, letterSpacing: 0.5 },
  tag: { fontSize: 17, lineHeight: 24, color: '#F1ECFF', letterSpacing: 1.5, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 5, ...GLOW },
  tagLatin: { fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  unlit: { fontSize: 14, lineHeight: 22, letterSpacing: 1, opacity: 0.9 },
});
