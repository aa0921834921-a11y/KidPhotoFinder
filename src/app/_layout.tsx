import '../services/background'; // 背景工作（也在 index.ts 先定義好了，這裡保險再載一次）
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadLang } from '../i18n';
import { healSchedule, setupNotifications, syncSchedule } from '../services/background';
import { getSettings } from '../services/db';
import { flushDigest } from '../services/notices';
import { refreshCounts } from '../services/scanner';
import { loadTheme, useTheme } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** 從通知直接打開「新照片」頁時，按返回會回到首頁 */
export const unstable_settings = { initialRouteName: '(tabs)' };

/** 一般通知（iOS、舊版 App）上記著要打開的頁面：kidphotofinder://new → /new */
function openFromNotification(r: Notifications.NotificationResponse | null) {
  const url = r?.notification.request.content.data?.url;
  if (typeof url !== 'string' || !url.startsWith('kidphotofinder://')) return;
  Notifications.clearLastNotificationResponseAsync().catch(() => {});
  router.push(url.replace('kidphotofinder://', '/'));
}

export default function Root() {
  const [fonts] = useFonts({ Huninn: require('../../assets/fonts/jf-openhuninn-2.1.ttf') });
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const t = useTheme();
  useEffect(() => {
    (async () => {
      await loadLang().catch(() => {}); // 先讀語言，畫面一出來就是對的語言
      await loadTheme().catch(() => {});
      await setupNotifications().catch(() => {});
      const s = await getSettings();
      setOnboarded(s.onboarded);
      await refreshCounts().catch(() => {});
      setReady(true);
      // 自動找新照片的間隔跟設定一致（舊版是一天一次）；早上打開 App 時，晚上找到的新照片也一起通知
      // 自動檢查的「下一次」如果沒排上（例如上次超過系統時間被停掉），順便重新排好
      syncSchedule().then(() => healSchedule()).catch(() => {});
      flushDigest().catch(() => {});
    })();
  }, []);
  useEffect(() => { if (fonts && ready) SplashScreen.hideAsync().catch(() => {}); }, [fonts, ready]);
  // 回到 App 時也看一下自動檢查有沒有在跑
  useEffect(() => {
    const sub = AppState.addEventListener('change', (v) => { if (v === 'active') healSchedule().catch(() => {}); });
    return () => sub.remove();
  }, []);
  useEffect(() => { if (fonts && ready && !onboarded) setTimeout(() => router.replace('/onboarding'), 0); }, [fonts, ready, onboarded]);
  useEffect(() => {
    if (!fonts || !ready || !onboarded || Platform.OS === 'web') return;
    try { openFromNotification(Notifications.getLastNotificationResponse()); } catch {}
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => sub.remove();
  }, [fonts, ready, onboarded]);
  if (!fonts || !ready) return null;
  const bg = t.id === 'book' ? '#C99A70' : t.c.bg;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaProvider>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="viewer" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="logs" options={{ presentation: 'modal' }} />
          <Stack.Screen name="clean" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new" />
          <Stack.Screen name="notify" />
          <Stack.Screen name="check" />
          <Stack.Screen name="search" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
