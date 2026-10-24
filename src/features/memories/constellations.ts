/**
 * 回憶星空的六個星座：顏色、在「世界」裡的位置（參考稿 941 × 1672）、照片星球的位置、星座名稱放哪裡。
 * 活動（老師的資料夾）屬於哪個星座，看資料夾名稱裡的字（沿用回憶時光機的分類），不看照片內容猜。
 * 這裡只有計算，不碰手機功能。
 */
import { GROUPS } from '../../core/timeMachine';

export const WORLD_W = 941;
export const WORLD_H = 1672;

export type ConsKey = 'sport' | 'birthday' | 'travel' | 'school' | 'family' | 'hobby';
export const CONS_ORDER: ConsKey[] = ['sport', 'birthday', 'travel', 'school', 'family', 'hobby'];

/** 照片星球的位置和直徑（世界座標）；第一個是主星 */
export type Slot = { x: number; y: number; d: number };
export type IconKey = 'runner' | 'cake' | 'plane' | 'book' | 'house' | 'palette';

export type ConsDef = {
  key: ConsKey;
  color: string;
  /** 光暈（比較深一點，畫外圈用） */
  glow: string;
  center: [number, number];
  /** 照片星球（最多 6 顆） */
  slots: Slot[];
  /** 沒有照片的小星星先放這些位置，放滿了再往外繞 */
  dots: [number, number][];
  /** 星座名稱：x, y 是名稱的左上角（align = right 時是右上角）；w 是名稱和說明大概的寬度（中文） */
  label: { x: number; y: number; align: 'left' | 'right'; w: number };
  /** 小地方用的線條圖示（篩選、回憶卡） */
  icon: IconKey;
  /** 星空上名稱旁邊的金色圖示（參考稿裡的圖）：左上角相對於名稱文字左上角的位置、大小（世界座標） */
  art: { dx: number; dy: number; w: number; h: number };
};

