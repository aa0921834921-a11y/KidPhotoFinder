/**
 * 回憶時光機（搜尋）。
 * - 說一句話就能找：「去年聖誕節」「第一次運動會」「上個月」「10/18」——上面會顯示時光機聽懂了什麼
 * - 還沒輸入時：那年的今天、回憶扭蛋（隨機回到某一天）、時光尺（每個月的回憶多寡）、回憶雲（常出現的活動）
 * - 結果是一張張「回憶卡」：三張照片疊在一起（孩子的臉最清楚的放最上面），點開看整個活動
 * 搜尋的規則在 core/timeMachine.ts（電腦版用同一份）。
 */
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type ScrollViewInstance, type TextInputInstance, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import * as TM from '../core/timeMachine';
import { getLang, tr, useLang } from '../i18n';
import * as DB from '../services/db';
import { useApp } from '../services/state';
import { GachaStage } from '../ui/gacha/GachaStage';
import { IMG as GACHA } from '../ui/gacha/images';
import { cardStyle, Empty, H1, Icon, Link, P, Paper, SectionTitle, useContentWidth } from '../ui/kit';
import { Photo, useBest, type Info } from '../ui/memPhoto';
import { makeStyles, useTheme, type Theme } from '../ui/theme';
const lang = () => getLang() as TM.TMLang;

/* ---------------------------------------------------------------- 照片 */

/** 三張照片疊成一疊（像桌上散開的拍立得） */
function Fan({ ev, size }: { ev: TM.TMEvent; size: number }) {
  const t = useTheme();
  const best = useBest(ev);
  const plain = t.id === 'minimal' || t.id === 'starry';
  const frame: ViewStyle = plain
    ? { borderRadius: 14, overflow: 'hidden', boxShadow: t.dark ? '0px 6px 14px rgba(0,0,0,0.45)' : '0px 6px 14px rgba(30,60,50,0.18)' } as ViewStyle
    : { backgroundColor: t.c.pol, padding: 4, paddingBottom: 10, borderRadius: t.id === 'candy' ? 12 : 2, boxShadow: '0px 6px 12px rgba(98,70,45,0.22)' } as ViewStyle;
  const ids = best.length ? best.map((b) => b.file_id) : ev.photos.slice(0, 3).map((p) => p.id);
  const inner = size - (plain ? 0 : 8);
  return (
    <View style={{ width: size * 1.3, height: size + 22, alignItems: 'center', justifyContent: 'center' }}>
      {ids.slice(1, 3).reverse().map((id, i) => (
        <View key={id} style={[frame, { position: 'absolute', transform: [{ translateX: i ? -size * 0.13 : size * 0.13 }, { translateY: size * 0.03 }, { rotate: i ? '-11deg' : '10deg' }] }]}>
          <Photo id={id} info={best.find((b) => b.file_id === id)} size={inner} radius={plain ? 0 : t.id === 'candy' ? 9 : 0} />
        </View>
      ))}
      <View style={[frame, { transform: [{ rotate: t.tilt ? '-1.5deg' : '0deg' }] }]}>
        <Photo id={ids[0]} info={best[0]} size={inner} radius={plain ? 0 : t.id === 'candy' ? 9 : 0} />
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- 時鐘（時光機的指針會轉） */

function Clock({ spin, size = 34 }: { spin: Animated.Value; size?: number }) {
  const t = useTheme();
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const hour = spin.interpolate({ inputRange: [0, 1], outputRange: ['60deg', '90deg'] });
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 34 34">
        <Circle cx={17} cy={17} r={15} fill={t.c.accentWash} stroke={t.c.accent} strokeWidth={2} />
        {[0, 90, 180, 270].map((a) => (
          <Path key={a} d="M17 4.5v2.4" stroke={t.c.accent} strokeWidth={2} strokeLinecap="round" transform={`rotate(${a} 17 17)`} />
        ))}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: hour }] }]}>
        <View style={{ marginTop: size * 0.3, width: 2.6, height: size * 0.22, borderRadius: 2, backgroundColor: t.c.accentDeep }} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: rot }] }]}>
        <View style={{ marginTop: size * 0.16, width: 2, height: size * 0.36, borderRadius: 2, backgroundColor: t.c.accent }} />
      </Animated.View>
      <View style={{ position: 'absolute', left: size / 2 - 2.5, top: size / 2 - 2.5, width: 5, height: 5, borderRadius: 3, backgroundColor: t.c.accentDeep }} />
    </View>
  );
}

