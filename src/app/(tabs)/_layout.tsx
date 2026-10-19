/**
 * 下方五個分頁。用 expo-router 的「自己排版」分頁，才能做：
 * - 每個主題不一樣的分頁列（翻頁故事書是書籤）
 * - 翻頁故事書：換分頁時舊的那頁從書脊掀起來翻走，下面露出新的一頁；在頁面上左右滑也會翻頁
 * - 其他主題：新的分頁輕輕淡入
 */
import { TabList, Tabs, TabSlot, TabTrigger, useTabTrigger, type TabsDescriptor, type TabsSlotRenderOptions } from 'expo-router/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../../services/state';
import { Backdrop, Icon, InTabs, NightGlow, type IconName } from '../../ui/kit';
import { useTheme, type Theme } from '../../ui/theme';

const TABS: { name: string; href: string; title: string; icon: IconName }[] = [
  { name: 'index', href: '/', title: '首頁', icon: 'home' },
  { name: 'review', href: '/review', title: '確認', icon: 'check' },
  { name: 'album', href: '/album', title: '相簿', icon: 'album' },
  { name: 'refs', href: '/refs', title: '參考照片', icon: 'face' },
  { name: 'settings', href: '/settings', title: '設定', icon: 'gear' },
];
const BOOKMARK = [['#F8CFC4', '#E8B0B0'], ['#CFE0B8', '#A3BD9D'], ['#F4D29E', '#E2B07C'], ['#D4E5EE', '#A9C6DC'], ['#E3D4EE', '#BDAED3']];

const FLIP_MS = 620;
const FADE_MS = 240;

/** 目前、上一個分頁（用來決定往哪邊翻） */
type Nav = { cur: number; prev: number };

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion = v; }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { reduceMotion = v; });

/* ---------------------------------------------------------------- 一個分頁的畫面 */

function Scene({ index, focused, nav, theme, children }: { index: number; focused: boolean; nav: React.MutableRefObject<Nav>; theme: Theme; children: React.ReactNode }) {
  const book = theme.id === 'book';
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0); // 0 = 沒有在翻；1 = 往後翻（掀到左邊）；-1 = 往前翻
  const lift = useRef(new Animated.Value(0)).current; // 翻走的進度 0→1
  const shade = useRef(new Animated.Value(0)).current; // 新的一頁剛露出來時書脊那邊的陰影
  const fade = useRef(new Animated.Value(1)).current; // 一般主題的淡入
  const [shadeDir, setShadeDir] = useState<1 | -1>(1);
  const was = useRef(focused);

  useEffect(() => {
    if (was.current === focused) return;
    was.current = focused;
    const anim = !reduceMotion;
    if (!focused) {
      if (book && anim) {
        const dir = nav.current.cur > index ? 1 : -1;
        setLeaving(dir);
        lift.setValue(0);
        Animated.timing(lift, { toValue: 1, duration: FLIP_MS, easing: Easing.bezier(0.5, 0.05, 0.4, 1), useNativeDriver: true })
          .start(({ finished }) => { if (finished) setLeaving(0); });
      }
      return;
    }
    // 又回到這一頁（例如連按兩次）：停掉還在翻的動畫，並把頁面「放回原位」。
    // Android 用原生動畫時，拿掉樣式不會還原數值（會一直是透明、轉走的），所以一定要明確設回 0。
    lift.stopAnimation();
    lift.setValue(0);
    setLeaving(0);
    if (!anim) return;
    if (book) {
      setShadeDir(nav.current.prev < index ? 1 : -1);
      shade.setValue(1);
      Animated.timing(shade, { toValue: 0, duration: FLIP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else {
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [focused, book, index, nav, lift, shade, fade]);

  const visible = focused || leaving !== 0;
  const style: Animated.WithAnimatedValue<ViewStyle>[] = [StyleSheet.absoluteFill, { display: visible ? 'flex' : 'none', zIndex: leaving ? 2 : focused ? 1 : 0 }];
  // 動畫用的樣式一直掛著（不要時有時無）：Android 原生動畫在樣式被拿掉後會留著最後的數值，頁面就會一直是空白的。
  if (book) {
    const dir = leaving === -1 ? -1 : 1;
    style.push({
      transformOrigin: dir === 1 ? 'left center' : 'right center',
      opacity: lift.interpolate({ inputRange: [0, 0.78, 1], outputRange: [1, 1, 0] }),
      transform: [
        { perspective: 1700 },
        { rotateY: lift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', dir === 1 ? '-104deg' : '104deg'] }) },
      ],
      ...(leaving ? { boxShadow: '0px 10px 28px rgba(60,35,22,0.3)' } : null),
    } as any);
  } else {
    style.push({ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] });
  }

  return (
    <Animated.View style={style} pointerEvents={leaving ? 'none' : 'auto'} accessibilityElementsHidden={!focused} importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}>
      {children}
      {book && focused ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          opacity: shade, borderRadius: 8,
          backgroundImage: `linear-gradient(${shadeDir === 1 ? 90 : 270}deg, rgba(60,35,22,0.38) 0%, rgba(60,35,22,0) 75%)`,
        } as any]} />
      ) : null}
      {leaving ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          borderRadius: 8,
          opacity: lift.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 0.6] }),
          backgroundImage: `linear-gradient(${leaving === 1 ? 90 : 270}deg, rgba(70,40,25,0.42) 0%, rgba(70,40,25,0.05) 60%, rgba(255,255,255,0.15) 100%)`,
        } as any]} />
      ) : null}
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- 分頁列 */

