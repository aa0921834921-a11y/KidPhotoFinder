/**
 * 新照片通知：老師一上傳、找到孩子的照片，手機就跳出孩子的笑臉。
 * - Android：通知裡有大張照片（以孩子的臉為中心裁切），還有「看照片」「傳給家人」兩個按鈕
 * - 同一批新照片只會有一則通知（有更多照片時更新那一則，不會一直疊）
 * - 通知時段以外（例如晚上）找到的先記著，早上一次告訴你（三張照片拼成一張）
 * - 以前就在資料夾裡的照片不會一張一張通知，全部整理完時說一聲
 * - iOS、舊版 App：一般的文字通知
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import * as FG from '../../modules/kpf-foreground';
import { bestPhotos, groupEvents, relBox } from '../core/events';
import { tr } from '../i18n';
import * as DB from './db';
import { kidName, quietNow } from './notifyPrefs';

export const NOTICE_ID = 4101; // 新照片
export const BACKLOG_ID = 4102; // 以前的照片整理好了
export const TEST_ID = 4199; // 範例通知
export const LINE_PKG = 'jp.naver.line.android';

const BATCH_KEY = 'ntf_batch';
const BACKLOG_KEY = 'backlog_saved';

/** 一批還沒看過的新照片（家長打開「新照片」頁之前，新找到的都算同一批） */
type Batch = { ids: string[]; since: string; seen: boolean; held: boolean };

async function getBatch(): Promise<Batch | null> {
  try {
    const b = JSON.parse((await DB.getMeta(BATCH_KEY)) || 'null');
    return b && Array.isArray(b.ids) ? b : null;
  } catch {
    return null;
  }
}
const setBatch = (b: Batch) => DB.setMeta(BATCH_KEY, JSON.stringify(b));

/** 照片在手機相簿裡的位置（舊資料可能只存數字 ID） */
const assetUri = (id: string) => (/^\d+$/.test(id) ? `content://media/external/images/media/${id}` : id);

/** 通知用的圖片放在暫存資料夾（每次先清掉舊的） */
function noticeDir(): Directory {
  const d = new Directory(Paths.cache, 'notify');
  try {
    if (d.exists) {
      for (const f of d.list()) if (f instanceof File) { try { f.delete(); } catch {} }
    } else {
      d.create({ intermediates: true });
    }
  } catch {}
  return d;
}

/* ---------------------------------------------------------------- 發通知 */

/** 沒有照片的通知（Android 用自己的通知分類；不支援時用一般通知） */
async function plain(id: number, title: string, body: string, url: string) {
  if (FG.richSupported() && FG.notify({
    id, channelName: tr('ntf.channel'), channelDescription: tr('ntf.channelDesc'), title, body, url, actionTitles: [], actionUrls: [],
  })) return;
  await Notifications.scheduleNotificationAsync({ identifier: `kpf-${id}`, content: { title, body, data: { url } }, trigger: null });
}

/**
 * 發出（或更新）一批新照片的通知。
 * style：new = 剛找到；morning = 晚上找到、早上一起說
 */
async function post(b: Batch, style: 'new' | 'morning', s: DB.Settings, id = NOTICE_ID): Promise<boolean> {
  const rows = await DB.photosInfo(b.ids);
  if (!rows.length) return false;
  const events = groupEvents(rows);
  const first = events[0];
  const n = rows.length;
  const who = kidName(s, await DB.getKids(), rows.map((r) => r.person || ''));
  // 老師這次一共上傳了幾張（有孩子的、沒有孩子的都算）
  const firstSeen = rows.map((r) => r.first_seen || r.at).sort()[0];
  const since = DB.localTime(new Date(DB.parseLocal(firstSeen).getTime() - 2 * 3600e3));
  const up = await DB.uploadedSince(events.map((e) => e.folder), since).catch(() => []);
  const total = Math.max(n, up.reduce((a, x) => a + x.n, 0));

  let title: string, body: string;
  if (style === 'morning') {
    const time = firstSeen.slice(11, 16);
    title = tr('ntf.mTitle', { who, n });
    body = events.length > 1 ? tr('ntf.mBodyN', { time, event: first.name, k: events.length }) : tr('ntf.mBody1', { time, event: first.name });
  } else {
    title = events.length > 1 ? tr('ntf.titleN', { who, n }) : tr('ntf.title1', { event: first.name, who, n });
    body = events.length > 1 ? tr('ntf.bodyN', { event: first.name, k: events.length, total }) : tr('ntf.body1', { total });
  }
  const url = `kidphotofinder://new?nid=${id}${id === TEST_ID ? '&test=1' : ''}`;

  if (FG.richSupported()) {
    let image: string | null = null, icon: string | null = null;
    if (s.notifyPhoto) {
      const best = bestPhotos(rows, style === 'morning' ? 3 : 1);
      if (best.length) {
        const dir = noticeDir();
        const stamp = Date.now();
        const big = style === 'morning' && best.length >= 2 ? best : best.slice(0, 1);
        image = await FG.compose({
          sources: big.map((p) => assetUri(p.asset_id)), boxes: big.flatMap(relBox),
          width: 720, height: 360, out: new File(dir, `big_${stamp}.jpg`).uri,
        });
        icon = await FG.compose({
          sources: [assetUri(best[0].asset_id)], boxes: relBox(best[0]),
          width: 192, height: 192, faceScale: 2.2, out: new File(dir, `icon_${stamp}.jpg`).uri,
        });
      }
    }
    const ok = FG.notify({
      id, channelName: tr('ntf.channel'), channelDescription: tr('ntf.channelDesc'), title, body, image, icon, url,
      actionTitles: [tr('ntf.view'), tr('ntf.share')], actionUrls: [url, `${url}&share=1`],
      publicTitle: s.lockHide ? tr('ntf.pubTitle', { who, n }) : null,
      publicBody: s.lockHide ? tr('ntf.pubBody') : null,
    });
    if (ok) return true;
    if (FG.canNotify() === false) return false; // 家長在系統設定把通知關掉了
  }
  await Notifications.scheduleNotificationAsync({ identifier: `kpf-${id}`, content: { title, body, data: { url } }, trigger: null });
  return true;
}

