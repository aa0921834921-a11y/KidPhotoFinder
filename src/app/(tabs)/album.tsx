import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import * as DB from '../../services/db';
import { useApp } from '../../services/state';
import { Polaroid } from '../../ui/art';
import { art, DashLine, Empty, HeadCard, Paper, useContentWidth } from '../../ui/kit';
import { makeStyles, radii, useTheme, type Theme } from '../../ui/theme';
import { usePreview } from '../../ui/usePreview';

type Row = Awaited<ReturnType<typeof DB.savedByFolder>>[number];
type Section = { title: string; sub: string; data: Row[][]; n: number };
const TILT = [0, 1.6, -1.2, 0.6];

function Thumb({ r, size, i }: { r: Row; size: number; i: number }) {
  const uri = usePreview(r.file_id, 512);
  return <Polaroid uri={uri} size={size} tilt={TILT[i % 4]} tape={null} video={r.kind === 'video'}
    onPress={() => router.push({ pathname: '/viewer', params: { id: r.file_id, list: 'saved' } })} />;
}

export default function Album() {
  const t = useTheme();
  const s = useStyles();
  const version = useApp((x) => x.version);
  const w = useContentWidth(16);
  const [sections, setSections] = useState<Section[]>([]);
  const [total, setTotal] = useState(0);
  const cols = w > 560 ? 5 : 3;
  const gap = t.tilt ? 10 : 6;
  const plain = t.id === 'minimal' || t.id === 'starry';
  const size = Math.floor((w - 28 - (cols - 1) * gap) / cols) - (plain ? 0 : 10);

  useFocusEffect(useCallback(() => {
    DB.savedByFolder().then((rows) => {
      const g = new Map<string, Row[]>();
      for (const r of rows) {
        if (!g.has(r.folder)) g.set(r.folder, []);
        g.get(r.folder)!.push(r);
      }
      setTotal(rows.length);
      setSections([...g].map(([folder, list]) => {
        const parts = folder.split('/').filter(Boolean);
        const data: Row[][] = [];
        for (let i = 0; i < list.length; i += cols) data.push(list.slice(i, i + cols));
        return { title: parts[parts.length - 1] || folder, sub: parts.slice(0, -1).join(' / '), data, n: list.length };
      }));
    });
  }, [version, cols]));

  return (
    <Paper cap="成長相簿">
      <SectionList
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={{ marginBottom: 16 }}><HeadCard title="寶貝相簿" sub={`共 ${total} 張，也都在手機「照片」App 的「童年拾光」相簿裡。`} /></View>}
        ListEmptyComponent={<Empty title="還沒有照片" body="到首頁按「立即找新照片」開始吧。" />}
        sections={sections}
        keyExtractor={(row) => row[0].file_id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={s.top}>
            <View style={s.gh}>
              <View style={s.ghRow}>
                <Text style={s.ghTitle}>{t.id !== 'minimal' ? <Text style={{ color: t.c.accent }}>{t.id === 'starry' ? '✦ ' : '✿ '}</Text> : null}{section.title}</Text>
                <Text style={s.ghN}>{section.n} 張</Text>
              </View>
              {section.sub ? <Text style={s.ghSub}>📁 {section.sub}</Text> : null}
            </View>
            <DashLine style={{ marginBottom: 14 }} />
          </View>
        )}
        renderItem={({ item, index }) => (
          <View style={s.mid}>
            <View style={{ flexDirection: 'row', gap, paddingBottom: t.tilt ? 14 : gap, justifyContent: plain ? 'flex-start' : 'space-around' }}>
              {item.map((r, j) => <Thumb key={r.file_id} r={r} size={size} i={index * cols + j} />)}
              {Array.from({ length: cols - item.length }, (_, k) => <View key={k} style={{ width: size + (plain ? 0 : 10) }} />)}
            </View>
          </View>
        )}
        renderSectionFooter={() => (
          <View style={s.bottom}>
            {t.art === 'watercolor' ? <View pointerEvents="none" style={s.corner}><Image source={art.blooms} style={{ flex: 1 }} contentFit="contain" /></View> : null}
          </View>
        )}
      />
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  const r = radii(t);
  const side = { backgroundColor: c.card, borderLeftWidth: t.border, borderRightWidth: t.border, borderColor: c.line } as const;
  return StyleSheet.create({
    scroll: { padding: 16, paddingTop: t.id === 'book' ? 12 : 14, paddingBottom: 40 },
    top: { ...side, borderTopWidth: t.border, borderTopLeftRadius: r.borderTopLeftRadius, borderTopRightRadius: r.borderTopRightRadius, paddingTop: 16, paddingHorizontal: 14 },
    mid: { ...side, paddingHorizontal: 14 },
    bottom: {
      ...side, borderBottomWidth: t.border, borderBottomLeftRadius: r.borderBottomLeftRadius, borderBottomRightRadius: r.borderBottomRightRadius,
      height: 18, marginBottom: 16, zIndex: 2, boxShadow: t.id === 'candy' ? '0px 5px 0px #F4CDE0' : 'none',
    } as any,
    gh: { gap: 4, paddingBottom: 10 },
    ghRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    ghTitle: { ...t.title, fontSize: 18, lineHeight: 25, color: t.id === 'watercolor' || t.id === 'book' ? '#885B52' : c.groupTitle, flexShrink: 1 },
    ghN: { ...t.round, fontSize: 12, color: c.muted },
    ghSub: { ...t.round, fontSize: 12, lineHeight: 17, color: c.muted },
    corner: { position: 'absolute', right: -4, bottom: -2, width: 96, height: 52, transform: [{ scaleX: -1 }], opacity: 0.6 },
  });
});
