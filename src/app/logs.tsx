/**
 * 執行紀錄：
 * - 最上面：自動檢查的狀態（最近一次是什麼時候、有沒有找到新照片、今天檢查了幾次）；
 *   太久沒有自動檢查時提醒（多半是手機的省電設定擋住了）
 * - 下面：每一次整理。沒有新照片的自動檢查合併成一行，才看得出「有在檢查」又不會洗版
 */
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FG from '../../modules/kpf-foreground';
import { sp, tr, useLang } from '../i18n';
import { staleAfterMin } from '../services/background';
import * as DB from '../services/db';
import { checkEvery } from '../services/notifyPrefs';
import { useApp } from '../services/state';
import { Btn, Card, cardStyle, H1, Link, P, Paper, T } from '../ui/kit';
import { makeStyles, useTheme, type Theme } from '../ui/theme';

/** 一個 start 超過 15 分鐘還沒有結果：當作被系統停掉了 */
const KILLED_AFTER = 15 * 60e3;

type Item =
  | { k: 'run'; at: string; run: DB.RunRow }
  | { k: 'idle'; at: string; from: string; to: string; n: number }
  | { k: 'killed' | 'failed'; at: string };

const ms = (t: string) => DB.parseLocal(t).getTime();
const hm = (t: string) => t.slice(11, 16);
function when(t: string): string {
  const d = t.slice(0, 10), today = DB.now().slice(0, 10);
  const y = DB.localTime(new Date(Date.now() - 86400e3)).slice(0, 10);
  if (d === today) return tr('logs.today', { t: hm(t) });
  if (d === y) return tr('logs.yesterday', { t: hm(t) });
  return `${t.slice(5, 10).replace('-', '/')} ${hm(t)}`;
}

