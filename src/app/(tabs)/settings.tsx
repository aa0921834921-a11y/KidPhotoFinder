import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LANGS, setLang, tr, useLang, type TStrKey } from '../../i18n';
import { backgroundAvailable, syncSchedule } from '../../services/background';
import * as DB from '../../services/db';
import { everyWord, hoursText } from '../../services/notifyPrefs';
import { clearScanCache, restore, signIn, signOut, type Account } from '../../services/drive';
import { refreshCounts, scheduleApply } from '../../services/scanner';
import { bump } from '../../services/state';
import { FolderPicker } from '../../ui/FolderPicker';
import { Btn, cardStyle, DashLine, HeadCard, Icon, P, Paper, SectionTitle, Toggle, useContentWidth, type IconName } from '../../ui/kit';
import { makeStyles, setTheme, SYSTEM_FONT, THEME_ORDER, useTheme, type Theme, type ThemeId } from '../../ui/theme';

/* ---------------------------------------------------------------- 主題的小預覽圖 */

const MOCK: Record<ThemeId, { bg: ViewStyle; head: ViewStyle; ink: string; acc: string; tiles: ViewStyle[] }> = {
  watercolor: {
    bg: { backgroundColor: '#F7EFE0' }, head: { backgroundColor: '#FFFAF0' }, ink: '#654639', acc: '#C27A7C',
    tiles: [-4, 0, 4].map((r) => ({ backgroundColor: '#FFFFFF', borderWidth: 2, borderBottomWidth: 5, borderColor: '#FFFFFF', borderRadius: 1, boxShadow: '0px 1px 3px rgba(0,0,0,0.15)', transform: [{ rotate: `${r}deg` }] } as ViewStyle)),
  },
  minimal: {
    bg: { backgroundColor: '#F3F6F5' }, head: { backgroundColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0,0,0,0.06)' } as ViewStyle, ink: '#1F2D2A', acc: '#24845F',
    tiles: [0, 1, 2].map(() => ({ backgroundColor: '#CDEADF', borderRadius: 6 })),
  },
  starry: {
    bg: { backgroundColor: '#141A33', backgroundImage: 'radial-gradient(circle at 20% 30%, #FFFFFF 1px, transparent 1.5px), radial-gradient(circle at 70% 22%, #FFFFFF 1px, transparent 1.5px), radial-gradient(circle at 45% 80%, #FFE9B0 1px, transparent 1.5px)' } as ViewStyle,
    head: { backgroundColor: '#232C52' }, ink: '#EEF0FF', acc: '#F4C96B',
    tiles: ['#3A3F7E', '#8F7FE0', '#3A3F7E'].map((b) => ({ backgroundColor: b, borderRadius: 6 })),
  },
  candy: {
    bg: { backgroundColor: '#FFF4F9', backgroundImage: 'radial-gradient(circle at 4.5px 4.5px, #FFD6E8 1.2px, transparent 1.5px)', backgroundSize: '9px 9px' } as ViewStyle,
    head: { backgroundColor: '#FFFFFF', boxShadow: '0px 2px 0px #F4CFE1' } as ViewStyle, ink: '#4A3A5C', acc: '#E0528A',
    tiles: ['#7CC6FF', '#FFB3CF', '#FFD979'].map((b) => ({ backgroundColor: b, borderRadius: 8 })),
  },
  book: {
    bg: { backgroundColor: '#C99A70', backgroundImage: 'linear-gradient(125deg, #D4A77D, #BB8761)' } as ViewStyle,
    head: { backgroundColor: '#FFF9EE', left: 12, right: 12, top: 6, height: 46, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, boxShadow: 'inset 7px 0px 8px -5px rgba(110,72,48,0.4)' } as ViewStyle,
    ink: '#5E3F33', acc: '#C46F78',
    tiles: ['#E8B0B0', '#A3BD9D', '#E2B07C'].map((b) => ({ backgroundColor: b, height: 12, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 })),
  },
};

