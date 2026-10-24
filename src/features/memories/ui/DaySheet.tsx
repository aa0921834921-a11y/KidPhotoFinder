/**
 * 「進入那一天」：那個活動的全部照片。點照片用 App 原本的看照片畫面（/viewer）打開。
 * 用覆蓋在畫面上的方式（不是 Modal），從看照片回來時還停在這一天。
 */
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tr } from '../../../i18n';
import type * as DB from '../../../services/db';
import { CONS } from '../constellations';
import type { Memory } from '../data';
import { Glyph, GOLD } from './GoldIcon';
import { dayLine } from './MemoryCard';
import { MemPhoto } from './OrbPhoto';
import { consName } from '../text';

export function DaySheet({ m, info, font, onClose, onDemoTap, still }: {
  m: Memory; info: Map<string, DB.PhotoInfo>; font: { title: TextStyle; round: TextStyle }; onClose: () => void; onDemoTap: () => void; still: boolean;
}) {
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const v = useSharedValue(0);
  useEffect(() => { v.value = withTiming(1, { duration: still ? 1 : 320, easing: Easing.out(Easing.cubic) }); }, [v, still]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);
  const st = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 40 }] }));
  const w = Math.min(width, 900) - 32;
  const cols = w > 560 ? 5 : 3;
  const size = Math.floor((w - (cols - 1) * 6) / cols);
  const c = CONS[m.cons];
  const open = (id: string) => {
    if (m.demo) { onDemoTap(); return; }
    router.push({ pathname: '/viewer', params: { id, list: 'saved' } });
  };
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.bg, st]}>
      <ScrollView contentContainerStyle={{ paddingTop: ins.top + 8, paddingBottom: ins.bottom + 30, paddingHorizontal: 16, gap: 8, alignSelf: 'center', width: Math.min(width, 900) }}>
        <Pressable onPress={onClose} style={s.back} accessibilityRole="button" accessibilityLabel={tr('mem.back')} hitSlop={6}>
          <Glyph name="back" size={20} stroke={5} />
          <Text style={[font.round, s.backText]}>{tr('mem.back')}</Text>
        </Pressable>
        <View style={s.chip}>
          <Glyph name={c.icon} size={16} color={c.color} stroke={4} />
          <Text style={[font.round, { color: c.color, fontSize: 13, letterSpacing: 1 }]}>{consName(m.cons)}</Text>
        </View>
        <Text style={[font.title, s.title]}>{m.title}</Text>
        <Text style={[font.round, s.meta]}>{dayLine(m)}　·　{tr('common.photos', { n: m.photos.length })}{m.parent ? `　·　${m.parent}` : ''}</Text>
        <View style={s.grid}>
          {m.photos.slice(0, 300).map((p) => (
            <Pressable key={p.id} onPress={() => open(p.id)} accessibilityRole="imagebutton" accessibilityLabel={m.title} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
              <MemPhoto m={m} id={p.id} info={info.get(p.id)} w={size} h={size} radius={10} />
              {p.kind === 'video' ? <Text style={s.play}>▶</Text> : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  bg: { backgroundColor: '#080C26' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, paddingRight: 12 },
  backText: { color: GOLD, fontSize: 15 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  title: { fontSize: 25, lineHeight: 34, color: '#FFF3D6' },
  meta: { fontSize: 13, color: '#B9B2E0', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  play: { position: 'absolute', left: 6, bottom: 4, color: '#fff', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