function TornEdge({ width, color }: { width: number; color: string }) {
  const d = useMemo(() => {
    let p = 'M0 12 L0 6';
    for (let x = 0, i = 0; x < 390; x += 13, i++) {
      const y = [5, 3, 6, 4, 2, 5, 3, 6][i % 8];
      p += ` Q${x + 6.5} ${y - 2} ${x + 13} ${y}`;
    }
    return p + ' L390 12 Z';
  }, []);
  return (
    <Svg width={width} height={12} viewBox="0 0 390 12" preserveAspectRatio="none" style={{ position: 'absolute', top: -10, left: 0 }}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

function TabButton({ tab, i, theme, review }: { tab: (typeof TABS)[number]; i: number; theme: Theme; review: number }) {
  const { triggerProps } = useTabTrigger({ name: tab.name });
  const on = triggerProps.isFocused;
  const c = theme.c;
  const badge = tab.name === 'review' && review > 0 ? (review > 99 ? '99+' : String(review)) : '';

  if (theme.id === 'book') {
    const [a, b] = BOOKMARK[i];
    return (
      <Pressable onPress={triggerProps.onPress} onLongPress={triggerProps.onLongPress} style={{ flex: 1 }}
        accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tab.title + (badge ? `，${badge} 張待確認` : '')}>
        <View style={[st.bm, { height: on ? 68 : 54, backgroundImage: `linear-gradient(180deg, ${a}, ${b})` } as ViewStyle]}>
          <Text style={st.bmCh}>章節 {i + 1}</Text>
          <Text style={st.bmTitle} numberOfLines={1} adjustsFontSizeToFit>{tab.title}</Text>
        </View>
        {badge ? <View style={[st.badge, { top: -8, right: 4, borderColor: '#C99A70', backgroundColor: c.accent }]}><Text style={st.badgeText}>{badge}</Text></View> : null}
      </Pressable>
    );
  }

  const color = on ? (theme.id === 'starry' ? '#FFE2A3' : c.accentDeep) : c.muted;
  const pill: ViewStyle | null = !on ? null
    : theme.id === 'watercolor' ? { backgroundImage: 'radial-gradient(ellipse at 45% 55%, rgba(232,170,160,0.55) 0%, rgba(244,200,190,0.35) 55%, rgba(244,200,190,0) 72%)' } as ViewStyle
      : theme.id === 'starry' ? { backgroundColor: 'rgba(244,201,107,0.14)', boxShadow: '0px 0px 18px rgba(244,201,107,0.22)' } as ViewStyle
        : theme.id === 'candy' ? { backgroundColor: c.accent, boxShadow: '0px 3px 0px #C23E73' } as ViewStyle
          : { backgroundColor: c.accentWash };
  return (
    <Pressable onPress={triggerProps.onPress} onLongPress={triggerProps.onLongPress} style={st.item}
      accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tab.title + (badge ? `，${badge} 張待確認` : '')}>
      <View style={[st.pill, pill]}>
        <Icon name={tab.icon} size={23} color={theme.id === 'candy' && on ? '#FFFFFF' : color} />
      </View>
      <Text style={[st.label, theme.round, { color }]} numberOfLines={1}>{tab.title}</Text>
      {badge ? (
        <View style={[st.badge, { borderColor: c.tab === 'transparent' ? c.bg : c.tab, backgroundColor: theme.id === 'candy' ? '#FFC94D' : theme.id === 'minimal' ? '#D2513F' : c.accent }]}>
          <Text style={[st.badgeText, { color: theme.id === 'candy' ? '#5A3C00' : theme.id === 'starry' ? '#2B2008' : '#FFFFFF' }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function TabBar({ theme, height, padBottom }: { theme: Theme; height: number; padBottom: number }) {
  const review = useApp((s) => s.counts.review);
  const { width } = useWindowDimensions();
  const c = theme.c;
  const book = theme.id === 'book';
  const look: ViewStyle = book ? { backgroundColor: 'transparent', paddingHorizontal: 18, gap: 5, paddingTop: 0 }
    : theme.id === 'watercolor' ? { backgroundColor: c.tab, boxShadow: '0px -4px 14px rgba(120,80,50,0.07)' } as ViewStyle
      : theme.id === 'starry' ? { backgroundColor: c.tab, borderTopWidth: 1, borderTopColor: c.tabLine, boxShadow: '0px -10px 30px rgba(0,0,0,0.35)' } as ViewStyle
        : theme.id === 'candy' ? { backgroundColor: c.tab, borderTopWidth: 2, borderTopColor: c.tabLine }
          : { backgroundColor: c.tab, borderTopWidth: 1, borderTopColor: c.tabLine };
  return (
    <View style={[st.bar, { height, paddingBottom: padBottom }, look]}>
      {theme.id === 'watercolor' ? <TornEdge width={width} color={c.tab} /> : null}
      {TABS.map((tab, i) => <TabButton key={tab.name} tab={tab} i={i} theme={theme} review={review} />)}
    </View>
  );
}

/* ---------------------------------------------------------------- 放分頁畫面的地方（故事書會加木框、可以左右滑） */

function Stage({ theme, stageStyle, nav, children }: { theme: Theme; stageStyle: ViewStyle; nav: React.MutableRefObject<Nav>; children: React.ReactNode }) {
  const book = theme.id === 'book';
  const { switchTab } = useTabTrigger({ name: TABS[0].name });
  const step = useCallback((d: number) => {
    const i = nav.current.cur + d;
    if (i >= 0 && i < TABS.length) switchTab(TABS[i].name, {});
  }, [nav, switchTab]);
  const pan = usePanGesture({
    enabled: book,
    activeOffsetX: [-28, 28],
    failOffsetY: [-16, 16],
    runOnJS: true,
    onDeactivate: (e) => {
      if (Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 650) step(e.translationX < 0 ? 1 : -1);
    },
  });
  return (
    <>
      {book ? (
        <View pointerEvents="none" style={[st.frame, {
          top: (stageStyle.top as number) - 9, left: (stageStyle.left as number) - 9, right: (stageStyle.right as number) - 9, bottom: (stageStyle.bottom as number) - 9,
        }]} />
      ) : null}
      <View style={[st.stage, stageStyle, book && st.stageBook]}>
        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }} collapsable={false}>{children}</View>
        </GestureDetector>
      </View>
    </>
  );
}

/* ---------------------------------------------------------------- 版面 */

export default function TabsLayout() {
  const theme = useTheme();
  const ins = useSafeAreaInsets();
  const book = theme.id === 'book';
  const nav = useRef<Nav>({ cur: 0, prev: 0 });

  const barPad = Math.max(ins.bottom, 8);
  const barH = book ? 76 + Math.max(ins.bottom - 12, 0) : 58 + barPad;
  const stageStyle: ViewStyle = book
    ? { position: 'absolute', top: ins.top + 14, left: 14, right: 14, bottom: barH }
    : { position: 'absolute', top: 0, left: 0, right: 0, bottom: barH };

  // theme 放進 render 的依賴：換主題時每一頁會重新排版
  const render = useCallback((descriptor: TabsDescriptor, o: TabsSlotRenderOptions) => {
    // 用「書籤上的順序」當頁碼。o.index 是路由內部的順序（不一定跟書籤一樣），用它翻頁方向會錯
    const name = descriptor.route.name.replace(/\/index$/, '');
    const at = TABS.findIndex((t) => t.name === name);
    const index = at >= 0 ? at : o.index;
    if (o.isFocused && nav.current.cur !== index) nav.current = { prev: nav.current.cur, cur: index };
    if (!o.loaded && !o.isFocused) return null;
    return (
      <Scene key={descriptor.route.key} index={index} focused={o.isFocused} nav={nav} theme={theme}>
        {descriptor.render()}
      </Scene>
    );
  }, [theme]);

  return (
    <InTabs.Provider value>
      <Tabs style={{ flex: 1 }}>
        <Backdrop />
        <NightGlow />
        <Stage theme={theme} stageStyle={stageStyle} nav={nav}>
          <TabSlot renderFn={render} detachInactiveScreens={false} style={{ flex: 1 }} />
        </Stage>
        <TabList style={{ display: 'none' }}>
          {TABS.map((t) => <TabTrigger key={t.name} name={t.name} href={t.href as any} />)}
        </TabList>
        <TabBar theme={theme} height={barH} padBottom={book ? 0 : barPad} />
      </Tabs>
    </InTabs.Provider>
  );
}

const st = StyleSheet.create({
  stage: { overflow: 'visible' },
  stageBook: { borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  frame: {
    position: 'absolute', backgroundColor: '#A86F4E', borderWidth: 2, borderColor: '#8C5641',
    borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderTopRightRadius: 18, borderBottomRightRadius: 18,
    boxShadow: '0px 8px 0px #77482F, 0px 16px 26px rgba(60,35,22,0.42)',
  } as ViewStyle,
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, paddingHorizontal: 6, zIndex: 20 },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  pill: { width: 56, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11.5 },
  badge: { position: 'absolute', top: -4, left: '50%', marginLeft: 8, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  bm: {
    marginTop: 7, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1,
    borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(110,70,50,0.2)', paddingHorizontal: 2,
    boxShadow: 'inset 0px 9px 8px -6px rgba(110,70,50,0.32), 0px 3px 5px rgba(80,50,35,0.22)',
  } as ViewStyle,
  bmCh: { fontFamily: 'Huninn', fontSize: 10, color: '#5E3F33', opacity: 0.8 },
  bmTitle: { fontFamily: 'Huninn', fontSize: 13, color: '#5E3F33' },
});
