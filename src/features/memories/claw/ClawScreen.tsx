/**
 * 時光娃娃機（新頁面 /memory-claw）：3D 夾娃娃機，水晶球裡是孩子的回憶照片。
 * - 3D 畫面在 WebView 裡（assets/claw/claw.html，原始碼在 claw/），這一頁負責：挑照片、做小圖、文字（目前語言）、
 *   收藏冊（App 會記住）、「看這一天」打開那個活動的全部照片、返回鍵、震動
 * - 只有整體視角：一根手指拖曳可以轉 260 度、兩根手指縮放；搖桿和抓取鍵可以同時按
 * - 還沒有存下來的照片：跟回憶星空一樣，先說明、可以看示範（畫面上標「示範資料」）
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tr, useLang } from '../../../i18n';
import { useApp } from '../../../services/state';
import { useTheme } from '../../../ui/theme';
import { demoMemories, loadMemories, type Memory, type MemoryData } from '../data';
import { DaySheet } from '../ui/DaySheet';
import { useSerif } from '../ui/fonts';
import { GOLD } from '../ui/GoldIcon';
import { addKept, albumItems, loadKept, type Kept } from './album';
import ClawView, { type ClawPage, type ClawSend } from './ClawView';
import { makePics, pickPhotos } from './photos';

const PAGE = require('../../../../assets/claw/claw.html');

/** 讀遊戲頁面：手機讀成文字給 WebView；網頁版直接用網址給 iframe */
async function loadPage(): Promise<ClawPage> {
  const a = Asset.fromModule(PAGE);
  if (Platform.OS === 'web') return { uri: a.uri };
  await a.downloadAsync();
  return { html: await new File(a.localUri || a.uri).text() };
}

/** 遊戲裡的文字（目前語言）。鍵跟 claw/game.js 的 TXT 一樣 */
function clawTexts(): Record<string, string> {
  return {
    loading: tr('claw.loading'), start: tr('claw.start'), slip: tr('claw.slip'), win: tr('claw.win'), miss: tr('claw.miss'), over: tr('claw.over'),
    timer: tr('claw.timer'), ready: tr('claw.ready'), overShort: tr('claw.overShort'), coins: tr('claw.coins'), refilled: tr('claw.refilled'),
    relaid: tr('claw.relaid'), album: tr('claw.album'), albumTitle: tr('claw.albumTitle'), albumEmpty: tr('claw.albumEmpty'), close: tr('claw.close'),
    keep: tr('claw.keep'), kept: tr('claw.kept'), openDay: tr('claw.openDay'), recenter: tr('claw.recenter'), relay: tr('claw.relay'),
    refill: tr('claw.refill'), soundOn: tr('claw.soundOn'), soundOff: tr('claw.soundOff'), hint: tr('claw.hint'), hintPc: tr('claw.hintPc'),
    rareLine: tr('claw.rareLine'), catchLine: tr('claw.catchLine'), propBear: tr('claw.propBear'), propTrain: tr('claw.propTrain'),
    propLine: tr('claw.propLine'), demo: tr('mem.demo'), back: tr('mem.back'), pad: tr('claw.pad'), grab: tr('claw.grab'),
  };
}

