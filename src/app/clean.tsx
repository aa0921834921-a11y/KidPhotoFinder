/** 整理 LINE 下載的照片：選相簿 → 掃描 → 列出要刪的照片 → 家長按確定才刪 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tr, useLang, type TStrKey } from '../i18n';
import { deleteLocal, lastCleanTime, phoneAlbums, scanAlbum, stopClean, type CleanPlan, type PhoneAlbum } from '../services/localClean';
import { useApp } from '../services/state';
import { Bar, Btn, Card, cardStyle, H1, H2, Link, P, Paper, SectionTitle, Stamp, useContentWidth } from '../ui/kit';
import { makeStyles, useTheme, type Theme } from '../ui/theme';
import { usePreview } from '../ui/usePreview';

const RANGES: { k: string; t: TStrKey; ms: number }[] = [
  { k: 'last', t: 'clean.sinceLast', ms: 0 },
  { k: 'day', t: 'clean.d1', ms: 864e5 },
  { k: '3d', t: 'clean.d3', ms: 3 * 864e5 },
  { k: '7d', t: 'clean.d7', ms: 7 * 864e5 },
];

function Thumb({ fileId, size, on, onPress }: { fileId: string; size: number; on: boolean; onPress: () => void }) {
  const t = useTheme();
  useLang();
  const uri = usePreview(fileId, 256);
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={on ? tr('clean.willDelete') : tr('clean.keep')}>
      <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: t.c.line, borderWidth: 3, borderColor: on ? t.c.no : t.c.yes }}>
        {uri ? <Image source={{ uri }} style={[StyleSheet.absoluteFill, !on && { opacity: 1 }]} contentFit="cover" /> : null}
        {on ? <View style={{ position: 'absolute', right: 4, top: 4 }}><Stamp yes={false} size={24} /></View>
          : <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.c.yes, paddingVertical: 2 }}><Text style={{ color: '#fff', fontSize: 11, textAlign: 'center' }} numberOfLines={1}>{tr('clean.keep')}</Text></View>}
      </View>
    </Pressable>
  );
}

export default function Clean() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const app = useApp((x) => x);
  const w = useContentWidth(18);
  const [albums, setAlbums] = useState<PhoneAlbum[] | null>(null);
  const [err, setErr] = useState('');
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [range, setRange] = useState('last');
  const [last, setLast] = useState<number | null>(null);
  const [plan, setPlan] = useState<CleanPlan | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    phoneAlbums().then((a) => { setAlbums(a); if (a.length) setAlbumId(a[0].id); }).catch((e) => setErr(String(e?.message || e)));
  }, []);
  useEffect(() => { if (albumId) lastCleanTime(albumId).then((v) => { setLast(v); setRange(v ? 'last' : 'day'); }); }, [albumId]);

  const since = () => {
    const r = RANGES.find((x) => x.k === range)!;
    return r.k === 'last' ? (last || Date.now() - 864e5) : Date.now() - r.ms;
  };
  const start = async () => {
    if (!albumId) return;
    setPlan(null); setDone(null); setKeep(new Set());
    try { setPlan(await scanAlbum(albumId, since())); }
    catch (e: any) { Alert.alert(tr('common.notDone'), String(e?.message || e)); }
  };
  const remove = async () => {
    if (!plan) return;
    const ids = plan.remove.map((r) => r.fileId).filter((id) => !keep.has(id));
    setBusy(true);
    try {
      const n = await deleteLocal(ids);
      setDone(n);
      setPlan({ ...plan, remove: plan.remove.filter((r) => keep.has(r.fileId)) });
    } catch {
      Alert.alert(tr('clean.notDeletedTitle'), tr('clean.notDeletedBody'));
    } finally { setBusy(false); }
  };

  const cols = 4, gap = 8;
  const cell = Math.floor((w - 36 - 2 * t.border - (cols - 1) * gap) / cols);
  const toDelete = plan ? plan.remove.filter((r) => !keep.has(r.fileId)).length : 0;
  const scanning = app.running && !plan;

  return (
    <Paper>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={() => router.back()} /></View>
        <H1>{tr('clean.title')}</H1>
        <P muted>{tr('clean.intro')}</P>

        {!plan && !scanning ? (
          <>
            <Card style={{ gap: 6 }} tint={t.c.note}>
              <SectionTitle>{tr('clean.howTitle')}</SectionTitle>
              <P style={{ fontSize: 13.5 }}>{tr('clean.howBody')}</P>
            </Card>

            <Card style={{ gap: 10 }}>
              <SectionTitle>{tr('clean.whichAlbum')}</SectionTitle>
              {err ? <P style={{ color: t.c.noDeep }}>{err}</P> : null}
              {!albums && !err ? <ActivityIndicator color={t.c.accent} /> : null}
              {albums?.slice(0, 8).map((a) => (
                <Pressable key={a.id} onPress={() => setAlbumId(a.id)} style={[s.opt, albumId === a.id && s.optOn]} accessibilityRole="radio" accessibilityState={{ selected: albumId === a.id }}>
                  <Text style={[s.optText, albumId === a.id && { color: t.c.accentDeep }]}>{a.title}{a.isLine && !/line/i.test(a.title) ? tr('clean.lineTag') : ''}</Text>
                  <Text style={s.optSub}>{tr('common.photos', { n: a.count })}</Text>
                </Pressable>
              ))}
              {albums && !albums.length ? <P muted>{tr('clean.noAlbums')}</P> : null}
            </Card>

            <Card style={{ gap: 10 }}>
              <SectionTitle>{tr('clean.whichPhotos')}</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {RANGES.filter((r) => r.k !== 'last' || last).map((r) => (
                  <Pressable key={r.k} onPress={() => setRange(r.k)} style={[s.chip, range === r.k && s.optOn]}>
                    <Text style={[s.optText, { fontSize: 14 }, range === r.k && { color: t.c.accentDeep }]}>{tr(r.t)}</Text>
                  </Pressable>
                ))}
              </View>
              <P muted style={{ fontSize: 12.5 }}>{tr('clean.rangeNote')}</P>
            </Card>

            <Btn title={tr('clean.start')} onPress={start} disabled={!albumId} />
          </>
        ) : null}

        {scanning ? (
          <View style={[cardStyle(t), { padding: 16, gap: 10 }]}>
            <H2 style={{ fontSize: 18 }}>{app.phase === 'scan' ? tr('phase.scan') : app.phase === 'save' ? tr('clean.phaseSave') : app.phase === 'model' ? tr('phase.model') : tr('clean.phasePrep')}</H2>
            <Bar value={app.phase === 'model' ? app.modelProgress : app.total ? app.done / app.total : 0} indeterminate={app.phase !== 'scan' && app.phase !== 'model'} />
            <P muted style={{ fontSize: 13 }}>{app.phase === 'scan' && app.total ? tr('clean.progress', { done: app.done, total: app.total, found: app.found }) : app.message}</P>
            {app.phase === 'scan' ? <Btn small kind="ghost" title={tr('common.stop')} onPress={stopClean} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        ) : null}

        {plan ? (
          <>
            <View style={s.sumRow}>
              <View style={[cardStyle(t), s.sum]}><Text style={[s.sumN, { color: t.c.yes }]}>{plan.kept}</Text><Text style={s.sumL}>{tr('clean.kept')}</Text></View>
              <View style={[cardStyle(t), s.sum]}><Text style={[s.sumN, { color: t.c.tan }]}>{plan.review}</Text><Text style={s.sumL}>{tr('clean.unsure')}</Text></View>
              <View style={[cardStyle(t), s.sum]}><Text style={[s.sumN, { color: t.c.noDeep }]}>{plan.remove.length}</Text><Text style={s.sumL}>{tr('clean.noChild')}</Text></View>
            </View>
            {done != null ? <Card tint={t.c.yesWash}><P>{tr('clean.deleted', { n: done, review: plan.review })}</P></Card> : null}
            {plan.remove.length && done == null ? (
              <Card style={{ gap: 10 }}>
                <SectionTitle>{tr('clean.willDeleteTitle')}</SectionTitle>
                <P muted style={{ fontSize: 13 }}>{tr('clean.tapToKeep')}</P>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                  {plan.remove.map((r) => (
                    <Thumb key={r.fileId} fileId={r.fileId} size={cell} on={!keep.has(r.fileId)}
                      onPress={() => setKeep((k) => { const n = new Set(k); n.has(r.fileId) ? n.delete(r.fileId) : n.add(r.fileId); return n; })} />
                  ))}
                </View>
                <Btn busy={busy} title={tr('clean.deleteN', { n: toDelete })} onPress={remove} disabled={!toDelete} />
                <Link title={tr('clean.keepAll')} color={t.c.muted} onPress={() => router.back()} />
              </Card>
            ) : null}
            {!plan.remove.length && done == null ? <Card><P>{tr('clean.nothing')}</P></Card> : null}
            {plan.review ? <Btn kind="ghost" title={tr('clean.goReview', { n: plan.review })} onPress={() => { router.back(); router.navigate('/review'); }} /> : null}
            <Btn kind="ghost" title={tr('clean.again')} onPress={() => { setPlan(null); setDone(null); }} />
          </>
        ) : null}
      </ScrollView>
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 48, gap: 14 },
  opt: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: t.c.line, backgroundColor: t.c.card2 },
  optOn: { borderColor: t.c.accent, backgroundColor: t.c.accentWash },
  optText: { ...t.round, flex: 1, fontSize: 15, color: t.c.ink },
  optSub: { ...t.round, fontSize: 12.5, color: t.c.muted },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: t.c.line, backgroundColor: t.c.card2 },
  sumRow: { flexDirection: 'row', gap: 8 },
  sum: { flex: 1, padding: 12, alignItems: 'center' },
  sumN: { ...t.num, fontSize: 26 },
  sumL: { ...t.round, fontSize: 11.5, color: t.c.muted, textAlign: 'center', marginTop: 2 },
}));
