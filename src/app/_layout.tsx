import '../services/background'; // 背景工作要在最一開始就定義
import { useFonts } from 'expo-font';
import { router, Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setupNotifications } from '../services/background';
import { getSettings } from '../services/db';
import { refreshCounts } from '../services/scanner';
import { loadTheme, useTheme } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const [fonts] = useFonts({ Huninn: require('../../assets/fonts/jf-openhuninn-2.1.ttf') });
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const t = useTheme();
  useEffect(() => {
    (async () => {
      await loadTheme().catch(() => {});
      await setupNotifications().catch(() => {});
      const s = await getSettings();
      setOnboarded(s.onboarded);
      await refreshCounts().catch(() => {});
      setReady(true);
    })();
  }, []);
  useEffect(() => { if (fonts && ready) SplashScreen.hideAsync().catch(() => {}); }, [fonts, ready]);
  useEffect(() => { if (fonts && ready && !onboarded) setTimeout(() => router.replace('/onboarding'), 0); }, [fonts, ready, onboarded]);
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
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
