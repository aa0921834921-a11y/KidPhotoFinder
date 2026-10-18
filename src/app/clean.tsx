/** 整理 LINE 下載的照片：選相簿 → 掃描 → 列出要刪的照片 → 家長按確定才刪 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { deleteLocal, lastCleanTime, phoneAlbums, scanAlbum, stopClean, type CleanPlan, type PhoneAlbum } from '../services/localClean';
import { useApp } from '../services/state';
import { Bar, Btn, Card, cardStyle, H1, H2, Link, P, Paper, SectionTitle, Stamp, useContentWidth } from '../ui/kit';
import { makeStyles, useTheme, type Theme } from '../ui/theme';
import { usePreview } from '../ui/usePreview';

const RANGES: { k: string; t: string; ms: number }[] = [
  { k: 'last', t: '上次整理之後', ms: 0 },
  { k: 'day', t: '最近 1 天', ms: 864e5 },
  { k: '3d', t: '最近 3 天', ms: 3 * 864e5 },
  { k: '7d', t: '最近 7 天', ms: 7 * 864e5 },
];

function Thumb({ fileId, size, on, onPress }: { fileId: string; size: number; on: boolean; onPress: () => void }) {
  const t = useTheme();
  const uri = usePreview(fileId, 256);
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={on ? '會刪除' : '保留'}>
      <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: t.c.line, borderWidth: 3, borderColor: on ? t.c.no : t.c.yes }}>
        {uri ? <Image source={{ uri }} style={[StyleSheet.absoluteFill, !on && { opacity: 1 }]} contentFit="cover" /> : null}
        {on ? <View style={{ position: 'absolute', right: 4, top: 4 }}><Stamp yes={false} size={24} /></View>
          : <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.c.yes, paddingVertical: 2 }}><Text style={{ color: '#fff', fontSize: 11, textAlign: 'center' }}>保留</Text></View>}
      </View>
    </Pressable>
  );
}

export default function Clean() {
  const t = useTheme();
  const s = useStyles();
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
    catch (e: any) { Alert.alert('沒有完成', String(e?.message || e)); }
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
      Alert.alert('沒有刪除', '照片都還在。');
    } finally { setBusy(false); }
  };

  const cols = 4, gap = 8;
  const cell = Math.floor((w - 36 - 2 * t.border - (cols - 1) * gap) / cols);
  const toDelete = plan ? plan.remove.filter((r) => !keep.has(r.fileId)).length : 0;
  const scanning = app.running && !plan;

  return (
    <Paper>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={{ alignSelf: 'flex-start' }}><Link title="‹ 返回" onPress={() => router.back()} /></View>
        <H1>整理 LINE 照片</H1>
        <P muted>把 LINE 相簿下載到手機後，小幫手幫你留下有孩子的照片，其他的列出來讓你確認後刪除。</P>

        {!plan && !scanning ? (
          <>
            <Card style={{ gap: 6 }} tint={t.c.note}>
              <SectionTitle>先在 LINE 下載照片</SectionTitle>
              <P style={{ fontSize: 13.5 }}>1. 打開 LINE 群組 → 相簿 → 選相簿{'\n'}2. 右上角「⋯」→「下載」（或全選後下載）{'\n'}3. 下載完回到這裡，按下面的「開始整理」</P>
            </Card>

            <Card style={{ gap: 10 }}>
              <SectionTitle>要整理哪個相簿</SectionTitle>
              {err ? <P style={{ color: t.c.noDeep }}>{err}</P> : null}
              {!albums && !err ? <ActivityIndicator color={t.c.accent} /> : null}
              {albums?.slice(0, 8).map((a) => (
                <Pressable key={a.id} onPress={() => setAlbumId(a.id)} style={[s.opt, albumId === a.id && s.optOn]} accessibilityRole="radio" accessibilityState={{ selected: albumId === a.id }}>
                  <Text style={[s.optText, albumId === a.id && { color: t.c.accentDeep }]}>{a.title}{a.isLine && !/line/i.test(a.title) ? '（LINE）' : ''}</Text>
                  <Text style={s.optSub}>{a.count} 張</Text>
                </Pressable>
              ))}
              {albums && !albums.length ? <P muted>手機裡沒有找到相簿。</P> : null}
            </Card>

            <Card style={{ gap: 10 }}>
              <SectionTitle>整理哪些照片</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {RANGES.filter((r) => r.k !== 'last' || last).map((r) => (
                  <Pressable key={r.k} onPress={() => setRange(r.k)} style={[s.chip, range === r.k && s.optOn]}>
                    <Text style={[s.optText, { fontSize: 14 }, range === r.k && { color: t.c.accentDeep }]}>{r.t}</Text>
                  </Pressable>
                ))}
              </View>
              <P muted style={{ fontSize: 12.5 }}>只會看這段時間「新增到這個相簿」的照片，其他照片一張都不會動。</P>
            </Card>

            <Btn title="✿ 開始整理" onPress={start} disabled={!albumId} />
          </>
        ) : null}

        {scanning ? (
          <View style={[cardStyle(t), { padding: 16, gap: 10 }]}>
            <H2 style={{ fontSize: 18 }}>{app.phase === 'scan' ? '正在找臉' : app.phase === 'save' ? '正在收進相簿' : app.phase === 'model' ? '正在下載辨識模型' : '正在準備'}</H2>
            <Bar value={app.phase === 'model' ? app.modelProgress : app.total ? app.done / app.total : 0} indeterminate={app.phase !== 'scan' && app.phase !== 'model'} />
            <P muted style={{ fontSize: 13 }}>{app.phase === 'scan' && app.total ? `${app.done} / ${app.total}　有臉的照片 ${app.found} 張` : app.message}</P>
            {app.phase === 'scan' ? <Btn small kind="ghost" title="停止" onPress={stopClean} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        ) : null}

        {plan ? (
          <>
            <View style={s.sumRow}>
              <View style={[cardStyle(t), s.sum]}><Text style={[s.sumN, { color: t.c.yes }]}>{plan.kept}</Text><Text style={s.sumL}>有孩子，已收進相簿</Text></View>
              <View style={[cardStyle(t), s.sum]}><Text style={[s.sumN, { color: t.c.tan }]}>{plan.review}</Text><Text style={s.sumL}>不確定，先留著</Text></View>
              <View style={[cardStyle(t), s.sum]}><Text style={[s.sumN, { color: t.c.noDeep }]}>{plan.remove.length}</Text><Text style={s.sumL}>沒有孩子</Text></View>
            </View>
            {done != null ? <Card tint={t.c.yesWash}><P>已刪除 {done} 張。{plan.review ? `還有 ${plan.review} 張不確定的，到「確認」點一點，之後再整理一次就能刪掉。` : ''}</P></Card> : null}
            {plan.remove.length && done == null ? (
              <Card style={{ gap: 10 }}>
                <SectionTitle>這些照片會刪除</SectionTitle>
                <P muted style={{ fontSize: 13 }}>點一下可以改成「保留」。刪除後手機會再問一次，確定才會刪。</P>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                  {plan.remove.map((r) => (
                    <Thumb key={r.fileId} fileId={r.fileId} size={cell} on={!keep.has(r.fileId)}
                      onPress={() => setKeep((k) => { const n = new Set(k); n.has(r.fileId) ? n.delete(r.fileId) : n.add(r.fileId); return n; })} />
                  ))}
                </View>
                <Btn busy={busy} title={`刪除 ${toDelete} 張`} onPress={remove} disabled={!toDelete} />
                <Link title="先不要刪，全部留著" color={t.c.muted} onPress={() => router.back()} />
              </Card>
            ) : null}
            {!plan.remove.length && done == null ? <Card><P>沒有需要刪除的照片 ♡</P></Card> : null}
            {plan.review ? <Btn kind="ghost" title={`去確認 ${plan.review} 張不確定的`} onPress={() => { router.back(); router.navigate('/review'); }} /> : null}
            <Btn kind="ghost" title="再整理一次" onPress={() => { setPlan(null); setDone(null); }} />
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
