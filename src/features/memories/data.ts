/**
 * 回憶星空、刮刮樂的資料：
 * - 正式：只讀「已經存進相簿」的照片（DB.savedByFolder），一個活動（老師的資料夾）就是一個回憶。
 *   活動日期只有資料夾名稱寫了日期（例如「1018 運動會」）才算真的日期；雲端硬碟的修改日期不能冒充拍攝日。
 * - 示範：家長按「看示範」才會出現，畫面上一定標「示範資料」。正式模式絕不混進示範照片。
 */
import { bestPhotos } from '../../core/events';
import * as TM from '../../core/timeMachine';
import * as DB from '../../services/db';
import { consOf, type ConsKey } from './constellations';

export type Memory = {
  /** 資料夾路徑（穩定的 ID） */
  id: string;
  /** 活動名稱（資料夾最後一層） */
  title: string;
  /** 上面幾層（班級／週次） */
  parent: string;
  /** YYYY-MM-DD */
  day: string;
  /** 日期是資料夾名稱寫的（可信）；false 時 day 只是上傳的日子，不顯示成拍攝日 */
  trusted: boolean;
  photos: { id: string; kind: string }[];
  /** 封面：孩子的臉最清楚的那張 */
  cover: string | null;
  /** 有哪些孩子（DB 的孩子 key；第一個孩子是空字串）。不知道的話是空陣列 */
  persons: string[];
  cons: ConsKey;
  /** 示範照片（require 的圖），正式資料沒有 */
  demo?: number[];
};

export type MemoryData = { items: Memory[]; info: Map<string, DB.PhotoInfo>; demo: boolean };

export async function loadMemories(): Promise<MemoryData> {
  const rows = await DB.savedByFolder();
  const events = TM.buildEvents(rows.map((r) => ({ id: r.file_id, name: r.name, folder: r.folder, at: r.modified || '', kind: r.kind })));
  const ids = rows.filter((r) => r.kind !== 'video').map((r) => r.file_id);
  const infos = ids.length ? await DB.photosInfo(ids).catch(() => [] as DB.PhotoInfo[]) : [];
  const info = new Map(infos.map((x) => [x.file_id, x]));
  const items = events.map((ev): Memory => {
    const list = ev.photos.map((p) => info.get(p.id)).filter((x): x is DB.PhotoInfo => !!x);
    const best = bestPhotos(list, 1)[0];
    const persons = [...new Set(list.map((x) => x.person).filter((p): p is string => p != null))];
    return {
      id: ev.folder, title: ev.name, parent: ev.parent, day: ev.day,
      trusted: TM.folderDate(ev.folder, ev.day) != null,
      photos: ev.photos.map((p) => ({ id: p.id, kind: p.kind })),
      cover: best?.file_id || ev.photos.find((p) => p.kind !== 'video')?.id || null,
      persons, cons: consOf(ev.name),
    };
  }).filter((m) => m.cover);
  return { items, info, demo: false };
}

/** 這個孩子的回憶（只有一個孩子、或不知道是誰的照片，都算進去） */
export function forKid(items: Memory[], kid: string | null): Memory[] {
  if (kid == null) return items;
  return items.filter((m) => !m.persons.length || m.persons.includes(kid));
}

/* ---------------------------------------------------------------- 示範資料 */

