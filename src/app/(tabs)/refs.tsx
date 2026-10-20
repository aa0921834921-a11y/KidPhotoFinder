import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { tr, useLang, type TStrKey } from '../../i18n';
import * as DB from '../../services/db';
import { removeKid, removeReference, scheduleApply } from '../../services/scanner';
import { useApp } from '../../services/state';
import { art, Btn, cardStyle, DashLine, HeadCard, Link, P, Paper, useContentWidth } from '../../ui/kit';
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
  const [kids, setKids] = useState<DB.Kid[]>([{ key: '', name: '' }]);
  const [child, setChild] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 正在加照片的孩子
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setRefs(await DB.listRefs());
    setKids(await DB.getKids());
    setChild((await DB.getSettings()).childName || '');
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [version, reload]));
  const cols = w > 560 ? 5 : 3;
  const gap = 12;
  const size = Math.floor((w - 28 - 2 * t.border - (cols - 1) * gap) / cols);
  const goodOf = (key: string) => refs.filter((r) => r.person === key && (r.status === 'ok' || r.status === 'anchor' || r.status === 'multi')).length;
  const nameOf = (k: DB.Kid) => k.name || child || tr('refs.myChild');
  const ring: Record<Look, string> = {
    ok: t.id === 'starry' ? '#8FD9B6' : t.id === 'candy' ? '#7CC6FF' : t.id === 'minimal' ? t.c.yes : '#93B391',
    mid: '#D5A363', bad: '#DC9691', wait: t.c.line,
  };
  const text: Record<Look, string> = { ok: t.c.yes, mid: t.c.tan, bad: t.c.noDeep, wait: t.c.muted };

  const add = async (person: string) => {
    setBusy(person);
    try { if (await pickAndAddRefs(setMsg, person)) scheduleApply(); } catch (e: any) { Alert.alert(tr('common.addFailed'), String(e?.message || e)); }
    finally { setBusy(null); setRefs(await DB.listRefs()); }
  };
  const del = (r: Ref) => Alert.alert(tr('refs.delTitle'), tr('refs.delBody'), [
    { text: tr('common.cancel'), style: 'cancel' },
    { text: tr('refs.del'), style: 'destructive', onPress: async () => { await removeReference(r.id, r.uri, r.person); setRefs(await DB.listRefs()); scheduleApply(); } },
  ]);
  const addKid = async () => {
    if (!newName.trim()) return;
    // 第一個孩子還沒取名字：先幫他取（不然兩個孩子會分不出來）
    if (kids.length === 1 && !kids[0].name) await DB.renameKid('', child || tr('refs.myChild'));
    await DB.addKid(newName);
    setNewName(''); setAdding(false);
    reload();
  };
  const dropKid = (k: DB.Kid) => Alert.alert(tr('refs.removeKidTitle', { name: nameOf(k) }), tr('refs.removeKidBody'), [
    { text: tr('common.cancel'), style: 'cancel' },
    { text: tr('refs.removeKid'), style: 'destructive', onPress: async () => { await removeKid(k.key); await reload(); scheduleApply(); } },
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

        {kids.map((k) => {
          const good = goodOf(k.key);
          const mine = refs.filter((r) => r.person === k.key);
          return (
            <View key={k.key} style={[cardStyle(t), s.person]}>
              <View style={s.ph}>
                {renaming === k.key ? (
                  <TextInput autoFocus defaultValue={nameOf(k)} maxLength={12} style={s.nameInput} returnKeyType="done"
                    onSubmitEditing={async (e) => { await DB.renameKid(k.key, e.nativeEvent.text || nameOf(k)); setRenaming(null); reload(); }}
                    onBlur={() => setRenaming(null)} accessibilityLabel={tr('refs.rename')} />
                ) : (
                  <Text style={s.phTitle}>{nameOf(k)}</Text>
                )}
                <Text style={[s.phSub, { color: good >= 5 ? t.c.yes : t.c.tan }]}>{good >= 5 ? tr('refs.good', { n: good }) : tr('refs.needMore', { n: good })}</Text>
                <View style={{ flex: 1 }} />
                {kids.length > 1 || k.name ? <Link title={tr('refs.rename')} onPress={() => setRenaming(k.key)} style={{ fontSize: 13 }} /> : null}
                {kids.length > 1 ? <Link title={tr('refs.removeKid')} color={t.c.muted} onPress={() => dropKid(k)} style={{ fontSize: 13 }} /> : null}
              </View>
              <DashLine style={{ marginBottom: 14 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, rowGap: 14 }}>
                {mine.map((r) => {
                  const [key, look] = STATUS[r.status] || (['refs.processing', 'wait'] as [TStrKey, Look]);
                  const label = tr(key);
                  return (
                    <Pressable key={r.id} onLongPress={() => del(r)} delayLongPress={350} style={{ width: size, alignItems: 'center', gap: 6 }} accessibilityHint={tr('refs.delHint')}>
                      <Image source={{ uri: r.uri }} style={[s.ref, { width: size, height: size, borderColor: ring[look] }, look === 'bad' && { opacity: 0.6 }, look === 'wait' && { opacity: 0.5 }]} contentFit="cover" />
                      <Text style={[s.refLabel, { color: text[look] }]} numberOfLines={2}>{label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable onPress={busy ? undefined : () => add(k.key)} style={{ width: size, alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel={tr('refs.addA11y')}>
                  <View style={[s.drop, { width: size, height: size }]}>
                    {busy === k.key ? <ActivityIndicator color={t.c.accent} /> : <><Text style={s.dropPlus}>+</Text><Text style={s.dropText} numberOfLines={2}>{tr('refs.add')}</Text></>}
                  </View>
                  <Text style={s.refLabel}>{tr('refs.fromPhone')}</Text>
                </Pressable>
              </View>
              {msg && busy === k.key ? <P muted style={{ fontSize: 13, textAlign: 'center', marginTop: 8 }}>{msg}</P> : null}
              {t.art === 'watercolor' ? <View pointerEvents="none" style={s.corner}><Image source={art.blooms} style={{ flex: 1 }} contentFit="contain" /></View> : null}
            </View>
          );
        })}

        {/* 兄弟姊妹 */}
        {adding ? (
          <View style={[cardStyle(t), s.person, { gap: 10 }]}>
            <Text style={s.phTitle}>{tr('refs.addKid')}</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder={tr('refs.kidNamePh')} placeholderTextColor={t.c.muted}
              maxLength={12} style={s.nameInput} autoFocus returnKeyType="done" onSubmitEditing={addKid} />
            <P muted style={{ fontSize: 12.5 }}>{tr('refs.addKidNote')}</P>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn small title={tr('refs.addKidBtn')} onPress={addKid} disabled={!newName.trim()} style={{ flex: 1 }} />
              <Btn small kind="ghost" title={tr('common.cancel')} onPress={() => { setAdding(false); setNewName(''); }} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Btn kind="ghost" title={tr('refs.addKid')} onPress={() => setAdding(true)} />
        )}

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
    nameInput: { ...t.round, flexGrow: 1, minWidth: 140, fontSize: 16, color: c.ink, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    ref: { borderRadius: 999, borderWidth: 4, backgroundColor: c.line, boxShadow: '0px 4px 12px rgba(99,70,40,0.2)' } as any,
    refLabel: { ...t.round, fontSize: 11, lineHeight: 15, textAlign: 'center', color: c.muted },
    drop: { borderRadius: 999, borderWidth: 2, borderStyle: 'dashed', borderColor: c.dash, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center', gap: 2 },
    dropPlus: { ...t.round, fontSize: 28, lineHeight: 30, color: c.accent },
    dropText: { ...t.round, fontSize: 11.5, color: c.muted, textAlign: 'center', paddingHorizontal: 6 },
    corner: { position: 'absolute', right: -6, bottom: -6, width: 120, height: 66, transform: [{ scaleX: -1 }], opacity: 0.75 },
  });
});
