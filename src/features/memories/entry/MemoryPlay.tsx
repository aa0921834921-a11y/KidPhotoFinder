/**
 * 回憶時光機裡的「回憶玩法」：每日刮刮樂、回憶星空的入口（跟回憶扭蛋放在一起）。
 * 不改首頁；刮刮樂會顯示今天刮過了沒。
 */
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { tr, useLang } from '../../../i18n';
import { cardStyle, P, SectionTitle } from '../../../ui/kit';
import { makeStyles, useTheme, type Theme } from '../../../ui/theme';
import { openedToday } from '../daily';

const SKY = require('../../../../assets/memory-ui/sky.webp');
const FOIL = require('../../../../assets/memory-ui/foil.webp');

export function MemoryPlay({ count }: { count: number }) {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const [done, setDone] = useState(false);
  useFocusEffect(useCallback(() => { openedToday().then(setDone).catch(() => {}); }, []));
  return (
    <View style={[cardStyle(t), s.box]}>
      <SectionTitle>{tr('mp.title')}</SectionTitle>
      <P muted style={{ fontSize: 13 }}>{tr('mp.sub')}</P>
      <View style={s.row}>
        <Pressable onPress={() => router.push('/memory-scratch')} accessibilityRole="button" accessibilityLabel={`${tr('mp.scratch')}，${done ? tr('mp.scratchDone') : tr('mp.scratchNew')}`}
          style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.98 }] }]}>
          <View style={s.art}>
            <Image source={FOIL} style={StyleSheet.absoluteFill} contentFit="cover" />
            {/* 刮開一角 */}
            <Svg width="100%" height="100%" viewBox="0 0 100 70" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
              <Path d={done ? 'M0 0H100V70H0Z' : 'M58 70 L100 22 L100 70 Z'} fill="#2B3A6E" opacity={done ? 0.55 : 0.9} />
              <Path d="M10 18 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2Z M82 12 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4 -4 -4 -1.4 4 -1.4Z" fill="#FFFFFF" opacity={0.9} />
            </Svg>
            <View style={s.frame} />
          </View>
          <Text style={s.tileTitle} numberOfLines={1}>{tr('mp.scratch')}</Text>
          <View style={[s.badge, { backgroundColor: done ? t.c.yesWash : t.c.accentWash }]}>
            <Text style={[s.badgeText, { color: done ? t.c.yes : t.c.accentDeep }]} numberOfLines={1}>{done ? tr('mp.scratchDone') : tr('mp.scratchNew')}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => router.push('/memory-sky')} accessibilityRole="button" accessibilityLabel={tr('mp.sky')}
          style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.98 }] }]}>
          <View style={s.art}>
            <Image source={SKY} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: '30%', left: '50%' } as never} />
            <Svg width="100%" height="100%" viewBox="0 0 100 70" style={StyleSheet.absoluteFill}>
              <Line x1={18} y1={44} x2={38} y2={24} stroke="#FFD987" strokeOpacity={0.8} strokeWidth={0.8} />
              <Line x1={38} y1={24} x2={62} y2={34} stroke="#FFD987" strokeOpacity={0.8} strokeWidth={0.8} />
              <Line x1={62} y1={34} x2={82} y2={18} stroke="#FF91D8" strokeOpacity={0.8} strokeWidth={0.8} />
              <Line x1={62} y1={34} x2={74} y2={54} stroke="#76DCFF" strokeOpacity={0.8} strokeWidth={0.8} />
              {[[18, 44, 3, '#FFD987'], [38, 24, 4.5, '#FFD987'], [62, 34, 6, '#FFE2A2'], [82, 18, 3.5, '#FF91D8'], [74, 54, 3.5, '#76DCFF']].map(([x, y, r, c], i) => (
                <Circle key={i} cx={x as number} cy={y as number} r={r as number} fill={c as string} opacity={0.95} />
              ))}
            </Svg>
          </View>
          <Text style={s.tileTitle} numberOfLines={1}>{tr('mp.sky')}</Text>
          <Text style={s.tileSub} numberOfLines={1}>{count ? tr('sky.count', { n: count }) : tr('mp.skySub')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t: Theme) => StyleSheet.create({
  box: { padding: 16, gap: 4 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  tile: { flex: 1, gap: 6 },
  art: { aspectRatio: 100 / 70, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0E1338' },
  frame: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,215,140,0.9)' } as ViewStyle,
  tileTitle: { ...t.title, fontSize: 16, lineHeight: 22, color: t.c.ink },
  tileSub: { ...t.round, fontSize: 12.5, color: t.c.muted },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  badgeText: { ...t.round, fontSize: 12 },
}));