const RAW: Record<ConsKey, ConsDef> = {
  sport: {
    key: 'sport', color: '#FFD987', glow: '#FFB547', center: [300, 405], icon: 'runner', art: { dx: -69, dy: -49, w: 100, h: 95 },
    slots: [{ x: 300, y: 405, d: 147 }, { x: 140, y: 424, d: 54 }, { x: 203, y: 512, d: 60 }, { x: 418, y: 300, d: 56 }, { x: 80, y: 352, d: 48 }, { x: 355, y: 540, d: 46 }],
    dots: [[163, 362], [343, 268], [442, 398], [412, 497], [118, 316], [480, 468], [262, 560], [60, 450], [450, 560], [250, 300]],
    label: { x: 173, y: 238, align: 'left', w: 140 },
  },
  birthday: {
    key: 'birthday', color: '#FF91D8', glow: '#FF5FBF', center: [767, 416], icon: 'cake', art: { dx: -67, dy: -35, w: 61, h: 69 },
    slots: [{ x: 767, y: 416, d: 118 }, { x: 650, y: 372, d: 68 }, { x: 676, y: 482, d: 56 }, { x: 880, y: 452, d: 54 }, { x: 588, y: 452, d: 44 }, { x: 892, y: 336, d: 40 }],
    dots: [[575, 392], [662, 302], [806, 354], [860, 372], [802, 494], [905, 402], [740, 520], [620, 520], [560, 330], [900, 500]],
    label: { x: 707, y: 251, align: 'left', w: 128 },
  },
  travel: {
    key: 'travel', color: '#76DCFF', glow: '#38B8FF', center: [232, 810], icon: 'plane', art: { dx: -84, dy: -60.5, w: 91, h: 76 },
    slots: [{ x: 232, y: 812, d: 114 }, { x: 138, y: 728, d: 72 }, { x: 66, y: 776, d: 50 }, { x: 306, y: 880, d: 48 }, { x: 400, y: 796, d: 44 }, { x: 178, y: 908, d: 46 }],
    dots: [[226, 712], [356, 826], [108, 832], [60, 690], [280, 944], [420, 880], [80, 900], [330, 960], [140, 980], [44, 840]],
    label: { x: 259, y: 663, align: 'left', w: 128 },
  },
  school: {
    key: 'school', color: '#89E8DA', glow: '#3FD6BF', center: [750, 940], icon: 'book', art: { dx: -51, dy: -11, w: 45, h: 44 },
    slots: [{ x: 750, y: 940, d: 100 }, { x: 614, y: 896, d: 78 }, { x: 858, y: 914, d: 60 }, { x: 700, y: 862, d: 48 }, { x: 672, y: 990, d: 46 }, { x: 822, y: 1012, d: 44 }],
    dots: [[594, 976], [790, 878], [884, 984], [760, 1032], [620, 820], [900, 860], [540, 980], [700, 1060], [880, 1060]],
    label: { x: 912, y: 768, align: 'right', w: 172 },
  },
  family: {
    key: 'family', color: '#FFC77F', glow: '#FF9E3D', center: [337, 1116], icon: 'house', art: { dx: -66, dy: -32, w: 64, h: 65 },
    slots: [{ x: 337, y: 1116, d: 142 }, { x: 204, y: 1070, d: 64 }, { x: 432, y: 1204, d: 70 }, { x: 506, y: 1062, d: 46 }, { x: 176, y: 1162, d: 44 }, { x: 262, y: 1000, d: 42 }],
    dots: [[456, 1102], [300, 1224], [520, 1148], [130, 1100], [400, 1050], [240, 1238], [500, 1230], [140, 1030], [560, 1060], [90, 1180]],
    label: { x: 392, y: 940, align: 'left', w: 120 },
  },
  hobby: {
    key: 'hobby', color: '#B9A0FF', glow: '#8D6BFF', center: [690, 1186], icon: 'palette', art: { dx: -68, dy: -34, w: 64, h: 70 },
    slots: [{ x: 690, y: 1186, d: 110 }, { x: 596, y: 1112, d: 54 }, { x: 800, y: 1236, d: 50 }, { x: 584, y: 1222, d: 44 }, { x: 650, y: 1064, d: 44 }, { x: 900, y: 1266, d: 40 }],
    dots: [[770, 1116], [556, 1166], [700, 1276], [640, 1270], [540, 1100], [744, 1046], [612, 1296], [520, 1240], [860, 1290], [800, 1300]],
    label: { x: 776, y: 1076, align: 'left', w: 120 },
  },
};

/**
 * 手機比參考稿細長：最小縮放要蓋滿畫面，左右兩邊會各切掉一點（約 90）。
 * 所以星座往中間收一點（橫向 × 0.82），兩邊的照片和名稱才不會被切掉。
 */
const SQUEEZE = 0.82;
const sx = (x: number) => Math.round(WORLD_W / 2 + (x - WORLD_W / 2) * SQUEEZE);
export const CONS = Object.fromEntries(Object.entries(RAW).map(([k, d]) => [k, {
  ...d,
  center: [sx(d.center[0]), d.center[1]],
  slots: d.slots.map((q) => ({ ...q, x: sx(q.x) })),
  dots: d.dots.map(([x, y]) => [sx(x), y]),
  label: { ...d.label, x: sx(d.label.x) },
}])) as Record<ConsKey, ConsDef>;

/** 裝飾的行星（不能點；小星星會避開）：中心、圖的大小（世界座標）、球的半徑 */
export type PlanetKey = 'right' | 'earth' | 'saturn1' | 'purple' | 'saturn2' | 'small';
export const PLANETS: { key: PlanetKey; x: number; y: number; w: number; h: number; r: number }[] = [
  { key: 'right', x: 868, y: 222, w: 94, h: 94, r: 47 },
  { key: 'earth', x: 94, y: 897, w: 102, h: 102, r: 51 },
  { key: 'saturn1', x: 470, y: 614, w: 78, h: 52, r: 30 },
  { key: 'small', x: 522, y: 742, w: 40, h: 40, r: 21 },
  { key: 'purple', x: 60, y: 606, w: 104, h: 78, r: 46 },
  { key: 'saturn2', x: 898, y: 1012, w: 71, h: 41, r: 26 },
];

