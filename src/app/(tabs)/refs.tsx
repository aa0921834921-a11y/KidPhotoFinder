import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tr, useLang, type TStrKey } from '../../i18n';
import * as DB from '../../services/db';
import { removeReference, scheduleApply } from '../../services/scanner';
import { useApp } from '../../services/state';
import { art, cardStyle, DashLine, HeadCard, Link, P, Paper, useContentWidth } from '../../ui/kit';
import { pickAndAddRefs } from '../../ui/pickRefs';
import { makeStyles, useTheme, type Theme } from '../../ui/theme';

type Ref = Awaited<ReturnType<typeof DB.listRefs>>[number];
type Look = 'ok' | 'mid' | 'bad' | 'wait';
const STATUS: Record<string, [TStrKey, Look]> = {
  ok: ['refs.ok', 'ok'], anchor: ['refs.ok', 'ok'], multi: ['refs.multi', 'mid'],
  outlier: ['refs.outlier', 'bad'], noface: ['refs.noface', 'bad'],
};

export default function Refs() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const version = useApp((x) => x.version);
  const w = useContentWidth(16);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
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
    try { if (await pickAndAddRefs(setMsg)) scheduleApply(); } catch (e: any) { Alert.alert(tr('common.addFailed'), String(e?.message || e)); }
    finally { setBusy(false); setRefs(await DB.listRefs()); }
  };
  const del = (r: Ref) => Alert.alert(tr('refs.delTitle'), tr('refs.delBody'), [
    { text: tr('common.cancel'), style: 'cancel' },
    { text: tr('refs.del'), style: 'destructive', onPress: async () => { await removeReference(r.id, r.uri); setRefs(await DB.listRefs()); scheduleApply(); } },
  ]);

  return (
    <Paper cap={tr('refs.cap')}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <HeadCard title={tr('refs.title')} sub={tr('refs.sub')} />

        <View style={s.legend}>
          {([[tr('refs.ok'), ring.ok], [tr('refs.legendMid'), ring.mid], [tr('refs.legendBad'), ring.bad]] as const).map(([l, c]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
              <Text style={s.legendText}>{l}</Text>
            </View>
          ))}
        </View>

        <View style={[cardStyle(t), s.person]}>
          <View style={s.ph}>
            <Text style={s.phTitle}>{tr('refs.myChild')}</Text>
            <Text style={[s.phSub, { color: good >= 5 ? t.c.yes : t.c.tan }]}>{good >= 5 ? tr('refs.good', { n: good }) : tr('refs.needMore', { n: good })}</Text>
          </View>
          <DashLine style={{ marginBottom: 14 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, rowGap: 14 }}>
            {refs.map((r) => {
              const [key, look] = STATUS[r.status] || (['refs.processing', 'wait'] as [TStrKey, Look]);
              const label = tr(key);
              return (
                <Pressable key={r.id} onLongPress={() => del(r)} delayLongPress={350} style={{ width: size, alignItems: 'center', gap: 6 }} accessibilityHint={tr('refs.delHint')}>
                  <Image source={{ uri: r.uri }} style={[s.ref, { width: size, height: size, borderColor: ring[look] }, look === 'bad' && { opacity: 0.6 }, look === 'wait' && { opacity: 0.5 }]} contentFit="cover" />
                  <Text style={[s.refLabel, { color: text[look] }]} numberOfLines={2}>{label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={busy ? undefined : add} style={{ width: size, alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel={tr('refs.addA11y')}>
              <View style={[s.drop, { width: size, height: size }]}>
                {busy ? <ActivityIndicator color={t.c.accent} /> : <><Text style={s.dropPlus}>+</Text><Text style={s.dropText} numberOfLines={2}>{tr('refs.add')}</Text></>}
              </View>
              <Text style={s.refLabel}>{tr('refs.fromPhone')}</Text>
            </Pressable>
          </View>
          {msg ? <P muted style={{ fontSize: 13, textAlign: 'center', marginTop: 8 }}>{msg}</P> : null}
          {t.art === 'watercolor' ? <View pointerEvents="none" style={s.corner}><Image source={art.blooms} style={{ flex: 1 }} contentFit="contain" /></View> : null}
        </View>
        {refs.length ? <P muted style={{ fontSize: 12, textAlign: 'center' }}>{tr('refs.delNote')}</P> : null}

        <View style={[cardStyle(t), s.person]}>
          <View style={s.ph}>
            <Text style={s.phTitle}>{tr('refs.confusedTitle')}</Text>
          </View>
          <DashLine style={{ marginBottom: 12 }} />
          <P muted style={{ fontSize: 13.5 }}>{tr('refs.confusedBody')}</P>
          <Link title={tr('refs.goReview')} onPress={() => router.navigate('/review')} style={{ marginTop: 4 }} />
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
    dropText: { ...t.round, fontSize: 11.5, color: c.muted, textAlign: 'center', paddingHorizontal: 6 },
    corner: { position: 'absolute', right: -6, bottom: -6, width: 120, height: 66, transform: [{ scaleX: -1 }], opacity: 0.75 },
  });
});
