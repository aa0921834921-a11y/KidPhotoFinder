/** 裝飾插畫：小幫手的標誌、首頁封面的插圖（每個主題不一樣）、拍立得照片框、緞帶標題 */
import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { tr, useLang } from '../i18n';
import { art, Tape } from './kit';
import { useTheme } from './theme';

/* ---------------------------------------------------------------- 標誌：兩個小朋友 */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M5 58c-1-13 6-19 17-19s17 7 16 19" fill="#94b69c" />
      <Path d="M27 58c-1-13 6-19 17-19s17 7 16 19" fill="#e5ad83" />
      <Path d="M9 24C7 8 33 6 37 22l-3 11H11Z" fill="#69463a" />
      <Path d="M29 22c0-17 25-18 27 1l-2 12H31Z" fill="#75483d" />
      <Ellipse cx={22} cy={28} rx={14} ry={16} fill="#ffe0bc" />
      <Ellipse cx={43} cy={28} rx={13} ry={15} fill="#ffe1c3" />
      <Path d="M7 25c1-15 12-21 26-13 1 4-1 8-7 9-7-6-12 2-19 4ZM30 22c2-18 24-17 26-5-9 3-15-7-26 5" fill="#674437" />
      <G fill="#5d4238"><Circle cx={17} cy={29} r={1.5} /><Circle cx={27} cy={29} r={1.5} /><Circle cx={39} cy={29} r={1.5} /><Circle cx={48} cy={29} r={1.5} /></G>
      <Path d="M18 35q4 5 8 0M39 35q4 5 8 0" fill="none" stroke="#a75b5c" strokeWidth={1.7} strokeLinecap="round" />
      <Ellipse cx={11} cy={34} rx={3.1} ry={2} fill="#f1a6a1" opacity={0.8} />
      <Ellipse cx={53} cy={34} rx={2.8} ry={2} fill="#f1a6a1" opacity={0.8} />
      <Path d="M4 17l4 1 1 4 2-4 4-1-4-2-2-4-1 4ZM54 7l2 5 5 2-5 1-2 5-2-5-5-1 5-2Z" fill="#e9b662" />
    </Svg>
  );
}

/* ---------------------------------------------------------------- 拍立得 */

/**
 * 照片框：水彩/故事書是有紙膠帶、會歪一點的拍立得；簡約/星空是圓角照片；糖果是粗邊圓角。
 * size 是照片本身的寬度。
 */
export function Polaroid({ uri, size, caption, tilt = 0, tape = 0, onPress, style, badge, ratio = 1, video, label }: {
  uri: string | null; size: number; caption?: string; tilt?: number; tape?: number | null; onPress?: () => void;
  style?: StyleProp<ViewStyle>; badge?: string; ratio?: number; video?: boolean; label?: string;
}) {
  const t = useTheme();
  useLang();
  const plain = t.id === 'minimal' || t.id === 'starry';
  const candy = t.id === 'candy';
  const showCap = !!caption && t.captions;
  const pad = plain ? 0 : candy ? 5 : 5;
  const capH = showCap ? 20 : plain ? 0 : candy ? 5 : 8;
  const frame: ViewStyle = plain
    ? { borderRadius: 12, overflow: 'hidden', backgroundColor: t.c.line, boxShadow: t.id === 'starry' ? '0px 0px 0px 1px #3A4577' : 'none' } as ViewStyle
    : candy
      ? { backgroundColor: '#FFFFFF', borderRadius: 16, padding: pad, paddingBottom: capH, boxShadow: '0px 4px 0px #F4CDE0, 0px 0px 0px 2px #F3D6E6' } as ViewStyle
      : { backgroundColor: t.c.pol, borderRadius: 2, padding: pad, paddingBottom: capH, boxShadow: '0px 5px 11px rgba(98,70,45,0.18)' } as ViewStyle;
  const body = (
    <View style={[frame, t.tilt && tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null, style]}>
      {tape != null && !plain ? <Tape i={tape} w={Math.min(46, size * 0.4)} h={14} style={{ top: -7 }} /> : null}
      <View style={{ width: size, height: size * ratio, backgroundColor: t.c.line, overflow: 'hidden', borderRadius: candy ? 12 : 0 }}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
        {video ? <Text style={st.video}>▶</Text> : null}
      </View>
      {showCap ? <Text style={[st.polCap, { color: t.c.polCap }, t.round]} numberOfLines={1}>{caption}</Text> : null}
      {badge ? <View style={[st.badge, plain && { right: 6, top: 6 }, { backgroundColor: t.c.accent }]}><Text style={[st.badgeText, { color: t.c.onAccent }, t.round]}>{badge}</Text></View> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={label || tr('art.view')}
      style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : null}>
      {body}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- 緞帶標題 */
export function Ribbon({ children }: { children: string }) {
  const t = useTheme();
  const shaped = t.id === 'watercolor' || t.id === 'book' || t.id === 'starry';
  return (
    <View style={[{ alignSelf: 'flex-start', flexDirection: 'row' }, shaped && { marginLeft: -20, transform: [{ rotate: '-1.5deg' }] }]}>
      <View style={[{ backgroundColor: t.c.rib, paddingVertical: 8, paddingLeft: shaped ? 22 : 18, paddingRight: shaped ? 14 : 18 },
        !shaped && { borderRadius: t.id === 'minimal' ? 10 : 999 }]}>
        <Text style={[{ fontSize: 16.5, color: t.c.ribText, letterSpacing: 1 }, t.title]}>{children}</Text>
      </View>
      {shaped ? (
        <Svg width={14} height={40} viewBox="0 0 14 40" style={{ marginLeft: -0.5 }}>
          <Path d="M0 0H14L4 20L14 40H0Z" fill={t.c.rib} />
        </Svg>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- 首頁封面插圖 */

function Twinkle({ style, delay = 0, size = 14, color = '#FFE9B0' }: { style: ViewStyle; delay?: number; size?: number; color?: string }) {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 1300, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.35, duration: 1300, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [v, delay]);
  return (
    <Animated.Text style={[{ position: 'absolute', fontSize: size, color, opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0.35, 1], outputRange: [0.8, 1.1] }) }] }, style]}>✦</Animated.Text>
  );
}

