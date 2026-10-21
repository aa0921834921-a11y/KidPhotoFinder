/**
 * 核對：家長自己抽查一個活動（老師的資料夾）。
 *   「沒找到孩子」：有人臉、但 App 判斷沒有孩子的照片 → 看到孩子就點一下（打勾）
 *   「已存」：已經存進相簿的照片 → 看到不是孩子的就點一下（打叉）
 * 按完成：打勾的會存進相簿、打叉的從相簿刪掉，App 也從這些答案學習。
 * 沒帶 folder：列出全部活動和「已核對／未核對」。
 */
import { Image } from 'expo-image';
import { Asset } from 'expo-media-library';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tr, useLang } from '../i18n';
import * as DB from '../services/db';
import { scheduleApply } from '../services/scanner';
import { useApp } from '../services/state';
import { FaceCard } from '../ui/FaceCard';
import { Btn, cardStyle, Empty, H1, Link, P, Paper, Seg, useContentWidth } from '../ui/kit';
import { makeStyles, useTheme, type Theme } from '../ui/theme';
import { usePreview } from '../ui/usePreview';

const day = (s: string) => (s && s.length >= 10 ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : '');
const titleOf = (folder: string) => folder.split('/').filter(Boolean).pop() || folder;

/** 選了哪張臉、哪個孩子 */
type Yes = { faceId: number; person: string };