/** 示範照片（虛構的孩子，AI 生成）：0 跑步、1 生日蠟燭、2 海邊、3 畫畫、4 上學、5 一家人、6 公園和狗、7 彈吉他、8 玩水、9 聖誕、10 向日葵 */
const DEMO_IMG = [
  require('../../../assets/memory-ui/demo/d0.jpg'), require('../../../assets/memory-ui/demo/d1.jpg'), require('../../../assets/memory-ui/demo/d2.jpg'),
  require('../../../assets/memory-ui/demo/d3.jpg'), require('../../../assets/memory-ui/demo/d4.jpg'), require('../../../assets/memory-ui/demo/d5.jpg'),
  require('../../../assets/memory-ui/demo/d6.jpg'), require('../../../assets/memory-ui/demo/d7.jpg'), require('../../../assets/memory-ui/demo/d8.jpg'),
  require('../../../assets/memory-ui/demo/d9.jpg'), require('../../../assets/memory-ui/demo/d10.jpg'),
] as number[];
/** 每個星座的示範照片（輪流當封面，看起來像那一類的活動） */
const DEMO_POOL: Record<ConsKey, number[]> = {
  sport: [0, 8, 4, 10, 6], birthday: [1, 9, 3, 7], travel: [2, 10, 8, 6, 5],
  school: [4, 3, 9, 0, 7], family: [5, 6, 2, 10, 1], hobby: [7, 3, 6, 1, 9],
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 示範的活動：[名稱, 幾個月前, 日, 照片數, 封面照片]；另外一定有一個「去年的今天」。照片最多的是星座的主星 */
const DEMO: [string, number, number, number, number][] = [
  // 運動會座
  ['運動會', 12, 18, 9, 0], ['春季運動會', 6, 12, 7, 4], ['體能闖關', 9, 30, 5, 6], ['運動會預演', 13, 2, 4, 10], ['大隊接力', 4, 8, 3, 3],
  ['親子運動會', 2, 16, 5, 5], ['幼兒賽跑', 8, 5, 2, 0], ['球類遊戲', 3, 11, 1, 4],
  // 生日座
  ['五月慶生會', 5, 21, 8, 1], ['十二月慶生會', 10, 20, 5, 9], ['九月慶生會', 13, 25, 4, 3], ['三月慶生會', 7, 26, 4, 7], ['七月慶生會', 3, 22, 3, 10],
  ['十月慶生會', 12, 27, 2, 6], ['一月慶生會', 9, 19, 1, 3], ['六月慶生會', 4, 17, 2, 9],
  // 旅行座
  ['校外教學-農場', 5, 8, 8, 2], ['戶外教學-動物園', 11, 20, 5, 6], ['玩水趣', 3, 18, 6, 8], ['野餐日', 8, 14, 4, 5], ['戶外教學-科博館', 9, 9, 2, 4],
  ['郊遊-公園', 1, 7, 1, 10], ['遠足-河濱', 10, 2, 2, 2],
  // 校園生活座
  ['開學第一天', 13, 1, 9, 4], ['聖誕活動', 10, 24, 6, 9], ['繪本時間', 12, 3, 2, 3], ['畢業典禮預演', 4, 28, 6, 0], ['萬聖節', 12, 31, 5, 7],
  ['消防演練', 7, 3, 1, 4], ['英語日', 6, 20, 2, 9], ['兒童節', 6, 4, 2, 3],
  // 家人座
  ['過年包紅包', 9, 28, 7, 5], ['中秋節', 13, 17, 4, 6], ['母親節卡片', 5, 9, 3, 1], ['父親節', 2, 8, 2, 10], ['祖父母節', 1, 25, 3, 2],
  ['端午節', 4, 30, 2, 6], ['元宵節', 8, 24, 1, 5], ['家庭日', 11, 29, 2, 10],
  // 興趣座
  ['音樂律動', 6, 10, 7, 7], ['種植小番茄', 7, 15, 5, 6], ['美勞・樹葉拼貼', 11, 6, 3, 3], ['烤餅乾', 11, 12, 4, 10], ['黏土小動物', 13, 12, 2, 4],
  ['科學小實驗', 2, 24, 2, 0], ['戲劇表演', 5, 27, 2, 9], ['舞蹈課', 1, 14, 1, 7],
];

export function demoMemories(today = new Date()): MemoryData {
  const items: Memory[] = [];
  const add = (name: string, d: Date, n: number, k: number, cover: number) => {
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const title = `${pad(d.getMonth() + 1)}${pad(d.getDate())} ${name}`;
    const cons = consOf(name);
    // 第一張是封面，後面輪流用這個星座的示範照片
    const pool = DEMO_POOL[cons].filter((x) => x !== cover);
    const imgs = Array.from({ length: n }, (_, i) => DEMO_IMG[i === 0 ? cover : pool[(k + i - 1) % pool.length]]);
    items.push({
      id: `demo/${title}`, title, parent: '示範班', day, trusted: true,
      photos: imgs.map((_, i) => ({ id: `demo:${k}:${i}`, kind: 'image' })), cover: `demo:${k}:0`,
      persons: [], cons, demo: imgs,
    });
  };
  DEMO.forEach(([name, monthsAgo, dd, n, cover], k) => {
    const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
    add(name, new Date(d.getFullYear(), d.getMonth(), Math.min(dd, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())), n, k, cover);
  });
  // 去年的今天
  add('戶外教學・向日葵花田', new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), 6, DEMO.length, 10);
  items.sort((a, b) => (a.day < b.day ? 1 : -1));
  return { items, info: new Map(), demo: true };
}

/** 示範照片的圖（照片 ID 是 demo:k:i） */
export function demoImage(m: Memory, photoId: string): number | null {
  if (!m.demo) return null;
  const i = Number(photoId.split(':')[2]);
  return m.demo[i] ?? null;
}