/** 封面下半部的插圖；照片按一下可以看大張 */
export function CoverArt({ uri, onPhoto, width }: { uri: string | null; onPhoto?: () => void; width: number }) {
  const t = useTheme();
  useLang();
  if (t.art === 'minimal') {
    return (
      <Pressable onPress={onPhoto} disabled={!uri} style={{ marginTop: 16 }} accessibilityLabel={tr('art.viewLatest')}>
        <View style={{ width: '100%', aspectRatio: 1.6, borderRadius: 16, overflow: 'hidden', backgroundColor: t.c.accentWash }}>
          {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Logo size={64} /></View>
          )}
          <View style={st.minCap}><Text style={{ fontSize: 12, color: t.c.ink }}>{tr('art.smile')}</Text></View>
        </View>
      </Pressable>
    );
  }

  const polW = 142;
  const pola = (
    <Pressable onPress={onPhoto} disabled={!uri} accessibilityLabel={tr('art.viewLatest')}
      style={[st.pola, t.art === 'candy' ? st.polaCandy : null, t.art === 'starry' ? st.polaStar : null, { backgroundColor: t.c.pol }]}>
      {t.art === 'watercolor' ? <Tape i={0} /> : null}
      {t.art === 'candy' ? <Tape i={0} /> : null}
      <View style={{ width: polW, height: t.art === 'candy' ? 150 : 132, backgroundColor: t.c.accentWash, overflow: 'hidden', borderRadius: t.art === 'candy' ? 16 : 0 }}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Logo size={56} /></View>
        )}
      </View>
      {t.art !== 'candy' ? <Text style={[st.polaCap, t.round, { color: t.c.polCap }]} numberOfLines={1} adjustsFontSizeToFit>{tr('art.smile')}</Text> : null}
    </Pressable>
  );

  return (
    <View style={[st.art, { width }]}>
      {t.art === 'watercolor' ? (
        <>
          <Text style={st.sun}>☼</Text>
          <Image source={art.school} style={st.school} contentFit="contain" />
          <Text style={st.doodle}>✧</Text>
          <Image source={art.border} style={st.border} contentFit="cover" contentPosition="bottom" />
          <Image source={art.blooms} style={[st.bl, { left: -8 }]} contentFit="contain" />
          <Image source={art.blooms} style={[st.bl, { right: -10, transform: [{ scaleX: -1 }] }]} contentFit="contain" />
        </>
      ) : null}

      {t.art === 'starry' ? (
        <>
          <View style={st.moonGlow} />
          <Svg width={78} height={78} viewBox="0 0 80 80" style={st.moon}>
            <Path d="M50 12a29 29 0 1 0 18 47A23 23 0 1 1 50 12z" fill="#FFE2A3" />
            <Circle cx={34} cy={44} r={3.2} fill="#F2CB7A" opacity={0.7} />
            <Circle cx={42} cy={58} r={2.2} fill="#F2CB7A" opacity={0.7} />
          </Svg>
          <Svg width={120} height={90} viewBox="0 0 150 110" style={st.constel}>
            <G stroke="#C3B8FF" strokeWidth={1} opacity={0.6} fill="none" strokeDasharray="3 3">
              <Path d="M12 80 46 52 80 66 112 30 138 44" /><Path d="M46 52 58 18" />
            </G>
            <G fill="#FFE9B0">
              <Circle cx={12} cy={80} r={2.4} /><Circle cx={46} cy={52} r={3} /><Circle cx={80} cy={66} r={2.2} />
              <Circle cx={112} cy={30} r={3.2} /><Circle cx={138} cy={44} r={2} /><Circle cx={58} cy={18} r={2.4} />
            </G>
          </Svg>
          <Svg width={width} height={96} viewBox="0 0 390 96" preserveAspectRatio="none" style={st.hills}>
            <Path d="M0 52Q70 22 150 44T300 38T390 30V96H0Z" fill="#283163" />
            <Path d="M0 70Q90 46 190 66T390 56V96H0Z" fill="#1B2250" />
            <G fill="#33407A"><Rect x={48} y={44} width={30} height={22} rx={2} /><Path d="M44 46 63 30 82 46Z" /></G>
            <Rect x={55} y={51} width={7} height={7} rx={1} fill="#FFD98A" />
            <Rect x={66} y={51} width={7} height={7} rx={1} fill="#FFD98A" opacity={0.6} />
            <G fill="#2F3A72"><Circle cx={118} cy={48} r={12} /><Rect x={116} y={52} width={4} height={14} /></G>
          </Svg>
          <Twinkle style={{ left: 18, top: 112 }} />
          <Twinkle style={{ left: 92, top: 4 }} delay={800} size={10} color="#D9D0FF" />
          <Twinkle style={{ left: 196, top: 120 }} delay={1600} size={18} />
          <Twinkle style={{ left: 150, top: 150 }} delay={500} size={10} color="#D9D0FF" />
        </>
      ) : null}

      {t.art === 'candy' ? (
        <>
          <View style={[st.bub, { width: 116, height: 116, left: -34, bottom: -30, backgroundImage: 'radial-gradient(circle at 35% 35%, #E8F6FF, #BFE3FF)' } as ViewStyle]} />
          <View style={[st.bub, { width: 46, height: 46, left: 150, top: 8, backgroundImage: 'radial-gradient(circle at 35% 35%, #FFF0F6, #FFC6DD)' } as ViewStyle]} />
          <View style={[st.bub, { width: 26, height: 26, left: 118, bottom: 18, backgroundImage: 'radial-gradient(circle at 35% 35%, #FFF8DD, #FFE08A)' } as ViewStyle]} />
          <Svg width={132} height={79} viewBox="0 0 120 72" style={st.cloud}>
            <Path d="M26 64h66a21 21 0 0 0 3-42 27 27 0 0 0-51-6A21 21 0 0 0 26 64z" fill="#fff" stroke="#F6C2D8" strokeWidth={3} />
            <Circle cx={50} cy={42} r={3.2} fill="#4A3A5C" /><Circle cx={72} cy={42} r={3.2} fill="#4A3A5C" />
            <Path d="M56 50q5 5 10 0" stroke="#4A3A5C" strokeWidth={2.4} fill="none" strokeLinecap="round" />
            <Ellipse cx={42} cy={50} rx={5} ry={3} fill="#FFB3CF" /><Ellipse cx={80} cy={50} rx={5} ry={3} fill="#FFB3CF" />
          </Svg>
          <Svg width={38} height={85} viewBox="0 0 50 112" style={st.lolli}>
            <Rect x={22.5} y={44} width={5} height={64} rx={2.5} fill="#fff" stroke="#F3C3D8" strokeWidth={1.5} />
            <Circle cx={25} cy={25} r={22} fill="#FF8FB8" />
            <Path d="M25 25m-13 0a13 13 0 1 1 26 0a8.5 8.5 0 1 1-17 0a4.5 4.5 0 1 1 9 0" fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" />
          </Svg>
          <Text style={[st.cst, { left: 30, top: 6, color: '#FFC94D', transform: [{ rotate: '-12deg' }] }]}>★</Text>
          <Text style={[st.cst, { left: 118, top: 150, color: '#FF8FB8', fontSize: 18 }]}>♥</Text>
          <Text style={[st.cst, { left: 70, top: 140, color: '#7CC6FF', fontSize: 14 }]}>●</Text>
          <Text style={[st.cst, { left: 176, top: 58, color: '#FFC94D', fontSize: 13 }]}>✦</Text>
        </>
      ) : null}

      {pola}

      {t.art === 'watercolor' ? <Text style={[st.hand, t.round]}>{tr('art.handWc')}</Text> : null}
      {t.art === 'starry' ? <Text style={[st.hand2, t.round]}>{tr('art.handStar')}</Text> : null}
      {t.art === 'candy' ? <Text style={[st.hand3, t.round]}>{tr('art.handCandy')}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  polCap: { position: 'absolute', left: 2, right: 2, bottom: 3, textAlign: 'center', fontSize: 10.5 },
  badge: { position: 'absolute', right: -7, top: -7, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 4px rgba(0,0,0,0.15)' } as ViewStyle,
  badgeText: { fontSize: 12 },
  video: { position: 'absolute', right: 5, bottom: 3, color: '#fff', fontSize: 14, textShadowColor: '#0008', textShadowRadius: 3 },
  minCap: { position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },

  art: { height: 248, marginTop: 6, marginHorizontal: -20, position: 'relative' },
  sun: { position: 'absolute', left: 22, top: 2, fontSize: 34, color: '#EDC66C', transform: [{ rotate: '12deg' }] },
  school: { position: 'absolute', left: -4, bottom: 26, width: 236, height: 206, opacity: 0.95 },
  doodle: { position: 'absolute', left: 170, top: 52, fontSize: 28, color: '#D9A07C', transform: [{ rotate: '-12deg' }] },
  border: { position: 'absolute', left: 0, right: 0, bottom: -4, height: 84, opacity: 0.55 },
  bl: { position: 'absolute', bottom: -4, width: 120, height: 66 },

  pola: {
    position: 'absolute', right: 24, top: 22, padding: 7, paddingBottom: 30, transform: [{ rotate: '6deg' }], zIndex: 2,
    boxShadow: '0px 12px 24px rgba(110,74,52,0.24), 1px 2px 0px rgba(200,170,140,0.4)',
  } as ViewStyle,
  polaCandy: { padding: 7, paddingBottom: 7, borderRadius: 22, transform: [{ rotate: '-4deg' }], boxShadow: '0px 6px 0px #F4CDE0, 0px 0px 0px 2px #F3D6E6' } as ViewStyle,
  polaStar: { boxShadow: '0px 0px 0px 1px rgba(255,255,255,0.4), 0px 0px 34px rgba(255,217,130,0.28), 0px 16px 26px rgba(0,0,0,0.4)' } as ViewStyle,
  polaCap: { position: 'absolute', left: 4, right: 4, bottom: 7, textAlign: 'center', fontSize: 12.5 },
  hand: {
    position: 'absolute', right: 2, top: -6, zIndex: 4, fontSize: 12.5, lineHeight: 19, color: '#9C7566', backgroundColor: 'rgba(255,246,227,0.92)',
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7, overflow: 'hidden', transform: [{ rotate: '8deg' }], boxShadow: '0px 3px 8px rgba(120,80,60,0.12)',
  } as ViewStyle,
  hand2: {
    position: 'absolute', right: 6, top: -4, zIndex: 4, fontSize: 12.5, lineHeight: 19, color: '#FFE2A3', backgroundColor: 'rgba(43,49,104,0.95)',
    borderWidth: 1, borderColor: '#4A5590', paddingVertical: 6, paddingHorizontal: 11, borderRadius: 12, overflow: 'hidden', transform: [{ rotate: '6deg' }],
  } as ViewStyle,
  hand3: {
    position: 'absolute', right: 4, top: -2, zIndex: 4, fontSize: 12.5, color: '#C23E73', backgroundColor: '#fff', borderWidth: 2, borderColor: '#FFD3E3',
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden', transform: [{ rotate: '5deg' }], boxShadow: '0px 3px 0px #F4CDE0',
  } as ViewStyle,

  moonGlow: { position: 'absolute', left: 6, top: -16, width: 118, height: 118, borderRadius: 59, backgroundImage: 'radial-gradient(circle, rgba(255,217,130,0.32) 0%, rgba(255,217,130,0) 70%)' } as ViewStyle,
  moon: { position: 'absolute', left: 26, top: 4 },
  constel: { position: 'absolute', left: 104, top: 18 },
  hills: { position: 'absolute', left: 0, bottom: 0 },

  bub: { position: 'absolute', borderRadius: 999 },
  cloud: { position: 'absolute', left: 14, top: 30, transform: [{ rotate: '-4deg' }] },
  lolli: { position: 'absolute', left: 128, top: 112, transform: [{ rotate: '-14deg' }] },
  cst: { position: 'absolute', fontSize: 20 },
});
