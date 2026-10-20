/**
 * 新照片：點「新照片」通知（或首頁的小鈴鐺）打開。
 * 最上面是這次的活動，接著是孩子的臉最清楚的一張（拍立得），下面是其他照片；
 * 可以一鍵傳到 LINE 家族群，或用其他 App 傳給家人。
 */
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance, type ViewStyle } from 'react-native';
import * as FG from '../../modules/kpf-foreground';
import { groupEvents, heroFirst, type PhotoEvent } from '../core/events';
import { tr, useLang } from '../i18n';
import * as DB from '../services/db';
import { LINE_PKG, openBatch } from '../services/notices';
import { kidName } from '../services/notifyPrefs';
import { useApp } from '../services/state';
import { Btn, cardStyle, DashLine, Empty, H1, Icon, Link, Paper, Tape, useContentWidth } from '../ui/kit';
import { makeStyles, useTheme, type Theme } from '../ui/theme';
import { usePreview } from '../ui/usePreview';

type Row = DB.PhotoInfo;

/** 照片：Android 直接用手機相簿裡的那張（不用網路）；讀不到時改用雲端硬碟的縮圖 */
function usePhoto(r: Row | null, size: number): { uri: string | null; onError: () => void } {
  const [bad, setBad] = useState(false);
  const local = !bad && r && Platform.OS === 'android' && r.asset_id?.startsWith('content://') ? r.asset_id : null;
  const preview = usePreview(r && !local ? r.file_id : null, size);
  return { uri: local || preview, onError: () => setBad(true) };
}

/** 孩子的臉在照片裡的位置（讓裁切時臉在中間） */
const focus = (r: Row) => (r.fx != null && r.fy != null && r.fw && r.fh && r.w && r.h
  ? { left: `${Math.round(((r.fx + r.fw / 2) / r.w) * 100)}%`, top: `${Math.round(((r.fy + r.fh * 0.6) / r.h) * 100)}%` }
  : { left: '50%', top: '40%' }) as { left: `${number}%`; top: `${number}%` };

const openPhoto = (r: Row) => router.push({ pathname: '/viewer', params: { id: r.file_id, list: 'saved' } });

/** 最清楚的一張：拍立得（水彩／糖果／故事書主題有紙膠帶、會歪一點） */
function Hero({ r, size }: { r: Row; size: number }) {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const { uri, onError } = usePhoto(r, 1024);
  const plain = t.id === 'minimal' || t.id === 'starry';
  return (
    <Pressable onPress={() => openPhoto(r)} accessibilityRole="imagebutton" accessibilityLabel={tr('new.best')}
      style={({ pressed }) => [s.hero, plain ? s.heroPlain : { backgroundColor: t.c.pol }, t.tilt && { transform: [{ rotate: '-2deg' }] },
        pressed && { opacity: 0.9 }]}>
      {!plain ? <Tape i={0} w={76} h={20} style={{ top: -9 }} /> : null}
      <View style={{ width: size, height: size, backgroundColor: t.c.line, overflow: 'hidden', borderRadius: plain ? 14 : 0 }}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={focus(r)} transition={250} onError={onError} /> : null}
      </View>
      <Text style={[s.heroCap, plain && { position: 'relative', bottom: 0, marginTop: 10, color: t.c.muted }]} numberOfLines={1}>{tr('new.best')}</Text>
    </Pressable>
  );
}

const TILTS = [2, -1.5, -2, 1.5];

/** 其他照片：小拍立得 */
function Small({ r, size, i }: { r: Row; size: number; i: number }) {
  const t = useTheme();
  const { uri, onError } = usePhoto(r, 512);
  const plain = t.id === 'minimal' || t.id === 'starry';
  return (
    <Pressable onPress={() => openPhoto(r)} accessibilityRole="imagebutton" accessibilityLabel={tr('art.view')}
      style={({ pressed }) => [
        plain ? { borderRadius: 12, overflow: 'hidden' } : { padding: 6, paddingBottom: 18, borderRadius: 2, backgroundColor: t.c.pol, boxShadow: '0px 6px 12px rgba(98,70,45,0.18)' } as ViewStyle,
        t.tilt && { transform: [{ rotate: `${TILTS[i % 4]}deg` }] }, pressed && { opacity: 0.85 }]}>
      <View style={{ width: size, height: size, backgroundColor: t.c.line, overflow: 'hidden' }}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={focus(r)} transition={200} onError={onError} /> : null}
        {r.kind === 'video' ? <Text style={{ position: 'absolute', right: 6, bottom: 4, color: '#fff', fontSize: 14 }}>▶</Text> : null}
      </View>
    </Pressable>
  );
}