/** 整理（有看照片的）和自動檢查的足跡排在一起：新的在上面，連續「沒有新照片」的合成一行 */
function timeline(runs: DB.RunRow[], bg: DB.BgEntry[]): Item[] {
  const raw: ({ at: string } & ({ k: 'run'; run: DB.RunRow } | { k: 'bg'; e: DB.BgEntry }))[] = [
    ...runs.map((run) => ({ k: 'run' as const, at: run.started || run.finished, run })),
    // 有看照片的自動檢查在 runs 裡已經有一筆，這裡不重複
    ...bg.filter((e) => !(e.r === 'scan' && (e.n || 0) > 0)).map((e) => ({ k: 'bg' as const, at: e.at, e })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const out: Item[] = [];
  for (const x of raw) {
    if (x.k === 'run') { out.push({ k: 'run', at: x.at, run: x.run }); continue; }
    const e = x.e;
    if (e.r === 'start') {
      if (Date.now() - ms(e.at) > KILLED_AFTER) out.push({ k: 'killed', at: e.at });
      continue; // 還在跑的那一次：最上面的狀態卡會顯示
    }
    if (e.r === 'error') { out.push({ k: 'failed', at: e.at }); continue; }
    // idle、busy、off、看了 0 張：合成一行（新的在上面，所以 from 一直往前推）
    const prev = out[out.length - 1];
    if (prev && prev.k === 'idle') { prev.from = e.at; prev.n++; } else out.push({ k: 'idle', at: e.at, from: e.at, to: e.at, n: 1 });
  }
  return out;
}

export default function Logs() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const version = useApp((x) => x.version);
  const [runs, setRuns] = useState<DB.RunRow[]>([]);
  const [bg, setBg] = useState<DB.BgEntry[]>([]);
  const [st, setSt] = useState<DB.Settings | null>(null);
  useFocusEffect(useCallback(() => {
    DB.lastRuns(60).then(setRuns).catch(() => {});
    DB.bgLog().then(setBg).catch(() => {});
    DB.getSettings().then(setSt).catch(() => {});
  }, [version]));

  const items = timeline(runs, bg);
  const done = bg.filter((e) => e.r !== 'start');
  const lastDone = done[done.length - 1];
  const lastAny = bg[bg.length - 1];
  const running = lastAny?.r === 'start' && Date.now() - ms(lastAny.at) < KILLED_AFTER;
  const today = DB.now().slice(0, 10);
  const todayN = bg.filter((e) => e.at.slice(0, 10) === today && e.r !== 'off').length;
  const every = checkEvery(st?.freq);
  const lastAt = lastAny ? ms(lastAny.at) : 0;
  const staleH = st?.autoDaily && lastAt && Date.now() - lastAt > staleAfterMin(every) * 60e3 ? Math.floor((Date.now() - lastAt) / 3600e3) : 0;
  const what = (e: DB.BgEntry) => (e.r === 'idle' ? tr('logs.rIdle') : e.r === 'scan' ? (e.n ? tr('logs.rScan', { n: e.n }) : tr('logs.rIdle'))
    : e.r === 'busy' ? tr('logs.rBusy') : e.r === 'off' ? tr('logs.rOff') : e.r === 'error' ? tr('logs.rError') : tr('logs.rKilled'));
  const battery = () => Alert.alert(tr('home.batteryTitle'), tr('home.batteryBody'), [
    { text: tr('common.cancel'), style: 'cancel' }, { text: tr('home.openSettings'), onPress: () => FG.openAppSettings() },
  ]);

  return (
    <Paper>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /></View>
        <H1>{tr('logs.title')}</H1>

        {/* 自動檢查的狀態 */}
        <View style={[cardStyle(t), s.status]}>
          <View style={s.statusHead}>
            <View style={[s.dot, { backgroundColor: !st?.autoDaily ? t.c.skip : staleH ? t.c.no : t.c.yes }]} />
            <Text style={s.statusTitle}>{tr('logs.autoTitle')}</Text>
            {st?.autoDaily && todayN ? <Text style={s.statusN}>{tr('logs.todayN', { n: todayN })}</Text> : null}
          </View>
          {!st?.autoDaily ? <P style={{ fontSize: 13.5 }}>{tr('logs.offBody')}</P>
            : running ? <P style={{ fontSize: 13.5 }}>{tr('logs.lastCheck', { when: when(lastAny.at), what: tr('logs.rRunning') })}</P>
              : lastDone ? <P style={{ fontSize: 13.5 }}>{tr('logs.lastCheck', { when: when(lastDone.at), what: what(lastDone) })}</P>
                : <P muted style={{ fontSize: 13.5 }}>{tr('logs.noAuto')}</P>}
          {staleH ? (
            <View style={s.warn}>
              <Text style={s.warnTitle}>{tr('logs.staleTitle', { h: staleH })}</Text>
              <Text style={s.warnBody}>{tr('logs.staleBody')}</Text>
              {Platform.OS === 'android' && !FG.batteryUnrestricted()
                ? <Btn small title={tr('home.openSettings')} onPress={battery} style={{ alignSelf: 'flex-start', marginTop: 4 }} /> : null}
            </View>
          ) : null}
          <Text style={s.why}>{tr('logs.why')}</Text>
        </View>

        {!items.length ? <P muted>{tr('logs.empty')}</P> : null}
        {items.map((it, i) => {
          if (it.k === 'idle') {
            return (
              <View key={`i${i}`} style={s.idle}>
                <Text style={s.idleText}>{tr('logs.idleGroup', { n: it.n, from: when(it.from), to: hm(it.to) })}</Text>
              </View>
            );
          }
          if (it.k !== 'run') {
            return (
              <View key={`w${i}`} style={[s.idle, s.idleWarn]}>
                <Text style={[s.idleText, { color: t.c.noDeep }]}>{when(it.at)}{sp()}{it.k === 'killed' ? tr('logs.killed') : tr('logs.failed')}</Text>
              </View>
            );
          }
          const r = it.run;
          return (
            <Card key={`r${i}`} style={{ padding: 14, gap: 2 }}>
              <T>{when(r.finished)}{sp()}{r.mode === 'background' ? tr('logs.auto') : tr('logs.manual')}</T>
              <P style={{ fontSize: 13 }}>{tr('logs.line', { scanned: r.scanned, saved: r.saved, review: r.review, errors: r.errors })}</P>
              {r.left_n != null && r.left_n > 0 ? <P muted style={{ fontSize: 12.5 }}>{tr('logs.left', { n: r.left_n })}</P>
                : r.left_n === 0 && r.scanned > 0 ? <P muted style={{ fontSize: 12.5 }}>{tr('logs.allDone')}</P> : null}
              {r.note && !(r.left_n != null && r.left_n > 0) ? <P muted style={{ fontSize: 12 }}>{r.note === 'stopped' || r.note === '中途停止' ? tr('logs.stopped') : r.note}</P> : null}
            </Card>
          );
        })}
      </ScrollView>
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  return StyleSheet.create({
    scroll: { padding: 18, gap: 10, paddingBottom: 40 },
    status: { padding: 16, gap: 6 },
    statusHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    statusTitle: { ...t.title, fontSize: 17, color: c.ink, flex: 1 },
    statusN: { ...t.round, fontSize: 12.5, color: c.muted },
    warn: { marginTop: 6, padding: 12, borderRadius: 12, backgroundColor: c.note, borderWidth: 1, borderColor: c.noteLine, gap: 4 },
    warnTitle: { ...t.title, fontSize: 15, color: c.noDeep },
    warnBody: { ...t.round, fontSize: 13, lineHeight: 20, color: c.ink2 },
    why: { ...t.round, fontSize: 12, lineHeight: 18, color: c.muted, marginTop: 4 },
    idle: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: c.dash, alignSelf: 'flex-start' },
    idleWarn: { borderColor: c.no },
    idleText: { ...t.round, fontSize: 12.5, color: c.muted },
  });
});