function Tile({ p, size, mark, onPress }: { p: DB.CheckPhoto; size: number; mark: 'yes' | 'no' | null; onPress: () => void }) {
  const t = useTheme();
  const uri = usePreview(p.fileId, 384);
  const ring = mark === 'yes' ? t.c.yes : mark === 'no' ? t.c.noDeep : 'transparent';
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={mark === 'yes' ? tr('chk.isKid') : mark === 'no' ? tr('chk.notKid') : undefined}
      style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: t.c.line, borderWidth: 3, borderColor: ring }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
      {mark ? (
        <View style={{ position: 'absolute', right: 5, bottom: 5, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
          backgroundColor: mark === 'yes' ? t.c.yes : t.c.noDeep }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{mark === 'yes' ? '✓' : '✕'}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function List() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const version = useApp((x) => x.version);
  const [rows, setRows] = useState<DB.CheckFolder[] | null>(null);
  useFocusEffect(useCallback(() => { DB.checkFolders().then(setRows).catch(() => setRows([])); }, [version]));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Paper>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={back} /></View>
        <H1>{tr('chk.title')}</H1>
        <P muted>{tr('chk.sub')}</P>
        {rows === null ? <ActivityIndicator color={t.c.accent} style={{ marginTop: 30 }} /> : null}
        {rows && !rows.length ? <Empty title={tr('chk.empty')} /> : null}
        {(rows || []).map((r) => (
          <Pressable key={r.folder} onPress={() => router.push({ pathname: '/check', params: { folder: r.folder } })}
            style={({ pressed }) => [cardStyle(t), s.row, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{titleOf(r.folder)}</Text>
              <Text style={s.rowSub}>{tr('chk.row', { when: day(r.last), total: r.total, saved: r.saved })}</Text>
            </View>
            <Text style={[s.badge, r.checkedAt ? { backgroundColor: t.c.yesWash, color: t.c.yes } : { backgroundColor: '#fbecd2', color: '#7a5410' }]}>
              {r.checkedAt ? tr('chk.done') : tr('chk.todo')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Paper>
  );
}

function Detail({ folder }: { folder: string }) {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const w = useContentWidth(16);
  const [data, setData] = useState<{ saved: DB.CheckPhoto[]; missed: DB.CheckPhoto[] } | null>(null);
  const [stat, setStat] = useState<DB.CheckFolder | null>(null);
  const [kids, setKids] = useState<DB.Kid[]>([]);
  const [tab, setTab] = useState<'missed' | 'saved'>('missed');
  const [yes, setYes] = useState<Record<string, Yes>>({});
  const [no, setNo] = useState<Record<string, true>>({});
  const [pick, setPick] = useState<DB.CheckPhoto | null>(null);
  const [pickFace, setPickFace] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  useFocusEffect(useCallback(() => {
    DB.checkFolder(folder).then(setData).catch(() => setData({ saved: [], missed: [] }));
    DB.checkFolders().then((all) => setStat(all.find((x) => x.folder === folder) || null)).catch(() => {});
    DB.getKids().then(setKids).catch(() => {});
  }, [folder]));

  const cols = w > 560 ? 5 : 3;
  const gap = 8;
  const size = Math.floor((w - (cols - 1) * gap) / cols);
  const nYes = Object.keys(yes).length, nNo = Object.keys(no).length;
  const nSaved = (data?.saved.length ?? 0) + nYes - nNo;
  const nMissed = (data?.missed.length ?? 0) - nYes;
  const list = tab === 'missed' ? data?.missed : data?.saved;
  const kidName = (k: DB.Kid) => k.name || tr('refs.myChild');
  const parts = useMemo(() => [nYes ? tr('chk.found', { n: nYes }) : '', nNo ? tr('chk.wrong', { n: nNo }) : ''].filter(Boolean), [nYes, nNo]);

  const choose = (faceId: number, person: string) => {
    if (!pick) return;
    setYes((m) => ({ ...m, [pick.fileId]: { faceId, person } }));
    setPick(null); setPickFace(null);
  };
  const tapMissed = (p: DB.CheckPhoto) => {
    if (yes[p.fileId]) { setYes(({ [p.fileId]: _, ...rest }) => rest); return; }
    // 只有一張臉、一個孩子：直接打勾；不然問是哪張臉（和哪個孩子）
    if (p.faces.length === 1 && kids.length < 2) { setYes((m) => ({ ...m, [p.fileId]: { faceId: p.faces[0], person: kids[0]?.key || '' } })); return; }
    setPick(p); setPickFace(p.faces.length === 1 ? p.faces[0] : null);
  };
  const tapSaved = (p: DB.CheckPhoto) => setNo((m) => {
    if (m[p.fileId]) { const { [p.fileId]: _, ...rest } = m; return rest; }
    return { ...m, [p.fileId]: true };
  });

  const finish = async () => {
    if (!data) return;
    setBusy(true);
    try {
      for (const y of Object.values(yes)) await DB.setLabel(y.faceId, 1, y.person);
      const wrong = data.saved.filter((p) => no[p.fileId]);
      for (const p of wrong) {
        const face = p.faceId ?? p.faces[0];
        if (face != null) await DB.setLabel(face, -1, p.person);
      }
      if (wrong.length) {
        // 手機相簿裡存錯的那幾張也刪掉（Android 會跳出系統視窗問一次）
        const assets = wrong.map((p) => p.assetId).filter((x): x is string => !!x);
        try { if (assets.length) await Asset.delete(assets.map((id) => new Asset(id))); } catch {}
        await DB.unsave(wrong.map((p) => p.fileId));
      }
      await DB.setChecked(folder);
      if (nYes || nNo) scheduleApply();
      setDoneMsg(tr('chk.doneMsg'));
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/check')), 1400);
    } finally { setBusy(false); }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/check'));
  const pickKids = kids.length > 1 ? kids : [];

  return (
    <Paper>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: 150 }]} showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={back} /></View>
        <H1>{titleOf(folder)}</H1>

        <View style={[cardStyle(t), s.stats]}>
          {([[stat?.total ?? '–', tr('chk.uploaded'), t.c.ink], [nSaved, tr('chk.saved'), t.c.yes],
            [stat?.review ?? 0, tr('chk.review'), t.c.tan], [Math.max(0, nMissed), tr('chk.missed'), t.c.ink]] as const).map(([n, l, c]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text style={[s.statN, { color: c }]}>{String(n)}</Text>
              <Text style={s.statL}>{l}</Text>
            </View>
          ))}
        </View>
        {stat?.review ? <Link title={tr('chk.reviewLeft', { n: stat.review })} onPress={() => router.navigate('/review')} style={{ fontSize: 13 }} /> : null}

        <Seg value={tab} onChange={setTab} items={[
          { k: 'missed', t: tr('chk.tabMissed', { n: Math.max(0, nMissed) }) },
          { k: 'saved', t: tr('chk.tabSaved', { n: nSaved }) },
        ]} />
        <P muted style={{ fontSize: 13 }}>{tab === 'missed' ? tr('chk.hintMissed') : tr('chk.hintSaved')}</P>

        {data === null ? <ActivityIndicator color={t.c.accent} style={{ marginTop: 30 }} /> : null}
        {list && !list.length ? <P muted style={{ textAlign: 'center', marginTop: 20 }}>{tab === 'missed' ? tr('chk.emptyMissed') : tr('chk.emptySaved')}</P> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {(list || []).map((p) => (
            <Tile key={p.fileId} p={p} size={size}
              mark={tab === 'missed' ? (yes[p.fileId] ? 'yes' : null) : (no[p.fileId] ? 'no' : null)}
              onPress={() => (tab === 'missed' ? tapMissed(p) : tapSaved(p))} />
          ))}
        </View>
      </ScrollView>

      <View style={[s.foot, { backgroundColor: t.c.card, borderColor: t.c.line }]}>
        <Text style={s.footText}>{doneMsg || (parts.length ? parts.join(tr('ntf.and')) : tr('chk.noIssue'))}</Text>
        <Btn busy={busy} disabled={!data || !!doneMsg} title={parts.length ? tr('chk.finish') : tr('chk.allGood')} onPress={finish} />
      </View>

      <Modal visible={!!pick} transparent animationType="fade" onRequestClose={() => setPick(null)}>
        <Pressable style={s.dim} onPress={() => setPick(null)}>
          <Pressable style={[cardStyle(t), s.sheet]} onPress={() => {}}>
            <Text style={s.sheetTitle}>{tr('chk.pickFace')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {(pick?.faces || []).slice(0, 12).map((f) => (
                <Pressable key={f} onPress={() => (pickKids.length ? setPickFace(f) : choose(f, kids[0]?.key || ''))}
                  style={{ borderWidth: 3, borderRadius: 12, borderColor: pickFace === f ? t.c.yes : 'transparent' }} accessibilityRole="button">
                  <FaceCard faceId={f} size={72} radius={9} />
                </Pressable>
              ))}
            </View>
            {pickKids.length && pickFace != null ? (
              <>
                <Text style={[s.sheetTitle, { marginTop: 6 }]}>{tr('chk.pickKid')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {pickKids.map((k) => <Btn key={k.key} small title={kidName(k)} onPress={() => choose(pickFace, k.key)} />)}
                </View>
              </>
            ) : null}
            <Btn small kind="ghost" title={tr('common.cancel')} onPress={() => setPick(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Paper>
  );
}

export default function Check() {
  const { folder } = useLocalSearchParams<{ folder?: string }>();
  return folder ? <Detail folder={folder} /> : <List />;
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  return StyleSheet.create({
    scroll: { padding: 16, paddingTop: 14, paddingBottom: 40, gap: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    rowTitle: { ...t.title, fontSize: 17, color: c.ink },
    rowSub: { ...t.round, fontSize: 12.5, color: c.muted },
    badge: { ...t.round, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, overflow: 'hidden' },
    stats: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 6 },
    statN: { ...t.title, fontSize: 20 },
    statL: { ...t.round, fontSize: 12, color: c.muted },
    foot: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 22, gap: 8, borderTopWidth: 1 },
    footText: { ...t.round, fontSize: 13, color: c.muted, textAlign: 'center' },
    dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
    sheet: { padding: 18, gap: 12 },
    sheetTitle: { ...t.title, fontSize: 17, color: c.ink, textAlign: 'center' },
  });
});