/* ---------------------------------------------------------------- 給整理流程用 */

/** 老師新上傳的照片存好了：發通知（通知時段以外先記著，早上再說） */
async function notifyNew(ids: string[], s: DB.Settings) {
  let b = await getBatch();
  // 家長已經看過，或是通知滑掉沒看、已經過了半天：重新算一批（不然數字會越疊越多）
  const stale = !!b && !b.held && Date.now() - DB.parseLocal(b.since).getTime() > 12 * 3600e3;
  if (!b || b.seen || stale) b = { ids: [], since: DB.now(), seen: false, held: false };
  b.ids = [...new Set([...b.ids, ...ids])];
  if (!s.notify) { await setBatch(b); return; }
  if (quietNow(s)) { b.held = true; await setBatch(b); return; }
  b.held = false;
  await setBatch(b);
  await post(b, 'new', s);
}

/**
 * 自動整理（背景）存好照片之後。
 * savedIds：這次存進相簿的照片；pendingLeft：還有幾張沒看過；review：等家長確認的張數
 */
export async function afterBackground(savedIds: string[], info: { pendingLeft: number; review: number }) {
  const s = await DB.getSettings();
  const fresh = savedIds.length ? await DB.freshAmong(savedIds) : new Set<string>();
  const freshIds = savedIds.filter((id) => fresh.has(id));
  if (freshIds.length) await notifyNew(freshIds, s).catch((e) => console.warn('notify failed', e));
  // 以前的照片：不一張一張通知，全部看完時說一聲
  let acc = Number((await DB.getMeta(BACKLOG_KEY)) || 0) + (savedIds.length - freshIds.length);
  if (acc > 0 && info.pendingLeft === 0 && !quietNow(s)) {
    if (s.notify) {
      await plain(BACKLOG_ID, tr('ntf.backlogTitle'), tr('ntf.backlogBody', { n: acc, album: s.albumName, review: info.review }), 'kidphotofinder://album')
        .catch(() => {});
    }
    acc = 0;
  }
  await DB.setMeta(BACKLOG_KEY, String(acc));
}

/** 在 App 裡按的整理做完了：如果家長已經切到別的 App，通知一聲 */
export async function afterManual(r: { saved: number; review: number; scanned: number; stopped: boolean }) {
  const s = await DB.getSettings();
  if (!s.notify || r.stopped || AppState.currentState === 'active') return;
  const content = r.saved > 0
    ? { title: tr('notif.newTitle'), body: tr('notif.newBody', { n: r.saved, album: s.albumName, review: r.review }) }
    : { title: tr('notif.doneTitle'), body: r.review ? tr('notif.doneReview', { n: r.review }) : tr('notif.doneNone', { n: r.scanned }) };
  await Notifications.scheduleNotificationAsync({ content, trigger: null });
}

/** 早上：把晚上找到的新照片一次告訴家長（背景檢查和打開 App 時都會呼叫） */
export async function flushDigest() {
  const b = await getBatch();
  if (!b || b.seen || !b.held || !b.ids.length) return;
  const s = await DB.getSettings();
  if (!s.notify || quietNow(s)) return;
  b.held = false;
  await setBatch(b);
  await post(b, 'morning', s);
}

/* ---------------------------------------------------------------- 給畫面用 */

/** 打開「新照片」頁：拿到這一批照片，並把通知收掉 */
export async function openBatch(): Promise<string[]> {
  FG.cancelNotice(NOTICE_ID);
  Notifications.dismissNotificationAsync(`kpf-${NOTICE_ID}`).catch(() => {});
  const b = await getBatch();
  if (!b) return [];
  if (!b.seen || b.held) {
    b.seen = true;
    b.held = false;
    await setBatch(b);
  }
  return b.ids;
}

/** 有沒有還沒看的新照片（首頁的小鈴鐺） */
export async function unseenCount(): Promise<number> {
  const b = await getBatch();
  return b && !b.seen ? b.ids.length : 0;
}

/** 允許通知（已經允許就直接回傳 true） */
export async function askNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** 傳一則範例通知（用最近存的照片）。回傳 false 代表手機不允許通知。 */
export async function sendTest(): Promise<boolean> {
  if (!(await askNotificationPermission())) return false;
  if (FG.canNotify() === false) return false;
  const s = await DB.getSettings();
  const recent = await DB.recentSaved(40);
  const ids = recent.length ? recent.filter((r) => r.folder === recent[0].folder).slice(0, 12).map((r) => r.file_id) : [];
  const ok = ids.length ? await post({ ids, since: DB.now(), seen: false, held: false }, 'new', s, TEST_ID).catch(() => false) : false;
  if (!ok) await plain(TEST_ID, tr('ntf.testTitle'), tr('ntf.testBody'), 'kidphotofinder://notify');
  return true;
}

/** 「新照片」通知分類的名字跟著 App 的語言（重要程度：高，會從畫面上方跳出來） */
export function localizeChannel() {
  FG.setPhotoChannel(tr('ntf.channel'), tr('ntf.channelDesc'));
}
