import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { askNotificationPermission, backgroundAvailable, syncSchedule } from '../../services/background';
import * as DB from '../../services/db';
import { clearScanCache, restore, signIn, signOut, type Account } from '../../services/drive';
import { refreshCounts, scheduleApply } from '../../services/scanner';
import { bump } from '../../services/state';
import { FolderPicker } from '../../ui/FolderPicker';
import { Btn, cardStyle, DashLine, HeadCard, Icon, P, Paper, SectionTitle, Toggle, useContentWidth, type IconName } from '../../ui/kit';
import { makeStyles, setTheme, THEME_ORDER, THEMES, useTheme, type Theme, type ThemeId } from '../../ui/theme';

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
  const m = MOCK[id];
  const th = THEMES[id];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tc, { width }, on && s.tcOn, pressed && { transform: [{ scale: 0.98 }] }]}
      accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${th.name}，${th.desc}`}>
      <View style={[s.mock, m.bg]}>
        <View style={[s.mh, m.head]}>
          <View style={[s.mhLine, { backgroundColor: m.ink }]} />
          <View style={[s.mhPill, { backgroundColor: m.acc }]} />
        </View>
        <View style={[s.mp, id === 'book' && { bottom: 0, left: 16, right: 16, gap: 3 }]}>
          {m.tiles.map((x, i) => <View key={i} style={[s.mpTile, x]} />)}
        </View>
      </View>
      <Text style={s.tcName}>{th.name}</Text>
      <Text style={s.tcDesc}>{th.desc}</Text>
      {on ? <View style={s.badge}><Text style={s.badgeText}>使用中</Text></View> : null}
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

const STRICT: { k: DB.Settings['strictness']; t: string; d: string }[] = [
  { k: 'loose', t: '寬鬆', d: '盡量不漏' }, { k: 'standard', t: '標準', d: '建議' }, { k: 'strict', t: '嚴格', d: '只存很確定的' },
];

export default function Settings() {
  const t = useTheme();
  const s = useStyles();
  const w = useContentWidth(16);
  const tileW = Math.floor((w - 32 - 2 * t.border - 10) / 2);
  const [st, setSt] = useState<DB.Settings | null>(null);
  const [acct, setAcct] = useState<Account | null>(null);
  const [pick, setPick] = useState(false);
  const [bg, setBg] = useState(true);
  useEffect(() => { DB.getSettings().then(setSt); restore().then(setAcct); backgroundAvailable().then(setBg); }, []);
  if (!st) return <Paper cap="小幫手設定"><View /></Paper>;
  const save = async (p: Partial<DB.Settings>) => setSt(await DB.saveSettings(p));
  const card = [cardStyle(t), s.card];

  return (
    <Paper cap="小幫手設定">
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <HeadCard title="我的貼心小幫手" sub="換個喜歡的樣子，調整找照片的方式。" />

        <View style={card}>
          <SectionTitle>主題</SectionTitle>
          <P muted style={{ fontSize: 12.5, marginBottom: 10 }}>點一下馬上換，App 會記住。{t.id === 'book' ? '換分頁或在頁面上左右滑，就會翻頁。' : ''}</P>
          <View style={s.tgrid}>
            {THEME_ORDER.map((id) => <ThemeTile key={id} id={id} width={tileW} on={t.id === id} onPress={() => setTheme(id)} />)}
          </View>
        </View>

        <View style={card}>
          <SectionTitle>Google 帳號與資料夾</SectionTitle>
          <Row first icon="user" title={acct ? acct.email : '還沒登入'} sub={acct ? '只會讀取，不會修改老師的檔案' : '登入後才能看老師分享的照片'}>
            <Btn small kind="ghost" title={acct ? '登出' : '登入'} onPress={async () => {
              if (acct) { await signOut(); setAcct(null); } else setAcct(await signIn().catch((e) => { Alert.alert('登入失敗', String(e?.message || e)); return null; }));
            }} />
          </Row>
          <Row icon="folder" title="老師的資料夾" sub={st.folderName || '還沒選'} onPress={acct ? () => setPick(true) : undefined}>
            {acct ? <Text style={s.v}>更換 ›</Text> : null}
          </Row>
        </View>

        <View style={card}>
          <SectionTitle>辨識</SectionTitle>
          <Row first icon="face" title="認人的嚴格程度" sub="不確定的照片都會先放到「待確認」" />
          <View style={s.lv}>
            {STRICT.map((x) => {
              const on = st.strictness === x.k;
              return (
                <Pressable key={x.k} style={[s.lvBtn, on && s.lvOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  onPress={async () => { await save({ strictness: x.k }); scheduleApply(); }}>
                  <Text style={[s.lvName, on && { color: t.c.accentDeep }]}>{x.t}</Text>
                  <Text style={s.lvDesc}>{x.d}</Text>
                </Pressable>
              );
            })}
          </View>
          <Row icon="video" title="也找影片" sub="影片要整個下載，比較花流量和時間">
            <Toggle value={st.videos} onValueChange={(v) => save({ videos: v })} label="也找影片" />
          </Row>
        </View>

        <View style={card}>
          <SectionTitle>自動與通知</SectionTitle>
          <Row first icon="clock" title="每天自動找新照片" sub={bg ? '手機會挑充電、連 Wi-Fi 的時候在背景執行' : '手機目前不允許背景執行：請到系統設定打開「背景 App 重新整理」'}>
            <Toggle value={st.autoDaily} label="每天自動找新照片" onValueChange={async (v) => { await save({ autoDaily: v }); await syncSchedule(v); }} />
          </Row>
          <Row icon="bell" title="有新照片時通知我">
            <Toggle value={st.notify} label="有新照片時通知我" onValueChange={async (v) => {
              if (v && !(await askNotificationPermission())) { Alert.alert('通知被關掉了', '請到系統設定允許這個 App 傳送通知。'); return; }
              save({ notify: v });
            }} />
          </Row>
          <Row icon="album" title="整理 LINE 照片" sub="留下有孩子的照片，其他的確認後刪除" onPress={() => router.push('/clean')}><Text style={s.v}>›</Text></Row>
          <Row icon="list" title="執行紀錄" sub="每次整理找到了什麼" onPress={() => router.push('/logs')}><Text style={s.v}>›</Text></Row>
        </View>

        <View style={card}>
          <SectionTitle>其他</SectionTitle>
          <Row first icon="trash" title="清除暫存縮圖" sub="釋放手機空間，不影響相簿" onPress={() => { clearScanCache(); Alert.alert('清好了'); }} />
          <Row icon="reset" title="全部重新開始" sub="清掉掃描紀錄和答案（參考照片、相簿裡的照片都會保留）" onPress={() => Alert.alert('確定要重新開始？', '已經存進相簿的照片不會被刪除。', [
            { text: '取消', style: 'cancel' },
            { text: '重新開始', style: 'destructive', onPress: async () => { await DB.resetAll(); await refreshCounts(); bump(); } },
          ])} />
        </View>
        <P muted style={{ fontSize: 12, textAlign: 'center' }}>照片只存在你的手機和你的 Google 帳號裡，不會上傳到其他地方。</P>
      </ScrollView>
      <FolderPicker visible={pick} onClose={() => setPick(false)} onPick={async (f) => {
        setPick(false);
        await save({ folderId: f.id, folderName: f.name });
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
    lvDesc: { ...t.round, fontSize: 10.5, color: c.muted, marginTop: 2 },
  });
});
