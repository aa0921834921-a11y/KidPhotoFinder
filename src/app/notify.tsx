/**
 * 新照片通知的設定：通知的樣子（預覽）、開關、孩子的小名、通知時段、多久看一次老師的資料夾、
 * 電池設定提醒，還有「傳一則範例通知看看」。
 */
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import * as FG from '../../modules/kpf-foreground';
import { eventName } from '../core/events';
import { tr, useLang } from '../i18n';
import { syncSchedule } from '../services/background';
import * as DB from '../services/db';
import { askNotificationPermission, sendTest } from '../services/notices';
import { dayHours, EVERY_OPTIONS, everyWord, hoursText, kidName } from '../services/notifyPrefs';
import { Logo } from '../ui/art';
import { Btn, Card, cardStyle, DashLine, H1, Link, P, Paper, SectionTitle, Toggle } from '../ui/kit';
import { makeStyles, SYSTEM_FONT, useTheme, type Theme } from '../ui/theme';
import { usePreview } from '../ui/usePreview';

const FROM = [6, 7, 8, 9];
const TO = [20, 21, 22, 23];

/** 一列開關 */
function SwitchRow({ title, sub, value, onChange, first }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  const s = useStyles();
  return (
    <>
      {!first ? <DashLine /> : null}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>{title}</Text>
          {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
        </View>
        <Toggle value={value} onValueChange={onChange} label={title} />
      </View>
    </>
  );
}

/** 通知的樣子：用最近存的一張照片做一則假的通知 */
function Preview({ st, photo }: { st: DB.Settings; photo: DB.PhotoInfo | null }) {
  const s = useStyles();
  const [bad, setBad] = useState(false);
  const local = !bad && photo && Platform.OS === 'android' && photo.asset_id?.startsWith('content://') ? photo.asset_id : null;
  const preview = usePreview(photo && !local ? photo.file_id : null, 768);
  const uri = local || preview;
  const who = kidName(st);
  const event = photo ? eventName(photo.folder) : tr('nset.sampleEvent');
  const pos = photo?.fx != null && photo.fy != null && photo.fw && photo.fh && photo.w && photo.h
    ? { left: `${Math.round(((photo.fx + photo.fw / 2) / photo.w) * 100)}%`, top: `${Math.round(((photo.fy + photo.fh * 0.6) / photo.h) * 100)}%` }
    : { left: '50%', top: '40%' };
  return (
    <View style={s.ntf}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={s.ntfIcon}><Logo size={15} /></View>
        <Text style={s.ntfApp}>童年拾光 · {tr('nset.now')}</Text>
      </View>
      <Text style={s.ntfTitle}>{tr('ntf.title1', { event, who, n: 5 })}</Text>
      <Text style={s.ntfBody}>{tr('ntf.body1', { total: 32 })}</Text>
      {st.notifyPhoto ? (
        <View style={s.ntfPic}>
          {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={pos as never} onError={() => setBad(true)} /> : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Logo size={44} /></View>
          )}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 18, marginTop: 2 }}>
        <Text style={s.ntfAct}>{tr('ntf.view')}</Text>
        <Text style={s.ntfAct}>{tr('ntf.share')}</Text>
      </View>
    </View>
  );
}

