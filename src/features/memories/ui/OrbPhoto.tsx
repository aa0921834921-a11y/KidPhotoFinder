/** 回憶的照片：正式資料用相簿裡那張（Android 直接讀手機相簿，不行再用雲端縮圖）；示範資料用內建的示範圖 */
import { Image } from 'expo-image';
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import type * as DB from '../../../services/db';
import { Photo } from '../../../ui/memPhoto';
import { demoImage, type Memory } from '../data';

export function MemPhoto({ m, id, info, w, h, radius = 0, style }: {
  m: Memory; id: string | null; info?: DB.PhotoInfo | null; w: number; h: number; radius?: number; style?: ViewStyle;
}) {
  const demo = id ? demoImage(m, id) : null;
  if (m.demo) {
    return (
      <View style={[{ width: w, height: h, borderRadius: radius, overflow: 'hidden', backgroundColor: '#1A2050' }, style]}>
        {demo != null ? <Image source={demo} style={{ width: w, height: h }} contentFit="cover" transition={150} /> : null}
      </View>
    );
  }
  if (!id) return <View style={[{ width: w, height: h, borderRadius: radius, backgroundColor: '#1A2050' }, style]} />;
  return <Photo id={id} info={info} w={w} h={h} radius={radius} style={style} bg="#1A2050" />;
}