const buzz = (k: 'light' | 'success') => {
  if (Platform.OS === 'web') return;
  (k === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(() => {});
};

export default function ClawScreen({ demo: demoParam }: { demo: boolean }) {
  const t = useTheme();
  useLang();
  const ins = useSafeAreaInsets();
  const still = !!useReducedMotion();
  const version = useApp((x) => x.version);
  const serif = useSerif();
  const font = useMemo(() => ({ title: t.title, round: t.round, serif: serif.serif, serifR: serif.serifR }), [t, serif]);

  const [demo, setDemo] = useState(demoParam);
  const [data, setData] = useState<MemoryData | null>(null);
  const [page, setPage] = useState<ClawPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null); // 照片做到第幾張
  const [picsReady, setPicsReady] = useState(false);
  const [attempt, setAttempt] = useState(0);   // 按「再試一次」就整個重來
  const [day, setDay] = useState<Memory | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const empty = !!data && !data.items.length;

  const sendRef = useRef<ClawSend | null>(null);
  const ready = useRef(false);        // 遊戲畫面載好了
  const init = useRef<object | null>(null);   // 照片、文字都準備好了
  const sent = useRef(false);
  const kept = useRef<Kept[]>([]);    // 收藏冊（示範模式只記在這一次）
  const dataRef = useRef<MemoryData | null>(null);
  dataRef.current = data;

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((x) => (x === m ? null : x)), 2200); }, []);
  const trySend = useCallback(() => {
    if (ready.current && init.current && sendRef.current && !sent.current) { sent.current = true; sendRef.current(init.current); }
  }, []);

  /* ---------- 遊戲頁面（讀不到的話，按「再試一次」會重讀） */
  useEffect(() => {
    if (page) return;
    let alive = true;
    loadPage().then((p) => { if (alive) setPage(p); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [page, attempt]);

  /* ---------- 資料（換成示範時整個重來） */
  useEffect(() => {
    let alive = true;
    setData(null); setStarted(false); setPicsReady(false); setProg(null);
    ready.current = false; init.current = null; sent.current = false;
    if (demo) { setData(demoMemories()); return; }
    loadMemories().then((d) => alive && setData(d)).catch(() => alive && setData({ items: [], info: new Map(), demo: false }));
    return () => { alive = false; };
  }, [demo, version]);

  /* ---------- 挑照片、做成小圖 → 傳給遊戲（畫面上顯示做到第幾張） */
  useEffect(() => {
    if (!data || !data.items.length) return;
    let alive = true;
    init.current = null; sent.current = false;
    setPicsReady(false); setProg(null);
    (async () => {
      kept.current = demo ? [] : await loadKept();
      const photos = await makePics(data, pickPhotos(data), (n, total) => { if (alive) setProg({ n, total }); });
      if (!alive) return;
      if (!photos.length) { setFailed(true); return; } // 一張都讀不到：不要用示範照片頂替
      init.current = { type: 'init', photos, t: clawTexts(), demo, albumN: kept.current.length };
      setPicsReady(true);
      trySend();
    })().catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [data, demo, attempt, trySend]);

  /* ---------- 照片都好了，遊戲卻一直沒開始（例如手機的 3D 畫面出問題）：30 秒後讓使用者可以再試一次 */
  useEffect(() => {
    if (!picsReady || started || failed) return;
    const t = setTimeout(() => setFailed(true), 30000);
    return () => clearTimeout(t);
  }, [picsReady, started, failed]);

  const onCrash = useCallback(() => setFailed(true), []);
  const retry = useCallback(() => {
    ready.current = false; sent.current = false; init.current = null;
    setStarted(false); setPicsReady(false); setProg(null); setFailed(false);
    setAttempt((a) => a + 1);
  }, []);

  /* ---------- 遊戲傳來的訊息 */
  const onMessage = useCallback((m: any) => {
    const d = dataRef.current;
    switch (m?.type) {
      case 'ready': ready.current = true; sent.current = false; trySend(); break; // 頁面重新載入過也會再送一次
      case 'started': setStarted(true); break;
      case 'close': router.back(); break;
      case 'haptic': buzz(m.k === 'success' ? 'success' : 'light'); break;
      case 'open': {
        const mm = d?.items.find((x) => x.id === m.mem);
        if (mm) setDay(mm);
        break;
      }
      case 'keep': {
        const k: Kept = { id: String(m.id || ''), mem: String(m.mem || ''), at: Date.now(), ...(typeof m.prop === 'number' && m.prop >= 0 ? { prop: m.prop } : {}) };
        if (demo) { kept.current = [k, ...kept.current]; sendRef.current?.({ type: 'albumN', n: kept.current.length }); }
        else addKept(k, kept.current).then((list) => { kept.current = list; sendRef.current?.({ type: 'albumN', n: list.length }); }).catch(() => {});
        break;
      }
      case 'album':
        if (d) albumItems(kept.current, d).then((items) => sendRef.current?.({ type: 'album', items })).catch(() => {});
        break;
    }
  }, [demo, trySend]);

  /* ---------- Android 返回鍵：先關遊戲裡的收藏券／收藏冊，都沒開才離開 */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (day) return false; // 「看這一天」自己會關
      if (started && sendRef.current) { sendRef.current({ type: 'back' }); return true; }
      return false;
    });
    return () => sub.remove();
  }, [day, started]);

  const showGame = !!page && !!data && !empty && !failed;
  // 準備中的說明：讀回憶 → 照片放進水晶球（第幾張）→ 娃娃機準備中
  const waitText = !data ? tr('mem.loading')
    : !picsReady ? `${tr('claw.preparing')}${prog && prog.total ? `  ${prog.n} / ${prog.total}` : ''}`
    : tr('claw.loading');
  return (
    <View style={[s.root, { paddingTop: ins.top, paddingBottom: ins.bottom }]}>
      <StatusBar style="light" />
      {showGame ? <ClawView key={`${demo ? 'demo' : 'real'}-${attempt}`} page={page!} onMessage={onMessage} sendRef={sendRef} onCrash={onCrash} /> : null}

      {/* 還在準備：照片放進水晶球 */}
      {!started && !empty && !failed ? (
        <View pointerEvents="none" style={[s.center, { top: ins.top + 140 }]}>
          <Text style={[font.round, s.loading]}>{waitText}</Text>
        </View>
      ) : null}

      {/* 遊戲還沒開始前也能離開 */}
      {!started ? (
        <Pressable onPress={() => router.back()} style={[s.back, { top: ins.top + 8 }]} accessibilityRole="button" accessibilityLabel={tr('mem.back')} hitSlop={8}>
          <Text style={[font.round, s.backText]}>‹ {tr('mem.back')}</Text>
        </Pressable>
      ) : null}

      {/* 還沒有存下來的照片 */}
      {empty ? (
        <View style={[s.empty, { top: ins.top + 150 }]}>
          <Text style={[font.title, s.emptyT]}>{tr('mem.emptyTitle')}</Text>
          <Text style={[font.round, s.emptyB]}>{tr('mem.emptyBody')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Pressable onPress={() => router.navigate('/')} style={s.emptyBtn} accessibilityRole="button">
              <Text style={[font.round, { color: '#2C2008', fontSize: 15, fontWeight: '700' }]}>{tr('mem.goHome')}</Text>
            </Pressable>
            <Pressable onPress={() => setDemo(true)} style={s.emptyGhost} accessibilityRole="button">
              <Text style={[font.round, { color: GOLD, fontSize: 15 }]}>{tr('mem.tryDemo')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {failed ? (
        <View style={[s.empty, { top: ins.top + 150 }]}>
          <Text style={[font.round, s.emptyB]}>{tr('claw.loadFail')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Pressable onPress={retry} style={s.emptyBtn} accessibilityRole="button">
              <Text style={[font.round, { color: '#2C2008', fontSize: 15, fontWeight: '700' }]}>{tr('claw.retry')}</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={s.emptyGhost} accessibilityRole="button">
              <Text style={[font.round, { color: GOLD, fontSize: 15 }]}>{tr('mem.back')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {toast ? <View pointerEvents="none" style={[s.toast, { top: ins.top + 80 }]}><Text style={[font.round, { color: '#fff', fontSize: 13.5 }]}>{toast}</Text></View> : null}
      {day && data ? <DaySheet m={day} info={data.info} font={font} still={still} onClose={() => setDay(null)} onDemoTap={() => say(tr('mem.demoPhoto'))} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070b1d' },
  center: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  loading: { color: '#E9C27A', fontSize: 15, textAlign: 'center' },
  back: { position: 'absolute', left: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(10,15,38,0.85)', borderWidth: 1, borderColor: 'rgba(233,194,122,0.45)' },
  backText: { color: '#E9C27A', fontSize: 14 },
  empty: {
    position: 'absolute', left: 20, right: 20, maxWidth: 440, alignSelf: 'center', marginHorizontal: 'auto', alignItems: 'center', gap: 8, padding: 20,
    borderRadius: 22, backgroundColor: 'rgba(10,14,42,0.86)', borderWidth: 1, borderColor: 'rgba(255,226,162,0.4)',
  } as ViewStyle,
  emptyT: { fontSize: 20, color: GOLD, textAlign: 'center' },
  emptyB: { fontSize: 14, lineHeight: 22, color: '#D9D2F5', textAlign: 'center' },
  emptyBtn: { minHeight: 46, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#FFD98A', justifyContent: 'center' },
  emptyGhost: { minHeight: 46, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.2, borderColor: GOLD, justifyContent: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(20,20,50,0.9)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
});
