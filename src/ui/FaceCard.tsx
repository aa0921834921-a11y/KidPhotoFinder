/** 顯示資料庫裡某張臉（自動讀取臉的位置與照片縮圖） */
import React, { useEffect, useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import * as DB from '../services/db';
import { FaceThumb } from './kit';
import { usePreview } from './usePreview';

type Info = { fileId: string; box: number[]; w: number; h: number };
const cache = new Map<number, Info>();

export function useFace(faceId: number | null): Info | null {
  const [info, setInfo] = useState<Info | null>(faceId != null ? cache.get(faceId) || null : null);
  useEffect(() => {
    let alive = true;
    if (faceId == null) { setInfo(null); return; }
    const c = cache.get(faceId);
    if (c) { setInfo(c); return; }
    (async () => {
      const f = await DB.faceInfo(faceId);
      if (!f) return;
      const file = await DB.fileById(f.file_id);
      const v: Info = { fileId: f.file_id, box: [f.x, f.y, f.w, f.h], w: file?.w || 1, h: file?.h || 1 };
      cache.set(faceId, v);
      if (alive) setInfo(v);
    })().catch(() => {});
    return () => { alive = false; };
  }, [faceId]);
  return info;
}

export function FaceCard({ faceId, size, round, style, radius }: { faceId: number; size: number; round?: boolean; style?: StyleProp<ViewStyle>; radius?: number }) {
  const info = useFace(faceId);
  const uri = usePreview(info?.fileId || null, 1024);
  return <FaceThumb uri={uri} box={info?.box || [0, 0, 1, 1]} imgW={info?.w || 1} imgH={info?.h || 1} size={size} round={round} style={style} radius={radius} />;
}
