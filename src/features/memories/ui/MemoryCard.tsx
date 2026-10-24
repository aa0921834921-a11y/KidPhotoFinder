/**
 * 點了星星（或流星命中）之後浮出來的回憶卡：照片、星座、日期、活動名稱、張數。
 * 日期只顯示資料夾名稱寫的日期；沒有的話老實說「資料夾沒有寫日期」。
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as TM from '../../../core/timeMachine';
import { getLang, tr } from '../../../i18n';
import type * as DB from '../../../services/db';
import { CONS } from '../constellations';
import type { Memory } from '../data';
import { Glyph, GOLD, Sparkle } from './GoldIcon';
import { MemPhoto } from './OrbPhoto';
import { consName } from '../text';

const lang = () => getLang() as TM.TMLang;

export function dayLine(m: Memory): string {
  return m.trusted ? `${TM.fmtDay(m.day, lang())}　·　${TM.since(m.day, lang())}` : tr('mem.noDate');
}

export function MemoryCard({ m, info, wish, font, still, onOpen, onNext, onClose, onWishAgain, bottom }: {
  m: Memory; info: Map<string, DB.PhotoInfo>; wish: boolean; font: { title: TextStyle; round: TextStyle }; still: boolean;
  onOpen: () => void; onNext?: () => void; onClose: () => void; onWishAgain?: () => void; bottom: number;
}) {
  const v = useSharedValue(0);
  useEffect(() => { v.value = 0; v.value = withTiming(1, { duration: still ? 1 : 420, easing: Easing.out(Easing.back(1.2)) }); }, [m, v, still]);
  const st = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.4), transform: [{ translateY: (1 - v.value) * 34 }, { scale: 0.96 + v.value * 0.04 }] }));
  const c = CONS[m.cons];
  return (
    <Animated.View style={[s.card, { bottom, borderColor: c.color } as ViewStyle, st]} accessibilityViewIsModal={false}>
      {wish ? (
        <View style={s.wishRow}>
          <Sparkle size={12} />
          <Text style={[font.round, s.wishText]}>{tr('sky.wishFound')}</Text>
          <Sparkle size={12} />
        </View>
      ) : null}
      <View style={s.row}>
        <Pressable onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel={`${m.title} ${tr('mem.openDay')}`}>
          <View style={[s.photoRing, { borderColor: c.color, boxShadow: `0px 0px 14px ${c.color}` } as ViewStyle]}>
            <MemPhoto m={m} id={m.cover} info={m.cover ? info.get(m.cover) : null} w={96} h={96} radius={14} />
          </View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={s.chip}>
            <Glyph name={c.icon} size={15} color={c.color} stroke={4} />
            <Text style={[font.round, s.chipText, { color: c.color }]} numberOfLines={1}>{consName(m.cons)}</Text>
          </View>
          <View style={s.dateRow}>
            <Glyph name="calendar" size={14} color="#CFC6F5" stroke={4} />
            <Text style={[font.round, s.date]} numberOfLines={1}>{dayLine(m)}</Text>
          </View>
          <Text style={[font.title, s.title]} numberOfLines={2}>{m.title}</Text>
          <Text style={[font.round, s.meta]} numberOfLines={1}>{tr('common.photos', { n: m.photos.length })}{m.parent ? `　·　${m.parent}` : ''}</Text>
        </View>
      </View>
      <View style={s.btns}>
        <Pressable onPress={onOpen} style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={tr('mem.openDay')}>
          <Glyph name="photos" size={18} color="#3A2A10" stroke={4} />
          <Text style={[font.round, s.primaryText]}>{tr('mem.openDay')}</Text>
        </Pressable>
        {wish && onWishAgain ? (
          <Pressable onPress={onWishAgain} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Sparkle size={11} />
            <Text style={[font.round, s.ghostText]}>{tr('sky.wishAgain')}</Text>
          </Pressable>
        ) : onNext ? (
          <Pressable onPress={onNext} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={tr('sky.next')}>
            <Text style={[font.round, s.ghostText]}>{tr('sky.next')}</Text>
            <Glyph name="chevron" size={14} stroke={5} />
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={onClose} style={s.close} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('mem.close')}>
        <Glyph name="close" size={18} color="#CFC6F5" stroke={5} />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    position: 'absolute', left: 12, right: 12, maxWidth: 520, alignSelf: 'center', marginHorizontal: 'auto', padding: 14, paddingTop: 12, borderRadius: 22, borderWidth: 1.2,
    backgroundColor: 'rgba(11,15,44,0.93)', boxShadow: '0px 14px 34px rgba(0,0,0,0.55)', gap: 10,
  } as ViewStyle,
  wishRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' },
  wishText: { color: GOLD, fontSize: 13.5, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photoRing: { borderWidth: 2, borderRadius: 17, padding: 1.5, backgroundColor: '#141A44' } as ViewStyle,
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingRight: 28 },
  chipText: { fontSize: 12.5, letterSpacing: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  date: { fontSize: 12.5, color: '#CFC6F5' },
  title: { fontSize: 19, lineHeight: 26, color: '#FFF3D6' },
  meta: { fontSize: 12.5, color: '#A9A2D6' },
  btns: { flexDirection: 'row', gap: 10 },
  primary: { flex: 1, minHeight: 46, borderRadius: 999, backgroundColor: '#FFD98A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0px 0px 16px rgba(255,200,110,0.55)' } as ViewStyle,
  primaryText: { color: '#3A2A10', fontSize: 15.5, fontWeight: '700' },
  ghost: { minHeight: 46, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.2, borderColor: 'rgba(255,226,162,0.7)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  ghostText: { color: GOLD, fontSize: 14 },
  close: { position: 'absolute', right: 6, top: 6, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