/** 「也有新照片」：別的活動 */
function OtherEvent({ ev, onPress }: { ev: PhotoEvent<Row>; onPress: () => void }) {
  const t = useTheme();
  const s = useStyles();
  const { uri, onError } = usePhoto(heroFirst(ev.photos)[0], 256);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cardStyle(t), s.other, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <View style={s.otherPic}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" onError={onError} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.otherSmall}>{tr('new.alsoNew')}</Text>
        <Text style={s.otherTitle} numberOfLines={1}>{tr('new.eventN', { event: ev.name, n: ev.photos.length })}</Text>
      </View>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

/** 「今天 10:31」「昨天 22:24」「10/18 09:12」 */
function whenText(t: string) {
  const d = t.slice(0, 10), hm = t.slice(11, 16);
  const today = DB.now().slice(0, 10);
  const y = DB.localTime(new Date(Date.now() - 864e5)).slice(0, 10);
  return d === today ? `${tr('new.today')} ${hm}` : d === y ? `${tr('new.yesterday')} ${hm}` : `${t.slice(5, 7)}/${t.slice(8, 10)} ${hm}`;
}

export default function NewPhotos() {
  const { nid, share, test } = useLocalSearchParams<{ nid?: string; share?: string; test?: string }>();
  const t = useTheme();
  const s = useStyles();
  useLang();
  const review = useApp((x) => x.counts.review);
  const w = useContentWidth(18);
  const scroll = useRef<ScrollViewInstance>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [recent, setRecent] = useState(false); // 沒有新的一批：顯示最近存的照片
  const [stats, setStats] = useState<Map<string, { n: number; last: string }>>(new Map());
  const [st, setSt] = useState<DB.Settings | null>(null);
  const [kids, setKids] = useState<DB.Kid[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [hasLine, setHasLine] = useState(false);
  const shared = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (nid) FG.cancelNotice(Number(nid));
      const settings = await DB.getSettings();
      let ids = test ? [] : await openBatch();
      const fallback = !ids.length;
      if (fallback) ids = (await DB.recentSaved(24)).map((r) => r.file_id);
      const info = await DB.photosInfo(ids);
      let up = new Map<string, { n: number; last: string }>();
      if (!fallback && info.length) {
        const first = info.map((r) => r.first_seen || r.at).sort()[0];
        const since = DB.localTime(new Date(DB.parseLocal(first).getTime() - 2 * 3600e3));
        const list = await DB.uploadedSince([...new Set(info.map((r) => r.folder))], since).catch(() => []);
        up = new Map(list.map((x) => [x.folder, { n: x.n, last: x.last }]));
      }
      if (!alive) return;
      setSt(settings);
      setKids(await DB.getKids());
      setRecent(fallback);
      setStats(up);
      setRows(info);
      setHasLine(FG.isInstalled(LINE_PKG));
    })().catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [nid, test]);

  const events = useMemo(() => groupEvents(rows || []), [rows]);
  const ev = events.find((e) => e.folder === sel) || events[0];
  const photos = ev ? heroFirst(ev.photos) : [];
  const album = st?.albumName || '童年拾光';

  /** 分享照片（pkg 有填就直接交給那個 App，例如 LINE） */
  const doShare = (pkg: string | null, list: Row[]) => {
    const uris = list.map((r) => r.asset_id).filter((u) => !!u).slice(0, 30);
    if (!uris.length) return;
    if (!FG.share({ uris, pkg, title: tr('new.shareTitle') })) Alert.alert(tr('new.toFamily'), tr('new.shareFromAlbum', { album }));
  };

  // 從通知上的「傳給家人」打開：照片讀好就直接打開分享
  useEffect(() => {
    if (share !== '1' || shared.current || !rows?.length) return;
    const id = setTimeout(() => { shared.current = true; doShare(null, rows); }, 450);
    return () => clearTimeout(id);
  }, [rows, share]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const heroSize = Math.min(260, w - 60);
  const cols = w > 560 ? 3 : 2;
  const plain = t.id === 'minimal' || t.id === 'starry';
  const cell = Math.floor((w - 28 - (cols - 1) * 16) / cols) - (plain ? 0 : 12);
  const stat = ev ? stats.get(ev.folder) : undefined;

  return (
    <Paper>
      <ScrollView ref={scroll} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={back} /></View>
        <H1>{recent ? tr('new.recent') : tr('new.title')}</H1>

        {rows === null ? <ActivityIndicator color={t.c.accent} style={{ marginTop: 30 }} /> : null}
        {rows && !rows.length ? <Empty title={tr('new.emptyTitle')} body={tr('new.emptyBody')} /> : null}

        {ev ? (
          <>
            {/* 這次的活動 */}
            <View style={[cardStyle(t), s.event]}>
              <View style={s.evRow}>
                {t.id !== 'minimal' ? <Text style={s.evFlower}>{t.id === 'starry' ? '✦' : '✿'}</Text> : null}
                <Text style={s.evTitle}>{ev.name}</Text>
              </View>
              {stat ? <Text style={s.evSub}>{tr('new.uploaded', { when: whenText(stat.last), n: Math.max(stat.n, ev.photos.length) })}</Text> : null}
              <View style={s.chip}><Text style={s.chipText}>{tr('new.found', { who: st ? kidName(st, kids, ev.photos.map((p) => p.person || '')) : tr('ntf.kid'), n: ev.photos.length })}</Text></View>
            </View>

            {/* 最清楚的一張 */}
            <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
              <Hero key={photos[0].file_id} r={photos[0]} size={heroSize} />
            </View>

            {/* 其他照片 */}
            {photos.length > 1 ? (
              <View style={[s.grid, { gap: plain ? 10 : 16, rowGap: plain ? 10 : 20 }]}>
                {photos.slice(1).map((r, i) => <Small key={r.file_id} r={r} size={cell} i={i} />)}
              </View>
            ) : null}

            <View style={s.savedRow}>
              <Icon name="check" size={20} color={t.c.yes} />
              <Text style={s.savedText}>{tr('new.saved', { n: ev.photos.length, album })}</Text>
            </View>

            <View style={{ gap: 10 }}>
              {hasLine ? <Btn title={tr('new.toLine')} onPress={() => doShare(LINE_PKG, photos)} /> : null}
              <Btn kind={hasLine ? 'ghost' : 'primary'} title={hasLine ? tr('new.otherApps') : tr('new.toFamily')} onPress={() => doShare(null, photos)} />
              {review > 0 ? (
                <View style={{ alignItems: 'center' }}><Link title={tr('new.review', { n: review })} onPress={() => router.navigate('/review')} /></View>
              ) : null}
            </View>

            {/* 別的活動 */}
            {events.length > 1 ? (
              <>
                <DashLine style={{ marginVertical: 4 }} />
                {events.filter((e) => e !== ev).map((e) => (
                  <OtherEvent key={e.folder} ev={e} onPress={() => { setSel(e.folder); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
                ))}
              </>
            ) : null}
          </>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 6 }}>
          <Link title={tr('new.settings')} onPress={() => router.push('/notify')} />
          <Link title={`${tr('home.logs')} ›`} color={t.c.muted} onPress={() => router.push('/logs')} />
        </View>
      </ScrollView>
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 48, gap: 14 },
  event: { padding: 18, paddingBottom: 16, gap: 8 },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  evFlower: { fontSize: 22, color: t.c.accent },
  evTitle: { ...t.title, flex: 1, fontSize: 24, lineHeight: 31, color: t.c.headTitle },
  evSub: { ...t.round, fontSize: 14, color: t.c.muted },
  chip: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.accentWash },
  chipText: { ...t.round, fontSize: 15, color: t.c.accentDeep },
  hero: { padding: 10, paddingBottom: 40, borderRadius: 2, boxShadow: '0px 10px 22px rgba(98,70,45,0.22)' } as ViewStyle,
  heroPlain: { padding: 0, paddingBottom: 0, borderRadius: 14, boxShadow: 'none', alignItems: 'center' } as ViewStyle,
  heroCap: { ...t.round, position: 'absolute', left: 0, right: 0, bottom: 11, textAlign: 'center', fontSize: 15, color: t.c.polCap },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingHorizontal: 4, paddingTop: 6 },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  savedText: { ...t.round, fontSize: 15, color: t.c.yes, flexShrink: 1 },
  other: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 14 },
  otherPic: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: t.c.line },
  otherSmall: { ...t.round, fontSize: 12.5, color: t.c.muted },
  otherTitle: { ...t.round, fontSize: 16, color: t.c.ink },
  chev: { ...t.round, fontSize: 20, color: t.c.accentDeep },
}));