export default function NotifySettings() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const [st, setSt] = useState<DB.Settings | null>(null);
  const [photo, setPhoto] = useState<DB.PhotoInfo | null>(null);
  const [name, setName] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [battery, setBattery] = useState(true);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);

  const checkSystem = useCallback(() => {
    setBlocked(FG.canNotify() === false || FG.photoChannelBlocked());
    setBattery(FG.batteryUnrestricted());
  }, []);
  useFocusEffect(useCallback(() => {
    DB.getSettings().then((x) => { setSt(x); setName(x.childName || ''); });
    checkSystem();
  }, [checkSystem]));
  // 從系統設定回來時，重新看通知是不是打開了
  useEffect(() => {
    const sub = AppState.addEventListener('change', (v) => { if (v === 'active') checkSystem(); });
    return () => sub.remove();
  }, [checkSystem]);
  useEffect(() => {
    DB.recentSaved(1).then(async (r) => { if (r[0]) setPhoto((await DB.photosInfo([r[0].file_id]))[0] || null); }).catch(() => {});
  }, []);

  if (!st) return <Paper><View /></Paper>;
  const save = async (p: Partial<DB.Settings>) => { const n = await DB.saveSettings(p); setSt(n); return n; };
  const setNotify = async (v: boolean) => {
    if (v && !(await askNotificationPermission())) { Alert.alert(tr('set.notifyOffTitle'), tr('set.notifyOffBody')); return; }
    // 打開通知時也打開「自動找新照片」（不然不會有通知）
    await save(v ? { notify: true, autoDaily: true } : { notify: false });
    await syncSchedule().catch(() => {});
    checkSystem();
  };
  const saveName = () => { if (name.trim() !== (st.childName || '')) save({ childName: name.trim() }); };
  const { from, to } = dayHours(st);
  const who = kidName(st);
  const android = Platform.OS === 'android';

  return (
    <Paper>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} /></View>
        <H1>{tr('nset.title')}</H1>

        {/* 系統把通知關掉了 */}
        {android && blocked ? (
          <Card tint={t.c.note} style={{ gap: 10 }}>
            <P style={{ color: t.c.noDeep }}>{tr('nset.blocked')}</P>
            <Btn small title={tr('nset.openSys')} onPress={() => { if (!FG.openNotificationSettings()) FG.openAppSettings(); }} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}

        {/* 通知的樣子 */}
        <View style={[cardStyle(t), s.card, { paddingBottom: 16, gap: 10 }]}>
          <Text style={s.label}>{tr('nset.preview')}</Text>
          {st.notify ? (
            <>
              <Preview st={st} photo={photo} />
              {st.lockHide ? <Text style={s.note}>{tr('nset.lockNote', { text: tr('ntf.pubTitle', { who, n: 5 }) })}</Text> : null}
            </>
          ) : <Text style={s.note}>{tr('nset.offNote')}</Text>}
        </View>

        {/* 自動找新照片關著：不會有通知 */}
        {st.notify && !st.autoDaily ? (
          <Card tint={t.c.note} style={{ gap: 10 }}>
            <P style={{ fontSize: 13.5 }}>{tr('nset.autoOff')}</P>
            <Btn small title={tr('nset.autoOnBtn')} style={{ alignSelf: 'flex-start' }}
              onPress={async () => { await save({ autoDaily: true }); await syncSchedule().catch(() => {}); }} />
          </Card>
        ) : null}

        {/* 開關 */}
        <View style={[cardStyle(t), s.card]}>
          <SwitchRow first title={tr('nset.on')} sub={tr('nset.onSub', { every: everyWord(st), who })} value={st.notify} onChange={setNotify} />
          <SwitchRow title={tr('nset.photo')} value={st.notifyPhoto} onChange={(v) => save({ notifyPhoto: v })} />
          <SwitchRow title={tr('nset.lock')} sub={tr('nset.lockSub')} value={st.lockHide} onChange={(v) => save({ lockHide: v })} />
        </View>

        {/* 孩子的小名 */}
        <View style={[cardStyle(t), s.card, { paddingBottom: 14, gap: 6 }]}>
          <SectionTitle style={{ marginBottom: 0 }}>{tr('nset.name')}</SectionTitle>
          <TextInput value={name} onChangeText={setName} onEndEditing={saveName} onBlur={saveName} onSubmitEditing={saveName}
            placeholder={tr('nset.namePh')} placeholderTextColor={t.c.muted} maxLength={12} returnKeyType="done"
            style={s.input} accessibilityLabel={tr('nset.name')} />
          <Text style={s.note}>{tr('nset.nameSub')}</Text>
        </View>

        {/* 通知時段 */}
        <View style={[cardStyle(t), s.card, { paddingBottom: 12 }]}>
          <Pressable onPress={() => setHoursOpen((o) => !o)} style={({ pressed }) => [s.hoursHead, pressed && { opacity: 0.7 }]}
            accessibilityRole="button" accessibilityState={{ expanded: hoursOpen }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.rowTitle}>{tr('nset.hours')}</Text>
              <Text style={s.hoursValue}>{hoursText(st)}</Text>
              <Text style={s.rowSub}>{st.quiet ? tr('nset.hoursSub', { from }) : tr('nset.allDaySub')}</Text>
            </View>
            <Text style={[s.chev, hoursOpen && { transform: [{ rotate: '90deg' }] }]}>›</Text>
          </Pressable>
          {hoursOpen ? (
            <View style={{ gap: 10, paddingTop: 4 }}>
              <SwitchRow title={tr('nset.quiet')} value={st.quiet} onChange={(v) => save({ quiet: v })} />
              {st.quiet ? (
                <>
                  <Text style={s.small}>{tr('nset.from')}</Text>
                  <View style={s.chips}>
                    {FROM.map((h) => (
                      <Pressable key={h} onPress={() => save({ dayFrom: h })} style={[s.chip, from === h && s.chipOn]}
                        accessibilityRole="radio" accessibilityState={{ selected: from === h }}>
                        <Text style={[s.chipText, from === h && { color: t.c.accentDeep }]}>{h}:00</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={s.small}>{tr('nset.to')}</Text>
                  <View style={s.chips}>
                    {TO.map((h) => (
                      <Pressable key={h} onPress={() => save({ dayTo: h })} style={[s.chip, to === h && s.chipOn]}
                        accessibilityRole="radio" accessibilityState={{ selected: to === h }}>
                        <Text style={[s.chipText, to === h && { color: t.c.accentDeep }]}>{h}:00</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* 多久看一次 */}
        <View style={[cardStyle(t), s.card, { paddingBottom: 14, gap: 10 }]}>
          <Text style={s.rowTitle}>{tr('nset.freq')}</Text>
          <View style={s.freqs}>
            {EVERY_OPTIONS.map((o) => {
              const on = st.freq === o.k || (o.k === 30 && st.freq !== 15 && st.freq !== 60);
              return (
                <Pressable key={o.k} style={[s.freq, on && s.freqOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  onPress={async () => { await save({ freq: o.k }); await syncSchedule().catch(() => {}); }}>
                  <Text style={[s.freqName, on && { color: t.c.accentDeep }]}>{tr(o.label)}</Text>
                  <Text style={s.freqDesc}>{tr(o.desc)}</Text>
                </Pressable>
              );
            })}
          </View>
          {Platform.OS === 'ios' ? <Text style={s.note}>{tr('nset.iosNote')}</Text> : null}
        </View>

        {/* 電池：沒設成「不限制」的話，有些手機會把背景檢查延後 */}
        {android && !battery ? (
          <Pressable onPress={() => Alert.alert(tr('home.batteryTitle'), tr('home.batteryBody'), [
            { text: tr('common.cancel'), style: 'cancel' }, { text: tr('home.openSettings'), onPress: () => FG.openAppSettings() },
          ])} style={({ pressed }) => [s.battery, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <Text style={s.batteryText}>{tr('nset.battery')}</Text>
          </Pressable>
        ) : null}

        <Btn kind="ghost" title={tr('nset.test')} busy={testing} onPress={async () => {
          setTesting(true);
          setTestMsg('');
          try { setTestMsg((await sendTest()) ? tr('nset.testSent') : tr('nset.testDenied')); } catch (e: any) { setTestMsg(String(e?.message || e)); }
          finally { setTesting(false); checkSystem(); }
        }} />
        {testMsg ? <P muted style={{ textAlign: 'center', fontSize: 13 }}>{testMsg}</P> : null}
      </ScrollView>
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  return StyleSheet.create({
    scroll: { padding: 18, paddingBottom: 48, gap: 14 },
    card: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    label: { ...t.round, fontSize: 14, color: c.muted },
    note: { ...t.round, fontSize: 13, lineHeight: 20, color: c.muted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowTitle: { ...t.round, fontSize: 16, color: c.ink },
    rowSub: { ...t.round, fontSize: 12.5, lineHeight: 18, color: c.muted, marginTop: 3 },
    // 預覽：長得像手機的通知（不跟主題變，看起來才像真的通知）
    ntf: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFE6DE', padding: 12, paddingHorizontal: 14, gap: 4 },
    ntfIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#F9E1DA', alignItems: 'center', justifyContent: 'center' },
    ntfApp: { fontFamily: SYSTEM_FONT, fontSize: 12, color: '#4A4340' },
    ntfTitle: { fontFamily: SYSTEM_FONT, fontSize: 14, fontWeight: '600', lineHeight: 19, color: '#1F1B19', marginTop: 2 },
    ntfBody: { fontFamily: SYSTEM_FONT, fontSize: 13, lineHeight: 18, color: '#4A4340' },
    ntfPic: { height: 110, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3EBE4', marginTop: 4 },
    ntfAct: { fontFamily: SYSTEM_FONT, fontSize: 13.5, fontWeight: '600', color: '#A0505B', paddingVertical: 6 },
    input: {
      ...t.round, fontSize: 16, color: c.ink, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card2,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8, marginTop: 4,
    },
    hoursHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
    hoursValue: { ...t.round, fontSize: 15, color: c.accentDeep },
    chev: { ...t.round, fontSize: 22, color: c.accentDeep },
    small: { ...t.round, fontSize: 13, color: c.muted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minWidth: 64, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card2 },
    chipOn: { borderColor: c.accent, backgroundColor: c.accentWash },
    chipText: { ...t.round, fontSize: 14.5, color: c.ink2 },
    freqs: { flexDirection: 'row', gap: 8 },
    freq: { flex: 1, minHeight: 62, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center', gap: 3 },
    freqOn: { backgroundColor: c.accentWash, borderColor: c.accent },
    freqName: { ...t.round, fontSize: 14.5, color: c.ink, textAlign: 'center' },
    freqDesc: { ...t.round, fontSize: 11.5, color: c.muted, textAlign: 'center' },
    battery: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c.noteLine, backgroundColor: c.note, padding: 14, minHeight: 52, justifyContent: 'center' } as ViewStyle,
    batteryText: { ...t.round, fontSize: 14.5, color: c.accentDeep },
  });
});
