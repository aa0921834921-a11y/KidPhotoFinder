/**
 * 回憶照片（回憶時光機、回憶扭蛋共用）：
 * - Android 直接用手機相簿裡的那張（快、不用網路）；不行再用雲端硬碟的縮圖
 * - 孩子的臉放在畫面中間
 */
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { bestPhotos } from '../core/events';
import type { TMEvent } from '../core/timeMachine';
import * as DB from '../services/db';
import { useTheme } from './theme';
import { usePreview } from './usePreview';

export type Info = DB.PhotoInfo;

export function Photo({ id, info, size, w, h, radius = 6, style, bg }: {
  id: string; info?: Info | null; size?: number; w?: number; h?: number; radius?: number; style?: ViewStyle; bg?: string;
}) {
  const t = useTheme();
  const [bad, setBad] = useState(false);
  const W = w ?? size ?? 100, H = h ?? size ?? 100;
  const local = !bad && info && Platform.OS === 'android' && info.asset_id?.startsWith('content://') ? info.asset_id : null;
  const preview = usePreview(local ? null : id, Math.max(W, H) > 200 ? 768 : 384);
  const uri = local || preview;
  const pos = info && info.fx != null && info.fy != null && info.fw && info.fh && info.w && info.h
    ? { left: `${Math.round(((info.fx + info.fw / 2) / info.w) * 100)}%`, top: `${Math.round(((info.fy + info.fh * 0.6) / info.h) * 100)}%` }
    : { left: '50%', top: '40%' };
  return (
    <View style={[{ width: W, height: H, borderRadius: radius, overflow: 'hidden', backgroundColor: bg ?? t.c.line }, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={pos as never} transition={200} onError={() => setBad(true)} /> : null}
    </View>
  );
}

/** 一個活動最好看的幾張（孩子的臉最清楚的在最前面） */
export function useBest(ev: TMEvent | null, n = 3): Info[] {
  const [rows, setRows] = useState<Info[]>([]);
  useEffect(() => {
    let alive = true;
    setRows([]);
    if (!ev) return;
    DB.photosInfo(ev.photos.slice(0, 40).map((p) => p.id))
      .then((r) => { if (alive) setRows(bestPhotos(r, n).length ? bestPhotos(r, n) : r.slice(0, n)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [ev, n]);
  return rows;
}
