/**
 * 自動找新照片：交給系統排程，大約每 15／30／60 分鐘（家長選的）在背景看一次老師的資料夾。
 * - 平常只問「有沒有新檔案」，幾秒就好；有新照片才下載、找臉、存進相簿，然後跳通知
 * - 背景時間有限（Android 一次最多 10 分鐘），時間快到會先收尾，下次接著做
 * - Android 在 App 開著的時候不會跑（打開 App 時本來就會看到最新的照片）
 * - iOS 由系統決定什麼時候跑，可能會比較久才跑一次
 */
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import * as FG from '../../modules/kpf-foreground';
import { loadLang, onLangChange, tr } from '../i18n';
import { bgLog, getMeta, getSettings, logBg, now, parseLocal, setMeta } from './db';
import { askNotificationPermission, flushDigest, localizeChannel } from './notices';
import { checkEvery } from './notifyPrefs';
import { requestStop, runScan } from './scanner';

export { askNotificationPermission };

export const DAILY_TASK = 'kidphoto-daily-scan';

/**
 * 背景一次最多整理多久。Android 系統最多給 10 分鐘，而且超過的話「下一次自動檢查」會排不上
 * （要等打開 App 才會恢復），所以多留一點時間給最後的判斷和存照片。
 */
const BUDGET_MS = 6 * 60 * 1000;

TaskManager.defineTask(DAILY_TASK, async () => {
  const sub = BackgroundTask.addExpirationListener(() => requestStop(true));
  const at = now(), t0 = Date.now();
  // 先記「開始了」：如果後面被系統中途停掉，執行紀錄看得出來
  await logBg({ at, r: 'start' }).catch(() => {});
  try {
    // 背景執行時畫面沒有打開：先讀家長選的語言，通知才會是對的語言
    await loadLang().catch(() => {});
    const s = await getSettings();
    if (!s.autoDaily || !s.folderId || !s.onboarded) {
      await logBg({ at, r: 'off' }).catch(() => {});
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    // 早上：晚上找到的新照片一次告訴家長
    await flushDigest().catch(() => {});
    const r = await runScan('background', BUDGET_MS);
    const sec = Math.round((Date.now() - t0) / 1000);
    await logBg(r.busy ? { at, r: 'busy', sec } : r.idle ? { at, r: 'idle', sec } : { at, r: 'scan', n: r.scanned, sec }).catch(() => {});
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    await logBg({ at, r: 'error', sec: Math.round((Date.now() - t0) / 1000) }).catch(() => {});
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    sub.remove();
  }
});

/**
 * 依設定排好（或取消）自動檢查。打開 App、改設定、首次設定完成時都會呼叫；
 * 間隔改了才重新排（重新排會從現在開始重新計時）。
 */
export async function syncSchedule(): Promise<void> {
  const s = await getSettings();
  const on = s.autoDaily && s.onboarded && !!s.folderId;
  const every = checkEvery(s.freq);
  const tasks = await TaskManager.getRegisteredTasksAsync().catch(() => [] as TaskManager.TaskManagerTask[]);
  const cur = tasks.find((x) => x.taskName === DAILY_TASK);
  if (!on) {
    if (cur) await BackgroundTask.unregisterTaskAsync(DAILY_TASK);
    return;
  }
  const curEvery = Number((cur?.options as { minimumInterval?: number } | undefined)?.minimumInterval || 0);
  if (cur && curEvery === every) return;
  await arm(every, !!cur);
}

async function arm(every: number, registered: boolean) {
  if (registered) await BackgroundTask.unregisterTaskAsync(DAILY_TASK);
  await BackgroundTask.registerTaskAsync(DAILY_TASK, { minimumInterval: every });
  await setMeta('bg_armed_at', String(Date.now())).catch(() => {});
}

/** 自動檢查應該多久會跑一次（分鐘）：間隔的兩倍再多半小時還沒跑，就當作沒在跑 */
export const staleAfterMin = (every: number) => every * 2 + 30;

/**
 * 自動檢查的「下一次」排不上時（例如某一次超過系統的 10 分鐘被停掉），重新排好。
 * 打開 App、回到 App 時呼叫；一小時最多重排一次。回傳 true 代表剛剛重排了。
 */
export async function healSchedule(): Promise<boolean> {
  const s = await getSettings();
  if (!s.autoDaily || !s.onboarded || !s.folderId) return false;
  const every = checkEvery(s.freq);
  const log = await bgLog();
  const last = log.length ? parseLocal(log[log.length - 1].at).getTime() : 0;
  const armed = Number((await getMeta('bg_armed_at')) || 0);
  if (Date.now() - Math.max(last, armed) < staleAfterMin(every) * 60e3) return false;
  const healed = Number((await getMeta('bg_heal_at')) || 0);
  if (Date.now() - healed < 60 * 60e3) return false;
  await setMeta('bg_heal_at', String(Date.now()));
  const tasks = await TaskManager.getRegisteredTasksAsync().catch(() => [] as TaskManager.TaskManagerTask[]);
  await arm(every, tasks.some((x) => x.taskName === DAILY_TASK));
  return true;
}

export async function backgroundAvailable(): Promise<boolean> {
  return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
}

/** 通知分類的名字（手機「設定 → 通知」裡看得到）跟著 App 的語言 */
async function localizeChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: tr('notif.channel'), importance: Notifications.AndroidImportance.DEFAULT });
  FG.setChannel(tr('notif.fgChannel'), tr('notif.fgChannelDesc'));
  localizeChannel();
}
onLangChange(() => { localizeChannels().catch(() => {}); });

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  await localizeChannels();
}
