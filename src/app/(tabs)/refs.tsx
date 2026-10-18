import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DB from '../../services/db';
import { removeReference, scheduleApply } from '../../services/scanner';
import { useApp } from '../../services/state';
import { art, cardStyle, DashLine, HeadCard, Link, P, Paper, useContentWidth } from '../../ui/kit';
import { pickAndAddRefs } from '../../ui/pickRefs';
import { makeStyles, useTheme, type Theme } from '../../ui/theme';

type Ref = Awaited<ReturnType<typeof DB.listRefs>>[number];
type Look = 'ok' | 'mid' | 'bad' | 'wait';
const STATUS: Record<string, [string, Look]> = {
  ok: ['可以用', 'ok'], anchor: ['可以用', 'ok'], multi: ['從合照挑出', 'mid'],
  outlier: ['不太像，沒使用', 'bad'], noface: ['找不到臉', 'bad'],
};

export default function Refs() {
  const t = useTheme();
  const s = useStyles();
  const version = useApp((x) => x.version);
  const w = useContentWidth(16);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { DB.listRefs().then(setRefs); }, [version]));
  const cols = w > 560 ? 5 : 3;
  const gap = 12;
  const size = Math.floor((w - 28 - 2 * t.border - (cols - 1) * gap) / cols);
  const good = refs.filter((r) => r.status === 'ok' || r.status === 'anchor' || r.status === 'multi').length;
  const ring: Record<Look, string> = {
    ok: t.id === 'starry' ? '#8FD9B6' : t.id === 'candy' ? '#7CC6FF' : t.id === 'minimal' ? t.c.yes : '#93B391',
    mid: '#D5A363', bad: '#DC9691', wait: t.c.line,
  };
  const text: Record<Look, string> = { ok: t.c.yes, mid: t.c.tan, bad: t.c.noDeep, wait: t.c.muted };

  const add = async () => {
    setBusy(true);
    try { if (await pickAndAddRefs()) scheduleApply(); } catch (e: any) { Alert.alert('沒有加成功', String(e?.message || e)); }
    finally { setBusy(false); setRefs(await DB.listRefs()); }
  };
  const del = (r: Ref) => Alert.alert('刪除這張參考照片？', '只會從小幫手移除，不會刪掉手機相簿裡的照片。', [
    { text: '取消', style: 'cancel' },
    { text: '刪除', style: 'destructive', onPress: async () => { await removeReference(r.id, r.uri); setRefs(await DB.listRefs()); scheduleApply(); } },
  ]);

  return (
    <Paper cap="參考照片">
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <HeadCard title="寶貝的小模樣" sub="放 5～15 張孩子清楚的照片（不同天、不同角度更好）。小幫手會用這些照片認出孩子。" />

        <View style={s.legend}>
          {([['可以用', ring.ok], ['從合照挑出的臉', ring.mid], ['不會使用', ring.bad]] as const).map(([l, c]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
              <Text style={s.legendText}>{l}</Text>
            </View>
          ))}
        </View>

        <View style={[cardStyle(t), s.person]}>
          <View style={s.ph}>
            <Text style={s.phTitle}>我的小孩</Text>
            <Text style={[s.phSub, { color: good >= 5 ? t.c.yes : t.c.tan }]}>{good >= 5 ? `${good} 張可以用，很好！` : `${good} 張可以用，建議至少 5 張`}</Text>
          </View>
          <DashLine style={{ marginBottom: 14 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, rowGap: 14 }}>
            {refs.map((r) => {
              const [label, look] = STATUS[r.status] || ['處理中…', 'wait' as Look];
              return (
                <Pressable key={r.id} onLongPress={() => del(r)} delayLongPress={350} style={{ width: size, alignItems: 'center', gap: 6 }} accessibilityHint="長按可以刪除">
                  <Image source={{ uri: r.uri }} style={[s.ref, { width: size, height: size, borderColor: ring[look] }, look === 'bad' && { opacity: 0.6 }, look === 'wait' && { opacity: 0.5 }]} contentFit="cover" />
                  <Text style={[s.refLabel, { color: text[look] }]} numberOfLines={2}>{label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={busy ? undefined : add} style={{ width: size, alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel="從手機相簿加入照片">
              <View style={[s.drop, { width: size, height: size }]}>
                {busy ? <ActivityIndicator color={t.c.accent} /> : <><Text style={s.dropPlus}>+</Text><Text style={s.dropText}>加入照片</Text></>}
              </View>
              <Text style={s.refLabel}>從手機相簿挑</Text>
            </Pressable>
          </View>
          {t.art === 'watercolor' ? <View pointerEvents="none" style={s.corner}><Image source={art.blooms} style={{ flex: 1 }} contentFit="contain" /></View> : null}
        </View>
        {refs.length ? <P muted style={{ fontSize: 12, textAlign: 'center' }}>長按照片可以刪除（只會從小幫手移除）。</P> : null}

        <View style={[cardStyle(t), s.person]}>
          <View style={s.ph}>
            <Text style={s.phTitle}>常被認錯的同學？</Text>
          </View>
          <DashLine style={{ marginBottom: 12 }} />
          <P muted style={{ fontSize: 13.5 }}>在「確認」把他們標成「不是」，小幫手就會慢慢學會排除，下次比較不會認錯。</P>
          <Link title="去確認照片 →" onPress={() => router.navigate('/review')} style={{ marginTop: 4 }} />
        </View>
      </ScrollView>
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  return StyleSheet.create({
    scroll: { padding: 16, paddingTop: t.id === 'book' ? 12 : 14, paddingBottom: 40, gap: 14 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 2 },
    legendText: { ...t.round, fontSize: 12, color: c.muted },
    person: { padding: 14, paddingTop: 16, paddingBottom: 20, overflow: 'hidden' },
    ph: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingBottom: 10, flexWrap: 'wrap' },
    phTitle: { ...t.title, fontSize: 19, color: t.id === 'watercolor' || t.id === 'book' ? '#8A5B51' : c.ink },
    phSub: { ...t.round, fontSize: 12 },
    ref: { borderRadius: 999, borderWidth: 4, backgroundColor: c.line, boxShadow: '0px 4px 12px rgba(99,70,40,0.2)' } as any,
    refLabel: { ...t.round, fontSize: 11, lineHeight: 15, textAlign: 'center', color: c.muted },
    drop: { borderRadius: 999, borderWidth: 2, borderStyle: 'dashed', borderColor: c.dash, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center', gap: 2 },
    dropPlus: { ...t.round, fontSize: 28, lineHeight: 30, color: c.accent },
    dropText: { ...t.round, fontSize: 11.5, color: c.muted },
    corner: { position: 'absolute', right: -6, bottom: -6, width: 120, height: 66, transform: [{ scaleX: -1 }], opacity: 0.75 },
  });
});