function ThemeTile({ id, on, onPress, width }: { id: ThemeId; on: boolean; onPress: () => void; width: number }) {
  const s = useStyles();
  useLang();
  const m = MOCK[id];
  const name = tr(`theme.${id}`);
  const desc = tr(`theme.${id}.desc`);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tc, { width }, on && s.tcOn, pressed && { transform: [{ scale: 0.98 }] }]}
      accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${name}, ${desc}`}>
      <View style={[s.mock, m.bg]}>
        <View style={[s.mh, m.head]}>
          <View style={[s.mhLine, { backgroundColor: m.ink }]} />
          <View style={[s.mhPill, { backgroundColor: m.acc }]} />
        </View>
        <View style={[s.mp, id === 'book' && { bottom: 0, left: 16, right: 16, gap: 3 }]}>
          {m.tiles.map((x, i) => <View key={i} style={[s.mpTile, x]} />)}
        </View>
      </View>
      <Text style={s.tcName}>{name}</Text>
      <Text style={s.tcDesc}>{desc}</Text>
      {on ? <View style={s.badge}><Text style={s.badgeText}>{tr('set.inUse')}</Text></View> : null}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- 一列設定 */

function Row({ icon, title, sub, children, onPress, first }: { icon: IconName | string; title: string; sub?: string; children?: React.ReactNode; onPress?: () => void; first?: boolean }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <>
      {!first ? <DashLine /> : null}
      <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
        <View style={s.si}>
          {icon.length > 2 ? <Icon name={icon as IconName} size={19} color={t.c.accentDeep} /> : <Text style={{ color: t.c.accentDeep, fontSize: 16 }}>{icon}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>{title}</Text>
          {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
        </View>
        {children}
      </Pressable>
    </>
  );
}

const STRICT: { k: DB.Settings['strictness']; t: TStrKey; d: TStrKey }[] = [
  { k: 'loose', t: 'set.loose', d: 'set.looseDesc' }, { k: 'standard', t: 'set.standard', d: 'set.standardDesc' }, { k: 'strict', t: 'set.strict', d: 'set.strictDesc' },
];

/** 語言：每個語言用它自己的文字寫（萬一選到看不懂的語言，也找得回來） */
function LanguageCard() {
  const t = useTheme();
  const s = useStyles();
  const lang = useLang();
  return (
    <View style={[cardStyle(t), s.card, { paddingBottom: 14 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <SectionTitle style={{ marginBottom: 0, flex: 1 }}>{tr('lang.section')}</SectionTitle>
        <Icon name="globe" size={20} color={t.c.accentDeep} />
      </View>
      <View style={s.langs}>
        {LANGS.map((l) => {
          const on = l.k === lang;
          return (
            <Pressable key={l.k} onPress={() => setLang(l.k)} style={({ pressed }) => [s.langBtn, on && s.langOn, pressed && { opacity: 0.7 }]}
              accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={l.name}>
              <Text style={[s.langName, on && { color: t.c.accentDeep }]}>{on ? '✓ ' : ''}{l.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function Settings() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const w = useContentWidth(16);
  const tileW = Math.floor((w - 32 - 2 * t.border - 10) / 2);
  const [st, setSt] = useState<DB.Settings | null>(null);
  const [acct, setAcct] = useState<Account | null>(null);
  const [pick, setPick] = useState(false);
  const [replace, setReplace] = useState(false); // 換掉唯一的資料夾（不是再加一個）
  const [bg, setBg] = useState(true);
  useEffect(() => { restore().then(setAcct); backgroundAvailable().then(setBg).catch(() => {}); }, []);
  // 從「新照片通知」頁回來時，重新讀設定
  useFocusEffect(useCallback(() => { DB.getSettings().then(setSt); }, []));
  if (!st) return <Paper cap={tr('set.cap')}><View /></Paper>;
  const save = async (p: Partial<DB.Settings>) => setSt(await DB.saveSettings(p));
  const card = [cardStyle(t), s.card];

  return (
    <Paper cap={tr('set.cap')}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <HeadCard title={tr('set.title')} sub={tr('set.sub')} />

        <LanguageCard />

        <View style={card}>
          <SectionTitle>{tr('set.theme')}</SectionTitle>
          <P muted style={{ fontSize: 12.5, marginBottom: 10 }}>{tr('set.themeNote')}{t.id === 'book' ? tr('set.themeNoteBook') : ''}</P>
          <View style={s.tgrid}>
            {THEME_ORDER.map((id) => <ThemeTile key={id} id={id} width={tileW} on={t.id === id} onPress={() => setTheme(id)} />)}
          </View>
        </View>

        <View style={card}>
          <SectionTitle>{tr('set.account')}</SectionTitle>
          <Row first icon="user" title={acct ? acct.email : tr('set.notSignedIn')} sub={acct ? tr('set.readOnly') : tr('set.signInFirst')}>
            <Btn small kind="ghost" title={acct ? tr('set.signOut') : tr('set.signIn')} onPress={async () => {
              if (acct) { await signOut(); setAcct(null); } else setAcct(await signIn().catch((e) => { Alert.alert(tr('common.signInFailed'), String(e?.message || e)); return null; }));
            }} />
          </Row>
          {/* 老師的資料夾：兄弟姊妹不同班時可以加好幾個 */}
          {(st.folders.length ? st.folders : [null]).map((f, i) => (
            <Row key={f?.id || 'none'} icon="folder" title={i ? `${tr('set.folder')} ${i + 1}` : tr('set.folder')} sub={f?.name || tr('set.noFolder')}
              onPress={acct && !f ? () => setPick(true) : undefined}>
              {acct && f && st.folders.length > 1 ? (
                <Pressable hitSlop={8} onPress={() => Alert.alert(tr('set.removeFolderTitle', { name: f.name }), tr('set.removeFolderBody'), [
                  { text: tr('common.cancel'), style: 'cancel' },
                  { text: tr('set.removeFolder'), style: 'destructive', onPress: async () => { await save({ folders: st.folders.filter((x) => x.id !== f.id) }); } },
                ])}><Text style={[s.v, { color: t.c.muted }]}>{tr('set.removeFolder')}</Text></Pressable>
              ) : acct && f ? (
                <Pressable hitSlop={8} onPress={() => { setReplace(true); setPick(true); }}><Text style={s.v}>{tr('common.change')} ›</Text></Pressable>
              ) : null}
            </Row>
          ))}
          {acct && st.folders.length ? (
            <Row icon="plus" title={tr('set.addFolder')} sub={tr('set.addFolderSub')} onPress={() => { setReplace(false); setPick(true); }}><Text style={s.v}>›</Text></Row>
          ) : null}
        </View>

        <View style={card}>
          <SectionTitle>{tr('set.recog')}</SectionTitle>
          <Row first icon="face" title={tr('set.strictness')} sub={tr('set.strictnessSub')} />
          <View style={s.lv}>
            {STRICT.map((x) => {
              const on = st.strictness === x.k;
              return (
                <Pressable key={x.k} style={[s.lvBtn, on && s.lvOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  onPress={async () => { await save({ strictness: x.k }); scheduleApply(); }}>
                  <Text style={[s.lvName, on && { color: t.c.accentDeep }]}>{tr(x.t)}</Text>
                  <Text style={s.lvDesc}>{tr(x.d)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Row icon="video" title={tr('set.videos')} sub={tr('set.videosSub')}>
            <Toggle value={st.videos} onValueChange={(v) => save({ videos: v })} label={tr('set.videos')} />
          </Row>
        </View>

        <View style={card}>
          <SectionTitle>{tr('set.auto')}</SectionTitle>
          <Row first icon="clock" title={tr('set.daily')} sub={bg ? tr('set.dailySub', { every: everyWord(st) }) : tr('set.dailyBlocked')}>
            <Toggle value={st.autoDaily} label={tr('set.daily')} onValueChange={async (v) => { await save({ autoDaily: v }); await syncSchedule().catch(() => {}); }} />
          </Row>
          <Row icon="bell" title={tr('set.notify')} sub={st.notify ? tr('set.notifyOn', { hours: hoursText(st) }) : tr('set.notifyOff')}
            onPress={() => router.push('/notify')}>
            <Text style={s.v}>›</Text>
          </Row>
          <Row icon="album" title={tr('set.line')} sub={tr('set.lineSub')} onPress={() => router.push('/clean')}><Text style={s.v}>›</Text></Row>
          <Row icon="list" title={tr('set.logs')} sub={tr('set.logsSub')} onPress={() => router.push('/logs')}><Text style={s.v}>›</Text></Row>
        </View>

        <View style={card}>
          <SectionTitle>{tr('set.other')}</SectionTitle>
          <Row first icon="trash" title={tr('set.clearCache')} sub={tr('set.clearCacheSub')} onPress={() => { clearScanCache(); Alert.alert(tr('set.cleared')); }} />
          <Row icon="reset" title={tr('set.reset')} sub={tr('set.resetSub')} onPress={() => Alert.alert(tr('set.resetTitle'), tr('set.resetBody'), [
            { text: tr('common.cancel'), style: 'cancel' },
            { text: tr('set.resetBtn'), style: 'destructive', onPress: async () => { await DB.resetAll(); await refreshCounts(); bump(); } },
          ])} />
        </View>
        <P muted style={{ fontSize: 12, textAlign: 'center' }}>{tr('set.privacy')}</P>
      </ScrollView>
      <FolderPicker visible={pick} onClose={() => setPick(false)} onPick={async (f) => {
        setPick(false);
        const cur = st.folders;
        if (cur.some((x) => x.id === f.id)) return;
        await save({ folders: replace || !cur.length ? [{ id: f.id, name: f.name }] : [...cur, { id: f.id, name: f.name }] });
        await syncSchedule().catch(() => {});
      }} />
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  return StyleSheet.create({
    scroll: { padding: 16, paddingTop: t.id === 'book' ? 12 : 14, paddingBottom: 40, gap: 14 },
    card: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    tgrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    tc: { borderWidth: 2, borderColor: c.line, backgroundColor: c.card2, borderRadius: 16, padding: 7, paddingBottom: 9, gap: 4 },
    tcOn: { borderColor: c.accent, boxShadow: `0px 0px 0px 3px ${c.accentWash}` } as ViewStyle,
    mock: { height: 78, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', marginBottom: 4 },
    mh: { position: 'absolute', left: 8, right: 8, top: 8, height: 36, borderRadius: 7, padding: 7 },
    mhLine: { height: 5, width: '60%', borderRadius: 3, opacity: 0.8 },
    mhPill: { height: 8, width: '38%', borderRadius: 99, marginTop: 8 },
    mp: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', gap: 4 },
    mpTile: { flex: 1, height: 18 },
    tcName: { ...t.title, fontSize: 14.5, color: c.ink, paddingHorizontal: 3 },
    tcDesc: { ...t.round, fontSize: 11.5, lineHeight: 16, color: c.muted, paddingHorizontal: 3 },
    badge: { position: 'absolute', right: 12, top: 12, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 99, backgroundColor: c.accent, boxShadow: '0px 2px 5px rgba(0,0,0,0.18)' } as ViewStyle,
    badgeText: { ...t.round, fontSize: 10.5, color: c.onAccent },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    si: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.accentWash, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { ...t.round, fontSize: 15, color: c.ink },
    rowSub: { ...t.round, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 2 },
    v: { ...t.round, fontSize: 14, color: c.accentDeep },
    lv: { flexDirection: 'row', gap: 6, paddingBottom: 12 },
    lvBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card2, alignItems: 'center' },
    lvOn: { backgroundColor: c.accentWash, borderColor: c.accent },
    lvName: { ...t.round, fontSize: 14.5, color: c.ink2 },
    lvDesc: { ...t.round, fontSize: 10.5, color: c.muted, marginTop: 2, textAlign: 'center' },
    langs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    langBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card2 },
    langOn: { backgroundColor: c.accentWash, borderColor: c.accent },
    langName: { fontFamily: SYSTEM_FONT, fontSize: 14.5, color: c.ink2 },
  });
});
