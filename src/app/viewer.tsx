import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sp, tr, useLang } from '../i18n';
import * as DB from '../services/db';
import { scheduleApply } from '../services/scanner';
import { useFace } from '../ui/FaceCard';
import { Btn } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { usePreview } from '../ui/usePreview';

export default function Viewer() {
  const { id, face } = useLocalSearchParams<{ id: string; face?: string }>();
  const ins = useSafeAreaInsets();
  const t = useTheme();
  useLang();
  const { width, height } = useWindowDimensions();
  const uri = usePreview(id, 2048);
  const info = useFace(face ? Number(face) : null);
  const [file, setFile] = useState<DB.FileRow | null>(null);
  useEffect(() => { DB.fileById(id).then(setFile); }, [id]);

  // 照片在畫面上的位置，用來畫出臉的框
  const iw = file?.w || 1, ih = file?.h || 1;
  const k = Math.min(width / iw, (height - 200) / ih);
  const dw = iw * k, dh = ih * k;

  const answer = async (l: 1 | -1) => { if (face) { await DB.setLabel(Number(face), l); scheduleApply(); } router.back(); };

  return (
    <View style={{ flex: 1, backgroundColor: '#1d1612', paddingTop: ins.top, paddingBottom: ins.bottom + 10 }}>
      <Pressable onPress={() => router.back()} style={{ padding: 14 }}><Text style={{ color: '#fff', fontSize: 16 }}>{tr('viewer.close')}</Text></Pressable>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: dw, height: dh }}>
          {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} /> : null}
          {info ? <View style={{ position: 'absolute', left: info.box[0] * k, top: info.box[1] * k, width: info.box[2] * k, height: info.box[3] * k, borderWidth: 3, borderColor: t.c.accent, borderRadius: 8 }} /> : null}
        </View>
      </View>
      <Text style={{ color: '#d8c8bb', textAlign: 'center', fontSize: 12, marginVertical: 8 }}>{file ? `${file.folder.split('/').pop()}${sp()}${file.name}` : ''}</Text>
      {face ? (
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 18 }}>
          <Btn kind="no" title={tr('viewer.notIt')} style={{ flex: 1 }} onPress={() => answer(-1)} />
          <Btn kind="yes" title={tr('viewer.isIt')} style={{ flex: 1 }} onPress={() => answer(1)} />
        </View>
      ) : null}
    </View>
  );
}
