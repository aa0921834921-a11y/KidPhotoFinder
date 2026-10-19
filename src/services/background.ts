/**
 * 每天自動檢查：交給系統排程（iOS 通常在晚上充電時、Android 大約每天一次）。
 * 背景時間有限，時間快到會先收尾，下次接著做；新照片存好後會跳通知。
 */
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getSettings } from './db';
import { requestStop, runScan } from './scanner';

export const DAILY_TASK = 'kidphoto-daily-scan';

TaskManager.defineTask(DAILY_TASK, async () => {
  const sub = BackgroundTask.addExpirationListener(() => requestStop(true));
  try {
    const s = await getSettings();
    if (!s.autoDaily || !s.folderId || !s.onboarded) return BackgroundTask.BackgroundTaskResult.Success;
    // iOS 背景時間不固定：留一點時間給「判斷 + 存相簿」
    await runScan('background', Platform.OS === 'ios' ? 8 * 60 * 1000 : 20 * 60 * 1000);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    sub.remove();
  }
});

export async function syncSchedule(enabled: boolean) {
  const registered = await TaskManager.isTaskRegisteredAsync(DAILY_TASK);
  if (enabled && !registered) await BackgroundTask.registerTaskAsync(DAILY_TASK, { minimumInterval: 12 * 60 });
  if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(DAILY_TASK);
}

export async function backgroundAvailable(): Promise<boolean> {
  return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
}

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: '新照片', importance: Notifications.AndroidImportance.DEFAULT });
  }
}

export async function askNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}