/** 星座名稱那一行：字的大小、行高、字的上緣離這一行頂端多遠（圖示的位置用這個對齊） */
export const LABEL_LINE = { size: 31, line: 40, inset: 7 };
/** 靠右的名稱：圖示左邊的位置用中文名稱的寬度估 */
const RIGHT_NAME_W = 165;
export type Rect = [number, number, number, number];
/** 星座名稱和說明的字、旁邊的圖示各佔的範圍（照片和小星星都要避開）：[x0, y0, x1, y1] */
export function labelRects(k: ConsKey): { text: Rect; icon: Rect } {
  const { label: l, art: a } = CONS[k];
  const iy = l.y + LABEL_LINE.inset + a.dy;
  if (l.align === 'left') {
    const ix = l.x + a.dx;
    return { text: [l.x - 4, l.y + 2, l.x + l.w, l.y + 90], icon: [ix - 2, iy - 2, ix + a.w + 2, iy + a.h + 2] };
  }
  const ix = l.x - RIGHT_NAME_W + a.dx;
  return { text: [l.x - l.w, l.y + 2, l.x + 4, l.y + 68], icon: [ix - 2, iy - 2, ix + a.w + 2, iy + a.h + 2] };
}

/** 標題區（不要放星星）：世界座標 */
export const TITLE_BOX = { x0: 150, y0: 20, x1: 790, y1: 232 };

/* ---------------------------------------------------------------- 活動屬於哪個星座 */

/** 回憶時光機的分類 → 星座 */
const GROUP_TO_CONS: Record<string, ConsKey> = {
  sports: 'sport', pe: 'sport',
  birthday: 'birthday',
  trip: 'travel', picnic: 'travel', water: 'travel',
  mother: 'family', father: 'family', newyear: 'family', midautumn: 'family', dragonboat: 'family',
  art: 'hobby', music: 'hobby', cooking: 'hobby', garden: 'hobby', show: 'hobby', science: 'hobby',
  story: 'school', graduation: 'school', drill: 'school', english: 'school', christmas: 'school', halloween: 'school', children: 'school',
};
/** 家人一起參加的活動 */
const FAMILY_WORDS = ['親子', '亲子', '家長', '家长', '祖父母', '爺爺', '爷爷', '奶奶', '外公', '外婆', '阿公', '阿嬤', '阿媽', '爸爸', '媽媽', '妈妈',
  '家人', '全家', '家庭', 'family', 'parents', 'grandparents', 'keluarga', 'orang tua', 'gia đình', 'ông bà', 'bố mẹ'];
/** 一個資料夾同時有好幾種字時，先看這個順序（例如「親子運動會」算運動會） */
const PRIORITY: ConsKey[] = ['birthday', 'sport', 'travel', 'family', 'hobby', 'school'];
const CJK = /[㐀-鿿]/;
const has = (text: string, key: string) => {
  const k = key.toLowerCase();
  if (CJK.test(k)) return text.includes(k);
  return new RegExp(`(^|[^a-z\\u00C0-\\u024F\\u1E00-\\u1EFF])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z\\u00C0-\\u024F\\u1E00-\\u1EFF])`).test(text);
};

/** 活動名稱（資料夾最後一層）→ 星座。分不出來的都是「校園生活」：本來就是老師拍的在校生活 */
export function consOf(name: string): ConsKey {
  const text = name.toLowerCase();
  const hits = new Set<ConsKey>();
  for (const g of GROUPS) {
    const c = GROUP_TO_CONS[g.id];
    if (c && g.keys.some((k) => has(text, k))) hits.add(c);
  }
  if (FAMILY_WORDS.some((k) => has(text, k))) hits.add('family');
  return PRIORITY.find((k) => hits.has(k)) || 'school';
}