/* ---------------------------------------------------------------- 回憶卡、整個活動 */

function EventCard({ ev, badge, onOpen }: { ev: TM.TMEvent; badge?: string; onOpen: () => void }) {
  const t = useTheme();
  const s = useStyles();
  useLang();
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [cardStyle(t), s.card, pressed && { transform: [{ scale: 0.985 }] }]}
      accessibilityRole="button" accessibilityLabel={`${ev.name} ${TM.fmtDay(ev.day, lang())}`}>
      <Fan ev={ev} size={86} />
      <View style={{ flex: 1, gap: 4 }}>
        {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
        <Text style={s.cardTitle} numberOfLines={2}>{ev.name}</Text>
        <Text style={s.cardDate}>{TM.fmtDay(ev.day, lang())}　·　{tr('common.photos', { n: ev.photos.length })}</Text>
        {ev.parent ? <Text style={s.cardSub} numberOfLines={1}>{ev.parent}</Text> : null}
      </View>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

function EventSheet({ ev, onClose }: { ev: TM.TMEvent | null; onClose: () => void }) {
  const t = useTheme();
  const s = useStyles();
  const ins = useSafeAreaInsets();
  const w = useContentWidth(16);
  const [info, setInfo] = useState<Map<string, Info>>(new Map());
  useEffect(() => {
    setInfo(new Map());
    if (!ev) return;
    DB.photosInfo(ev.photos.slice(0, 240).map((p) => p.id)).then((r) => setInfo(new Map(r.map((x) => [x.file_id, x])))).catch(() => {});
  }, [ev]);
  const cols = w > 560 ? 5 : 3;
  const size = Math.floor((w - (cols - 1) * 6) / cols);
  return (
    <Modal visible={!!ev} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: ins.top }}>
        {ev ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 + ins.bottom }}>
            <View style={{ alignSelf: 'flex-start' }}><Link title={`‹ ${tr('tm.close')}`} onPress={onClose} /></View>
            <Text style={s.sheetTitle}>{ev.name}</Text>
            <Text style={s.cardDate}>{TM.fmtDay(ev.day, lang())}　·　{tr('common.photos', { n: ev.photos.length })}{ev.parent ? `　·　${ev.parent}` : ''}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {ev.photos.slice(0, 240).map((p) => (
                <Pressable key={p.id} onPress={() => { onClose(); router.push({ pathname: '/viewer', params: { id: p.id, list: 'saved' } }); }}
                  accessibilityRole="imagebutton" accessibilityLabel={p.name}>
                  <Photo id={p.id} info={info.get(p.id)} size={size} radius={8} />
                  {p.kind === 'video' ? <Text style={s.play}>▶</Text> : null}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

/* ---------------------------------------------------------------- 回憶扭蛋 */

/** 回憶扭蛋的卡片：左邊是扭蛋機，點了打開扭蛋機的動畫視窗；右邊是上一次抽到的回憶 */
function Gacha({ events, onOpen }: { events: TM.TMEvent[]; onOpen: (e: TM.TMEvent) => void }) {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const [pick, setPick] = useState<TM.TMEvent | null>(null);
  const [show, setShow] = useState(false);
  const open = () => setShow(true);
  return (
    <View style={[cardStyle(t), s.box]}>
      <SectionTitle>{tr('tm.gacha')}</SectionTitle>
      <P muted style={{ fontSize: 13 }}>{tr('tm.gachaSub')}</P>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={tr('gacha.machine')}
          style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <Image source={GACHA.thumb} style={{ width: 122, height: 151 }} contentFit="contain" />
        </Pressable>
        <View style={{ flex: 1, gap: 8 }}>
          {pick ? (
            <Pressable onPress={() => onOpen(pick)} style={({ pressed }) => [{ gap: 3 }, pressed && { opacity: 0.8 }]} accessibilityRole="button">
              <Fan ev={pick} size={64} />
              <Text style={s.cardTitle} numberOfLines={2}>{pick.name}</Text>
              <Text style={s.cardDate}>{TM.fmtDay(pick.day, lang())}　·　{tr('common.photos', { n: pick.photos.length })}</Text>
              <Text style={s.link}>{tr('tm.view')} ›</Text>
            </Pressable>
          ) : <P muted style={{ fontSize: 13.5 }}>{tr('gacha.cardHint')}</P>}
          <Pressable onPress={open} style={({ pressed }) => [s.spinBtn, { backgroundColor: t.c.accentWash, borderColor: t.c.accent }, pressed && { opacity: 0.8 }]}
            accessibilityRole="button">
            <Text style={[s.spinText, { color: t.c.accentDeep }]}>{pick ? tr('tm.again') : tr('tm.spin')}</Text>
          </Pressable>
        </View>
      </View>
      <GachaStage visible={show} events={events} onClose={() => setShow(false)} onPicked={setPick}
        onOpenEvent={(e) => { setShow(false); onOpen(e); }} />
    </View>
  );
}

/* ---------------------------------------------------------------- 時光尺 */

function Ruler({ months, sel, onPick }: { months: { y: number; m: number; n: number }[]; sel: string | null; onPick: (y: number, m: number) => void }) {
  const t = useTheme();
  const s = useStyles();
  const ref = useRef<ScrollViewInstance>(null);
  const max = Math.max(1, ...months.map((x) => x.n));
  return (
    <View style={[cardStyle(t), s.box]}>
      <SectionTitle>{tr('tm.ruler')}</SectionTitle>
      <P muted style={{ fontSize: 13 }}>{tr('tm.rulerSub')}</P>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ paddingTop: 10, paddingRight: 6, alignItems: 'flex-end' }}>
        {months.map((x, i) => {
          const on = sel === `${x.y}-${x.m}`;
          const h = x.n ? 8 + Math.round(56 * Math.sqrt(x.n / max)) : 3;
          return (
            <Pressable key={`${x.y}-${x.m}`} onPress={() => onPick(x.y, x.m)} style={s.month} accessibilityRole="button"
              accessibilityLabel={`${TM.fmtMonth(x.y, x.m, lang(), true)} ${tr('common.photos', { n: x.n })}`}>
              <View style={s.barBox}>
                <View style={[s.bar, { height: h, backgroundColor: on ? t.c.accentDeep : x.n ? t.c.accent : t.c.line, opacity: on || !x.n ? 1 : 0.75 }]} />
              </View>
              <Text style={[s.monthText, on && { color: t.c.accentDeep }]}>{TM.fmtMonth(x.y, x.m, lang())}</Text>
              <Text style={s.yearText}>{x.m === 1 || i === 0 || i === months.length - 1 ? x.y : ' '}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ---------------------------------------------------------------- 回憶雲 */

function Cloud({ items, onPick }: { items: { label: string; q: string; n: number }[]; onPick: (q: string) => void }) {
  const t = useTheme();
  const s = useStyles();
  const max = Math.max(1, ...items.map((x) => x.n));
  return (
    <View style={[cardStyle(t), s.box]}>
      <SectionTitle>{tr('tm.cloud')}</SectionTitle>
      <P muted style={{ fontSize: 13 }}>{tr('tm.cloudSub')}</P>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
        {items.map((x, i) => {
          const k = x.n / max;
          return (
            <Pressable key={x.label} onPress={() => onPick(x.q)} accessibilityRole="button"
              style={({ pressed }) => [s.bubble, { backgroundColor: t.c.ic[i % 4], transform: [{ rotate: t.tilt ? `${[-2, 1.5, -1, 2][i % 4]}deg` : '0deg' }, { scale: pressed ? 0.95 : 1 }] }]}>
              <Text style={[s.bubbleText, { fontSize: 13 + Math.round(8 * k) }]}>{x.label}</Text>
              <Text style={s.bubbleN}>{x.n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- 畫面 */

export default function Search() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const version = useApp((x) => x.version);
  const [photos, setPhotos] = useState<TM.TMPhoto[] | null>(null);
  const [q, setQ] = useState('');
  const [ex, setEx] = useState(0);
  const [open, setOpen] = useState<TM.TMEvent | null>(null);
  const [limit, setLimit] = useState(30);
  const spin = useRef(new Animated.Value(0)).current;
  const input = useRef<TextInputInstance>(null);

  useFocusEffect(useCallback(() => {
    DB.savedByFolder().then((rows) => setPhotos(rows.map((r) => ({ id: r.file_id, name: r.name, folder: r.folder, at: r.modified || '', kind: r.kind }))))
      .catch(() => setPhotos([]));
  }, [version]));
  // 輸入框裡的例子輪流換
  useEffect(() => {
    if (q) return;
    const id = setInterval(() => setEx((i) => (i + 1) % TM.EXAMPLES.length), 2600);
    return () => clearInterval(id);
  }, [q]);

  const events = useMemo(() => TM.buildEvents(photos || []), [photos]);
  const parsed = useMemo(() => TM.parseQuery(q), [q]);
  const active = q.trim() !== '' && TM.hasQuery(parsed);
  const result = useMemo(() => (active ? TM.search(events, parsed) : { events: [], ignored: [] }), [active, events, parsed]);
  const near = useMemo(() => (active && !result.events.length ? TM.nearest(events, parsed) : []), [active, result, events, parsed]);
  const months = useMemo(() => TM.months(events), [events]);
  const cloud = useMemo(() => TM.cloud(events, lang()), [events]);
  const otd = useMemo(() => TM.onThisDay(events), [events]);
  const sel = parsed.tokens.find((x) => x.t === 'month') as { y: number; m: number } | undefined;

  // 時光機的指針：每次換搜尋就轉一圈
  useEffect(() => {
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    setLimit(30);
  }, [q, spin]);

  const go = (text: string) => { setQ(text); input.current?.blur(); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/album'));
  const L = lang();

  return (
    <Paper>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={back} /></View>
        <H1>{tr('tm.title')}</H1>
        <P muted style={{ marginTop: -6 }}>{tr('tm.sub')}</P>

        {/* 時光機的面板 */}
        <View style={[cardStyle(t), s.dial]}>
          <Clock spin={spin} />
          <TextInput ref={input} value={q} onChangeText={setQ} placeholder={tr('tm.try', { ex: TM.EXAMPLES[ex][L] })} placeholderTextColor={t.c.muted}
            style={s.input} returnKeyType="search" autoCorrect={false} accessibilityLabel={tr('tm.title')} />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('tm.clear')} style={s.clear}>
              <Icon name="x" size={18} color={t.c.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* 時光機聽懂了什麼 */}
        {active ? (
          <View style={s.tokens}>
            <Text style={s.tokLabel}>{tr('tm.setting')}</Text>
            {parsed.tokens.filter((x) => !(x.t === 'word' && result.ignored.includes(x.w))).map((x, i) => (
              <View key={i} style={[s.tok, x.t !== 'word' && { backgroundColor: t.c.accentWash, borderColor: t.c.accent }]}>
                <Text style={[s.tokText, x.t !== 'word' && { color: t.c.accentDeep }]}>{TM.tokenLabel(x, L)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {active && result.ignored.length ? <Text style={s.ignored}>{tr('tm.ignored', { w: result.ignored.join('、') })}</Text> : null}

        {photos && !events.length ? <Empty title={tr('tm.title')} body={tr('tm.noData')} /> : null}

        {/* 結果 */}
        {active ? (
          result.events.length ? (
            <>
              <Text style={s.summary}>{TM.summary(result.events, L)}</Text>
              {result.events.slice(0, limit).map((e, i) => (
                <EventCard key={e.folder} ev={e} onOpen={() => setOpen(e)}
                  badge={i === 0 && parsed.first ? tr('tm.first') : i === 0 && parsed.latest ? tr('tm.latest') : undefined} />
              ))}
              {result.events.length > limit ? <Link title={`＋ ${result.events.length - limit}`} onPress={() => setLimit((n) => n + 30)} style={{ textAlign: 'center' }} /> : null}
            </>
          ) : events.length ? (
            <View style={[cardStyle(t), s.box, { alignItems: 'center' }]}>
              <Text style={s.emptyMoon}>{t.id === 'starry' ? '☾' : '✧'}</Text>
              <Text style={s.cardTitle}>{tr('tm.empty')}</Text>
              <P muted style={{ textAlign: 'center', fontSize: 13 }}>{tr('tm.emptyBody')}</P>
              {near.length ? (
                <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 10 }}>
                  <Text style={[s.summary, { textAlign: 'center' }]}>{tr('tm.nearest')}</Text>
                  {near.map((e) => <EventCard key={e.folder} ev={e} onOpen={() => setOpen(e)} />)}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                {cloud.slice(0, 6).map((c) => (
                  <Pressable key={c.label} onPress={() => go(c.q)} style={[s.tok, { backgroundColor: t.c.card2 }]} accessibilityRole="button">
                    <Text style={s.tokText}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        ) : events.length ? (
          <>
            {/* 那年的今天 */}
            {otd.slice(0, 2).map((g) => (
              <View key={g.years} style={{ gap: 8 }}>
                <View style={s.otdHead}>
                  <Icon name="spark" size={18} color={t.c.accent} />
                  <Text style={s.otdTitle}>{TM.yearsAgo(g.years, L)}</Text>
                </View>
                {g.events.slice(0, 3).map((e) => <EventCard key={e.folder} ev={e} onOpen={() => setOpen(e)} />)}
              </View>
            ))}
            <Gacha events={events} onOpen={setOpen} />
            {months.length > 1 ? <Ruler months={months} sel={sel ? `${sel.y}-${sel.m}` : null} onPick={(y, m) => go(`${y}/${m}`)} /> : null}
            {cloud.length ? <Cloud items={cloud} onPick={go} /> : null}
          </>
        ) : null}
      </ScrollView>
      <EventSheet ev={open} onClose={() => setOpen(null)} />
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  return StyleSheet.create({
    scroll: { padding: 16, paddingTop: 14, paddingBottom: 48, gap: 12 },
    dial: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 10, borderRadius: 999,
      ...(t.id === 'starry' ? { backgroundImage: 'linear-gradient(110deg, #2D2F66, #222B54)' } : null),
    } as ViewStyle,
    input: { ...t.round, flex: 1, minWidth: 0, fontSize: 17, color: c.ink, paddingVertical: Platform.OS === 'ios' ? 12 : 8, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) } as ViewStyle,
    clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    tokens: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    tokLabel: { ...t.round, fontSize: 12.5, color: c.muted, marginRight: 2 },
    tok: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.card2 },
    tokText: { ...t.round, fontSize: 13.5, color: c.ink2 },
    ignored: { ...t.round, fontSize: 12.5, color: c.muted, marginTop: -4 },
    summary: { ...t.round, fontSize: 13, color: c.muted, marginTop: 2 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 14 },
    cardTitle: { ...t.title, fontSize: 17, lineHeight: 24, color: c.ink },
    cardDate: { ...t.round, fontSize: 13, color: c.accentDeep },
    cardSub: { ...t.round, fontSize: 12, color: c.muted },
    chev: { ...t.round, fontSize: 24, color: c.muted },
    badge: { alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, transform: [{ rotate: t.tilt ? '-3deg' : '0deg' }] },
    badgeText: { ...t.round, fontSize: 12, color: c.onAccent },
    sheetTitle: { ...t.title, fontSize: 24, lineHeight: 32, color: c.headTitle },
    play: { position: 'absolute', left: 6, bottom: 4, color: '#fff', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
    box: { padding: 16, gap: 4 },
    otdHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    otdTitle: { ...t.title, fontSize: 18, color: c.chapTitle },
    spinBtn: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1.5, paddingVertical: 9, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
    spinText: { ...t.round, fontSize: 15 },
    link: { ...t.round, fontSize: 14, color: c.accentDeep, marginTop: 2 },
    // 時光尺
    month: { width: 46, alignItems: 'center', gap: 4, paddingBottom: 2 },
    barBox: { height: 66, justifyContent: 'flex-end' },
    bar: { width: 16, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
    monthText: { ...t.round, fontSize: 12, color: c.ink2 },
    yearText: { ...t.round, fontSize: 10, color: c.muted },
    // 回憶雲
    bubble: { flexDirection: 'row', alignItems: 'baseline', gap: 5, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999 },
    bubbleText: { ...t.round, color: t.dark ? '#EEF0FF' : c.ink },
    bubbleN: { ...t.round, fontSize: 11, color: t.dark ? '#C9CCF0' : c.muted },
    emptyMoon: { fontSize: 34, color: c.accent, marginBottom: 2 },
  });
});
