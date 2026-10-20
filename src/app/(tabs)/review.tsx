import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { THRESHOLDS } from '../../core/decide';
import { sp, tr, useLang } from '../../i18n';

/** 小標籤裡的字不要被拆到兩行 */
const chip = (x: string) => ` ${x} `.replace(/ /g, '\u00A0');
import * as DB from '../../services/db';
import { refreshCounts, scheduleApply } from '../../services/scanner';
import { useApp } from '../../services/state';
import { FaceCard } from '../../ui/FaceCard';
import { Btn, Card, cardStyle, Empty, H2, HeadCard, Icon, Link, P, Paper, Seg, Stamp, Tape, useContentWidth } from '../../ui/kit';
import { makeStyles, useTheme, type Theme } from '../../ui/theme';
import { usePreview } from '../../ui/usePreview';

const PAGE_N = 24;
type Mark = 1 | -1 | 0; // 是 / 不是 / 跳過

/* ---------------------------------------------------------------- 一張一張看：可以左右滑的卡片 */

function SwipeCard({ item, left, onAnswer }: { item: DB.ReviewItem; left: number; onAnswer: (m: Mark) => void }) {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const w = useContentWidth(16);
  const cardW = Math.min(w - 50, 300);
  const photo = cardW - 20;
  const drag = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const moved = useRef(0); // 剛拖過卡片的時間：避免放手時又被當成「點一下」
  const ctx = usePreview(item.fileId, 256);

  useEffect(() => { drag.setValue(0); busy.current = false; }, [item.faceId, drag]);

  const fly = useCallback((m: Mark) => {
    if (busy.current) return;
    busy.current = true;
    Animated.timing(drag, { toValue: m === 0 ? 0 : m * 520, duration: m === 0 ? 1 : 230, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => onAnswer(m));
  }, [drag, onAnswer]);

  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    runOnJS: true,
    onActivate: () => { moved.current = Date.now(); },
    onUpdate: (e) => { if (!busy.current) drag.setValue(e.translationX); },
    onDeactivate: (e) => {
      moved.current = Date.now();
      if (busy.current) return;
      if (Math.abs(e.translationX) > 90 || Math.abs(e.velocityX) > 800) fly(e.translationX > 0 ? 1 : -1);
      else Animated.spring(drag, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
    },
  });

  const rotate = drag.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-18deg', '-2deg', '18deg'], extrapolate: 'clamp' });
  const yesOp = drag.interpolate({ inputRange: [0, 110], outputRange: [0, 1], extrapolate: 'clamp' });
  const noOp = drag.interpolate({ inputRange: [-110, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const rounded = t.id !== 'watercolor' && t.id !== 'book';

  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 6 }}>
      <View style={[s.tip, { alignSelf: 'stretch', alignItems: 'center' }]}>
        <Text style={s.tipText}>{tr('rv.swipeRight')}<Text style={[s.chip, { backgroundColor: t.c.yes }]}>{chip(`✓ ${tr('common.yes')}`)}</Text>{sp()}{tr('rv.swipeLeft')}<Text style={[s.chip, { backgroundColor: t.c.no }]}>{chip(`✕ ${tr('common.no')}`)}</Text></Text>
      </View>
      <View style={{ width: cardW, height: photo + 46 }}>
        <View style={[s.cardBack, { borderRadius: rounded ? 24 : 6 }]} />
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View style={[s.fcard, rounded && { borderRadius: t.id === 'candy' ? 26 : 24, paddingBottom: t.captions ? 36 : 10 }, t.id === 'candy' && s.fcardCandy,
            { transform: [{ translateX: drag }, { rotate }] }]}>
            <Tape i={0} />
            <Pressable onPress={() => { if (Date.now() - moved.current > 400 && !busy.current) router.push({ pathname: '/viewer', params: { id: item.fileId, face: String(item.faceId) } }); }} accessibilityLabel={tr('rv.viewWhole')}>
              <FaceCard faceId={item.faceId} size={photo} radius={rounded ? 18 : 0} />
            </Pressable>
            {t.captions ? <Text style={s.cap3} numberOfLines={1}>{item.folder.split('/').pop()}</Text> : null}
            <Animated.View style={[s.stamp, s.stampYes, { opacity: yesOp }]}><Text style={[s.stampText, { color: t.c.yes }]}>★ {tr('common.yes')}</Text></Animated.View>
            <Animated.View style={[s.stamp, s.stampNo, { opacity: noOp }]}><Text style={[s.stampText, { color: t.c.noDeep }]}>✕ {tr('common.no')}</Text></Animated.View>
          </Animated.View>
          </View>
        </GestureDetector>
      </View>
      <Pressable style={s.ctx} onPress={() => router.push({ pathname: '/viewer', params: { id: item.fileId, face: String(item.faceId) } })}>
        <View style={s.ctxImg}>{ctx ? <Image source={{ uri: ctx }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
        <Text style={s.ctxText}>{tr('rv.ctx', { n: left })}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
        <Btn kind="no" title={`✕ ${tr('common.no')}`} style={{ flex: 1 }} onPress={() => fly(-1)} />
        <Btn kind="yes" title={`★ ${tr('common.yes')}`} style={{ flex: 1 }} onPress={() => fly(1)} />
      </View>
      <Link title={tr('rv.skip')} color={t.c.muted} onPress={() => fly(0)} />
    </View>
  );
}

/* ---------------------------------------------------------------- 畫面 */

export default function Review() {
  const t = useTheme();
  const s = useStyles();
  useLang();
  const version = useApp((x) => x.version);
  const running = useApp((x) => x.running);
  const applying = useApp((x) => x.applying);
  const w = useContentWidth(16);
  const [items, setItems] = useState<DB.ReviewItem[]>([]);
  const [thr, setThr] = useState(0.48);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [mode, setMode] = useState<'page' | 'one'>('page');
  const [labeled, setLabeled] = useState<Awaited<ReturnType<typeof DB.labeledList>>>([]);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [busy, setBusy] = useState(false);
  const skipped = useRef(new Set<number>());

  const load = useCallback(async () => {
    const st = await DB.getSettings();
    const th = (THRESHOLDS[st.strictness] || THRESHOLDS.standard)[0];
    setThr(th);
    const list = await DB.decisionsList('review');
    // 跳過的放到最後
    list.sort((a, b) => Number(skipped.current.has(a.faceId)) - Number(skipped.current.has(b.faceId)));
    setItems(list);
    setMarks({});
    setLabeled(await DB.labeledList());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load, version]));

  const page = items.slice(0, PAGE_N);
  const cols = w > 560 ? 5 : 3;
  const gap = 10;
  const cell = Math.floor((w - (cols - 1) * gap) / cols);
  const lcols = w > 560 ? 6 : 4;
  const lcell = Math.floor((w - (lcols - 1) * 8) / lcols);

  const commit = async (pairs: [number, Mark][]) => {
    setBusy(true);
    try {
      for (const [id, m] of pairs) {
        if (m) await DB.setLabel(id, m);
        else skipped.current.add(id);
      }
      const done = new Set(pairs.map(([id]) => id));
      setItems((xs) => {
        const rest = xs.filter((x) => !done.has(x.faceId));
        const sk = xs.filter((x) => done.has(x.faceId) && skipped.current.has(x.faceId));
        return [...rest, ...sk];
      });
      setMarks({});
      scheduleApply();
      await refreshCounts();
      setLabeled(await DB.labeledList());
    } finally { setBusy(false); }
  };

  // 很像的先幫忙打勾
  const marksFull = useMemo(() => {
    const m = { ...marks };
    for (const it of page) if (m[it.faceId] === undefined) m[it.faceId] = it.score >= thr - 0.03 ? 1 : 0;
    return m;
  }, [marks, page, thr]);

  const cycle = (id: number) => setMarks((m) => {
    const cur = marksFull[id] ?? 0;
    return { ...marksFull, ...m, [id]: (cur === 0 ? 1 : cur === 1 ? -1 : 0) as Mark };
  });

  const undo = (minutes: number) => {
    DB.undoLabelsSince(minutes, true).then((n) => {
      if (!n) { Alert.alert(tr('rv.nothingTitle'), tr('rv.nothingBody', { min: minutes })); return; }
      Alert.alert(tr('rv.undoAskTitle'), tr('rv.undoAskBody', { n }), [
        { text: tr('common.cancel'), style: 'cancel' },
        { text: tr('rv.undoBtn'), style: 'destructive', onPress: async () => { await DB.undoLabelsSince(minutes); skipped.current.clear(); scheduleApply(); await refreshCounts(); load(); } },
      ]);
    });
  };

  const one = page[0];
  const nYes = page.filter((p) => marksFull[p.faceId] === 1).length;
  const nNo = page.filter((p) => marksFull[p.faceId] === -1).length;
  const showFoot = tab === 'todo' && mode === 'page' && items.length > 0;

  return (
    <Paper cap={tr('rv.cap')}>
      <ScrollView contentContainerStyle={[s.scroll, showFoot && { paddingBottom: 190 }]} showsVerticalScrollIndicator={false}>
        <HeadCard title={tr('rv.title')} sub={tr('rv.sub')}>
          <Seg style={{ marginTop: 12 }} value={tab} onChange={setTab}
            items={[{ k: 'todo', t: tr('rv.todo', { n: items.length }) }, { k: 'done', t: tr('rv.done', { n: labeled.length }) }]} />
        </HeadCard>

        {tab === 'todo' ? (
          !items.length ? (
            applying ? (
              // 剛按完儲存：背景正在用你的答案重新判斷，判斷完下一批會自動出現（不要先說「都確認完了」）
              <View style={[cardStyle(t), { padding: 22, alignItems: 'center', gap: 10 }]}>
                <ActivityIndicator color={t.c.accent} />
                <H2 style={{ fontSize: 17, textAlign: 'center' }}>{tr('rv.applyingTitle')}</H2>
                <P muted style={{ fontSize: 13, textAlign: 'center' }}>{tr('rv.applyingBody')}</P>
              </View>
            ) : (
              <Empty title={tr('rv.allDone')} body={running ? tr('rv.allDoneRunning') : tr('rv.allDoneIdle')} />
            )
          ) : (
            <>
              <View style={s.modes}>
                {(['page', 'one'] as const).map((k) => (
                  <Pressable key={k} onPress={() => setMode(k)} style={[s.modeBtn, mode === k && { backgroundColor: t.c.segOn }]} accessibilityRole="tab" accessibilityState={{ selected: mode === k }}>
                    <Text style={[s.modeText, mode === k && { color: t.c.segOnText }]}>{k === 'page' ? tr('rv.modePage') : tr('rv.modeOne')}</Text>
                  </Pressable>
                ))}
              </View>

              {mode === 'page' ? (
                <>
                  <View style={s.tip}>
                    <Text style={s.tipText}>
                      {tr('rv.tapToggle')}<Text style={[s.chip, { backgroundColor: t.c.yes }]}>{chip(`✓ ${tr('common.yes')}`)}</Text> → <Text style={[s.chip, { backgroundColor: t.c.no }]}>{chip(`✕ ${tr('common.no')}`)}</Text> → <Text style={[s.chip, { backgroundColor: t.c.skip }]}>{chip(tr('rv.unset'))}</Text>
                    </Text>
                    <Text style={s.tipSmall}>{tr('rv.tipSmall')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                    {page.map((it) => {
                      const m = marksFull[it.faceId] ?? 0;
                      return (
                        <Pressable key={it.faceId} onPress={() => cycle(it.faceId)} accessibilityLabel={m === 1 ? tr('common.yes') : m === -1 ? tr('common.no') : tr('rv.unsetA11y')}
                          onLongPress={() => router.push({ pathname: '/viewer', params: { id: it.fileId, face: String(it.faceId) } })}
                          style={({ pressed }) => pressed ? { transform: [{ scale: 0.95 }] } : null}>
                          <View style={[s.pf, { width: cell, height: cell }, m === 1 && { borderColor: t.c.yes }, m === -1 && { borderColor: t.c.no }]}>
                            <FaceCard faceId={it.faceId} size={cell - 14} radius={t.id === 'candy' ? 14 : 9} style={m === -1 ? { opacity: 0.55 } : undefined} />
                            {m === 1 ? <View style={s.mkYes}><Stamp yes size={28} /></View> : null}
                            {m === -1 ? <View style={s.mkNo}><Stamp yes={false} size={40} /></View> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : one ? (
                <SwipeCard item={one} left={items.length} onAnswer={(m) => commit([[one.faceId, m]])} />
              ) : null}
            </>
          )
        ) : (
          <>
            <Card tint={t.c.note} pad={16}>
              <H2 style={{ fontSize: 16 }}>{tr('rv.undoTitle')}</H2>
              <P muted style={{ fontSize: 13 }}>{tr('rv.undoBody')}</P>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Btn small kind="ghost" title={tr('rv.undo30')} onPress={() => undo(30)} style={{ flex: 1 }} icon={<Icon name="undo" size={17} />} />
                <Btn small kind="ghost" title={tr('rv.undo3h')} onPress={() => undo(180)} style={{ flex: 1 }} />
              </View>
            </Card>
            <P muted style={{ fontSize: 13, textAlign: labeled.length ? 'left' : 'center' }}>{labeled.length ? tr('rv.tapToChange') : tr('rv.noneLabeled')}</P>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {labeled.slice(0, 160).map((l) => (
                <Pressable key={l.face_id} onPress={async () => {
                  await DB.setLabel(l.face_id, l.label > 0 ? -1 : 1);
                  setLabeled(await DB.labeledList()); scheduleApply();
                }}>
                  <View style={[s.pf, s.pfSm, { width: lcell, height: lcell, borderColor: l.label > 0 ? t.c.yes : t.c.no }]}>
                    <FaceCard faceId={l.face_id} size={lcell - 12} radius={8} />
                    <View style={s.mkSm}><Stamp yes={l.label > 0} size={22} /></View>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {showFoot ? (
        <View style={s.foot} pointerEvents="box-none">
          <View style={[cardStyle(t), s.footc]}>
            <Text style={s.cnt}>
              <Text style={{ color: t.c.yes }}>{tr('rv.cntYes', { n: nYes })}</Text>{tr('rv.sep')}<Text style={{ color: t.c.noDeep }}>{tr('rv.cntNo', { n: nNo })}</Text>{tr('rv.sep')}{tr('rv.cntSkip', { n: page.length - nYes - nNo })}
            </Text>
            <Btn busy={busy} title={tr('rv.savePage')} onPress={() => commit(page.map((p) => [p.faceId, marksFull[p.faceId] ?? 0]))} />
            <Btn small kind="ghost" title={tr('rv.allNo')} onPress={() => commit(page.map((p) => [p.faceId, -1]))} />
          </View>
        </View>
      ) : null}
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  return StyleSheet.create({
    scroll: { padding: 16, paddingTop: t.id === 'book' ? 12 : 14, paddingBottom: 40, gap: 14 },
    modes: { flexDirection: 'row', alignSelf: 'flex-start', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.accentWash, borderWidth: 1, borderColor: c.line },
    modeBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 999 },
    modeText: { ...t.round, fontSize: 14, color: c.ink2 },
    tip: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c.dash, backgroundColor: c.card2 },
    tipText: { ...t.round, fontSize: 13, lineHeight: 24, color: c.ink2 },
    tipSmall: { ...t.round, fontSize: 12, lineHeight: 19, color: c.muted, marginTop: 2 },
    chip: { color: t.dark ? '#10162E' : '#FFFFFF', fontSize: 12, borderRadius: 99, overflow: 'hidden' },
    pf: {
      padding: 4, borderRadius: t.id === 'candy' ? 20 : 14, borderWidth: 3, borderColor: 'transparent', backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center',
      boxShadow: t.id === 'candy' ? '0px 4px 0px #F4CDE0' : t.dark ? 'none' : '0px 4px 10px rgba(138,103,68,0.14)',
    } as ViewStyle,
    pfSm: { padding: 3, borderRadius: 12 },
    mkYes: { position: 'absolute', right: 6, bottom: 6 },
    mkNo: { position: 'absolute', left: '50%', top: '50%', marginLeft: -20, marginTop: -20 },
    mkSm: { position: 'absolute', right: 3, bottom: 3 },

    foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 10 },
    footc: { padding: 12, gap: 8, boxShadow: t.dark ? '0px -6px 24px rgba(0,0,0,0.4)' : '0px 8px 22px rgba(138,103,68,0.22)' } as ViewStyle,
    cnt: { ...t.round, fontSize: 13, color: c.muted, textAlign: 'center' },

    cardBack: { position: 'absolute', left: 14, right: 14, top: 14, bottom: -6, backgroundColor: c.pol, transform: [{ rotate: '-4deg' }], opacity: 0.9, boxShadow: '0px 6px 14px rgba(0,0,0,0.12)' } as ViewStyle,
    fcard: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 10, paddingBottom: 36, backgroundColor: c.pol, borderRadius: 4, boxShadow: '0px 14px 28px rgba(80,50,30,0.26)' } as ViewStyle,
    fcardCandy: { boxShadow: '0px 6px 0px #F4CDE0, 0px 0px 0px 2px #F3D6E6' } as ViewStyle,
    cap3: { ...t.round, position: 'absolute', left: 0, right: 0, bottom: 9, textAlign: 'center', fontSize: 13, color: c.polCap },
    stamp: { position: 'absolute', top: 26, paddingVertical: 5, paddingHorizontal: 13, borderRadius: 12, borderWidth: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
    stampYes: { left: 20, borderColor: c.yes, transform: [{ rotate: '-14deg' }] },
    stampNo: { right: 20, borderColor: c.noDeep, transform: [{ rotate: '14deg' }] },
    stampText: { ...t.title, fontSize: 22 },
    ctx: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ctxImg: { width: 46, height: 46, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: c.pol, backgroundColor: c.line },
    ctxText: { ...t.round, fontSize: 12.5, color: c.muted },
  });
});
