/**
 * 回憶時光機（搜尋）：把存下來的照片整理成「活動」（老師的資料夾），
 * 然後聽懂家長說的話——「去年聖誕節」「第一次運動會」「上個月」「10/18」「2025/12」——找出那段回憶。
 *
 * 這裡只有計算，不碰手機或電腦的功能：手機版直接用，電腦版把這個檔案轉成 JavaScript 給網頁用，
 * 兩邊的搜尋結果才會一模一樣。畫面上要顯示的字（時光機設定的小標籤、日期、回憶雲）也在這裡，五種語言。
 */

export type TMLang = 'zh-Hant' | 'zh-Hans' | 'en' | 'id' | 'vi';

/** 一張照片：id（手機是雲端硬碟的檔案 ID；電腦是檔案路徑）、資料夾路徑、時間 */
export type TMPhoto = { id: string; name: string; folder: string; at: string; kind: string };

/** 一個活動（老師的一個資料夾） */
export type TMEvent = {
  folder: string;
  /** 資料夾名稱（例如「1018 運動會」） */
  name: string;
  /** 上面幾層資料夾（例如「115-1 健康班 / 第8週」） */
  parent: string;
  /** 活動的日期 YYYY-MM-DD（資料夾名稱裡有日期就用它，不然用照片上傳的日子） */
  day: string;
  photos: TMPhoto[];
};

/* ---------------------------------------------------------------- 日期小工具（都用當地時間） */

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const monthFrom = (y: number, m: number) => `${y}-${pad(m)}-01`;
const monthTo = (y: number, m: number) => `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
const validMD = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= lastDay(2024, m);

/** 照片時間（雲端硬碟的 ISO 時間或「YYYY-MM-DD hh:mm:ss」）→ 當地的 YYYY-MM-DD */
export function localDay(at: string): string {
  if (!at) return '';
  if (/T.*(Z|[+-]\d\d:?\d\d)$/.test(at)) {
    const d = new Date(at);
    if (!isNaN(d.getTime())) return ymd(d);
  }
  return at.slice(0, 10);
}

/** 資料夾路徑裡的日期（從最裡面那層往外找）。沒有就回傳 null。ref：照片的日子，用來猜年份 */
export function folderDate(folder: string, ref: string): string | null {
  const segs = folder.split('/').filter(Boolean).reverse();
  const refY = Number(ref.slice(0, 4)) || new Date().getFullYear();
  for (const seg of segs) {
    let m: RegExpMatchArray | null;
    // 2025-12-24、2025.12.24、2025年12月24日、20251224
    if ((m = seg.match(/(20\d\d)[-./年]?(\d{1,2})[-./月]?(\d{1,2})(?!\d)/)) && validMD(+m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    // 民國：114.12.24、114年12月24日
    if ((m = seg.match(/(?:^|\D)(1[01]\d)[-./年](\d{1,2})[-./月](\d{1,2})(?!\d)/)) && validMD(+m[2], +m[3])) return `${+m[1] + 1911}-${pad(+m[2])}-${pad(+m[3])}`;
    // 1018、1018 運動會、第8週1019-1023（取第一個）
    const four = [...seg.matchAll(/(?:^|\D)(\d{2})(\d{2})(?!\d)/g)].find((x) => validMD(+x[1], +x[2]));
    // 10.18、10/18、10月18日
    const md = four ? null : seg.match(/(?:^|\D)(\d{1,2})(?:[./]|月)(\d{1,2})(?:日|號)?(?!\d)/);
    const mm = four ? +four[1] : md && validMD(+md[1], +md[2]) ? +md[1] : 0;
    const dd = four ? +four[2] : md ? +md[2] : 0;
    if (mm) {
      // 資料夾的日期比照片晚很多：應該是去年的
      let y = refY;
      const cand = new Date(y, mm - 1, dd);
      if (cand.getTime() - dayOf(ref).getTime() > 40 * 86400e3) y -= 1;
      return `${y}-${pad(mm)}-${pad(dd)}`;
    }
  }
  return null;
}

/** 資料夾名稱裡的日期、週次拿掉，剩下活動名稱（回憶雲用） */
const bareName = (name: string) => name.replace(/第?\s*\d+\s*週/g, ' ').replace(/[\d]+([-./~～]\d+)*/g, ' ').trim();

/* ---------------------------------------------------------------- 整理成活動 */

export function buildEvents(photos: TMPhoto[]): TMEvent[] {
  const by = new Map<string, TMPhoto[]>();
  for (const p of photos) {
    if (!by.has(p.folder)) by.set(p.folder, []);
    by.get(p.folder)!.push(p);
  }
  const out: TMEvent[] = [];
  for (const [folder, list] of by) {
    // 照片上傳最多的那一天
    const count = new Map<string, number>();
    for (const p of list) { const d = localDay(p.at); if (d) count.set(d, (count.get(d) || 0) + 1); }
    const mode = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] || ymd(new Date());
    const segs = folder.split('/').filter(Boolean);
    out.push({
      folder,
      name: segs[segs.length - 1] || folder,
      parent: segs.slice(-3, -1).join(' / '),
      day: folderDate(folder, mode) || mode,
      photos: [...list].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    });
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/* ---------------------------------------------------------------- 活動的類別（同義詞） */

type Labels = Record<TMLang, string>;
export type TMGroup = { id: string; keys: string[]; label: Labels };
const L = (zh: string, hans: string, en: string, id: string, vi: string): Labels => ({ 'zh-Hant': zh, 'zh-Hans': hans, en, id, vi });

/** 家長說「聖誕」也找得到「耶誕活動」；說 Christmas 也找得到中文的資料夾 */
export const GROUPS: TMGroup[] = [
  { id: 'sports', keys: ['運動會', '运动会', '體育', '体育', '賽跑', '赛跑', '跑步', '接力', '大隊接力', 'sports day', 'sport', 'olahraga', 'thể thao', 'hội thao'], label: L('運動會', '运动会', 'Sports day', 'Hari olahraga', 'Hội thao') },
  { id: 'birthday', keys: ['慶生', '庆生', '生日', '壽星', '寿星', '蛋糕', 'birthday', 'bday', 'ulang tahun', 'sinh nhật'], label: L('慶生', '庆生', 'Birthday', 'Ulang tahun', 'Sinh nhật') },
  { id: 'christmas', keys: ['聖誕', '圣诞', '耶誕', '耶诞', 'christmas', 'xmas', 'natal', 'giáng sinh', 'noel'], label: L('聖誕節', '圣诞节', 'Christmas', 'Natal', 'Giáng sinh') },
  { id: 'halloween', keys: ['萬聖', '万圣', '搗蛋', '捣蛋', 'halloween'], label: L('萬聖節', '万圣节', 'Halloween', 'Halloween', 'Halloween') },
  { id: 'trip', keys: ['戶外', '户外', '校外', '參觀', '参观', '遠足', '远足', '出遊', '出游', '郊遊', '郊游', '旅行', 'field trip', 'trip', 'outing', 'karyawisata', 'dã ngoại', 'tham quan'], label: L('戶外教學', '户外教学', 'Field trip', 'Karyawisata', 'Dã ngoại') },
  { id: 'water', keys: ['玩水', '戲水', '戏水', '游泳', '水上', '泳池', 'swim', 'water play', 'pool', 'renang', 'bơi', 'chơi nước'], label: L('玩水', '玩水', 'Water play', 'Main air', 'Chơi nước') },
  { id: 'art', keys: ['美勞', '美劳', '勞作', '劳作', '畫畫', '画画', '繪畫', '绘画', '手作', '美術', '美术', '黏土', '彩繪', '彩绘', 'art', 'craft', 'drawing', 'painting', 'seni', 'mỹ thuật', 'vẽ'], label: L('美勞', '美劳', 'Art & craft', 'Seni', 'Mỹ thuật') },
  { id: 'music', keys: ['音樂', '音乐', '唱歌', '律動', '律动', '跳舞', '舞蹈', '樂器', '乐器', 'music', 'song', 'dance', 'musik', 'tari', 'âm nhạc', 'múa'], label: L('音樂律動', '音乐律动', 'Music & dance', 'Musik & tari', 'Âm nhạc') },
  { id: 'show', keys: ['表演', '演出', '成果展', '成果發表', '成果发表', '發表會', '发表会', '才藝', '才艺', 'show', 'performance', 'concert', 'pentas', 'biểu diễn'], label: L('表演', '表演', 'Performance', 'Pentas', 'Biểu diễn') },
  { id: 'graduation', keys: ['畢業', '毕业', '畢典', '毕典', 'graduation', 'wisuda', 'tốt nghiệp'], label: L('畢業', '毕业', 'Graduation', 'Wisuda', 'Tốt nghiệp') },
  { id: 'cooking', keys: ['烹飪', '烹饪', '料理', '點心', '点心', '做菜', '餅乾', '饼干', '烘焙', '廚房', '厨房', 'cooking', 'baking', 'memasak', 'nấu ăn'], label: L('烹飪點心', '烹饪点心', 'Cooking', 'Memasak', 'Nấu ăn') },
  { id: 'garden', keys: ['種菜', '种菜', '種植', '种植', '植物', '花園', '花园', '菜園', '菜园', '農場', '农场', 'garden', 'plant', 'farm', 'berkebun', 'làm vườn'], label: L('種植', '种植', 'Garden', 'Berkebun', 'Làm vườn') },
  { id: 'story', keys: ['繪本', '绘本', '故事', '閱讀', '阅读', '圖書', '图书', 'story', 'book', 'reading', 'cerita', 'kể chuyện', 'đọc sách'], label: L('繪本故事', '绘本故事', 'Stories', 'Cerita', 'Kể chuyện') },
  { id: 'pe', keys: ['體能', '体能', '體操', '体操', '攀爬', '平衡', '球類', '球类', 'gym', 'physical', 'senam', 'thể dục'], label: L('體能', '体能', 'PE & games', 'Senam', 'Thể dục') },
  { id: 'science', keys: ['科學', '科学', '實驗', '实验', '探索', 'science', 'experiment', 'sains', 'khoa học'], label: L('科學實驗', '科学实验', 'Science', 'Sains', 'Khoa học') },
  { id: 'picnic', keys: ['野餐', 'picnic', 'piknik'], label: L('野餐', '野餐', 'Picnic', 'Piknik', 'Picnic') },
  { id: 'newyear', keys: ['過年', '过年', '新年', '春節', '春节', '元宵', 'new year', 'lunar', 'imlek', 'tết'], label: L('過年', '过年', 'New year', 'Tahun baru', 'Tết') },
  { id: 'midautumn', keys: ['中秋', '月餅', '月饼', '柚子', 'mid-autumn', 'moon festival', 'trung thu'], label: L('中秋', '中秋', 'Mid-autumn', 'Festival kue bulan', 'Trung thu') },
  { id: 'dragonboat', keys: ['端午', '粽子', '划龍舟', '划龙舟', 'dragon boat'], label: L('端午', '端午', 'Dragon boat', 'Perahu naga', 'Đoan Ngọ') },
  { id: 'mother', keys: ['母親節', '母亲节', "mother's day", 'mothers day', 'hari ibu', 'ngày của mẹ'], label: L('母親節', '母亲节', "Mother's day", 'Hari Ibu', 'Ngày của mẹ') },
  { id: 'father', keys: ['父親節', '父亲节', "father's day", 'fathers day', 'hari ayah', 'ngày của cha'], label: L('父親節', '父亲节', "Father's day", 'Hari Ayah', 'Ngày của cha') },
  { id: 'children', keys: ['兒童節', '儿童节', "children's day", 'hari anak', 'quốc tế thiếu nhi'], label: L('兒童節', '儿童节', "Children's day", 'Hari Anak', 'Ngày thiếu nhi') },
  { id: 'drill', keys: ['防災', '防灾', '消防', '演練', '演练', '地震', 'drill', 'fire safety', 'latihan', 'diễn tập'], label: L('防災演練', '防灾演练', 'Safety drill', 'Latihan', 'Diễn tập') },
  { id: 'english', keys: ['英文', '英語', '英语', 'english', 'bahasa inggris', 'tiếng anh'], label: L('英語', '英语', 'English', 'Bahasa Inggris', 'Tiếng Anh') },
];

const low = (s: string) => s.toLowerCase();
const CJK = /[\u3400-\u9fff]/;
/** 這個字屬於哪一類（例如「聖誕節」→ 聖誕；「運動」→ 運動會） */
export function groupOf(word: string): TMGroup | null {
  const w = low(word);
  if (w.length < 2) return null;
  return GROUPS.find((g) => g.keys.some((k) => w.includes(low(k)) || (CJK.test(w) && low(k).includes(w)))) || null;
}
/** 好幾個字的類別名稱（sports day、field trip…）：先整個拿出來，不要拆開 */
const PHRASES = GROUPS.flatMap((g) => g.keys).filter((k) => /\s/.test(k)).map(low).sort((a, b) => b.length - a.length);

/* ---------------------------------------------------------------- 聽懂家長的話 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'summerBreak' | 'winterBreak';
export type Token =
  | { t: 'range'; key: RangeKey }
  | { t: 'year'; y: number }
  | { t: 'month'; y: number; m: number }
  | { t: 'day'; y: number; m: number; d: number }
  | { t: 'season'; y: number; s: Season }
  | { t: 'first' } | { t: 'latest' }
  | { t: 'word'; w: string; g: string | null };

export type Parsed = {
  /** 日期範圍（含頭尾） */
  from: string | null; to: string | null;
  /** 每一格是「其中一個符合就好」；格子之間要全部符合 */
  slots: string[][];
  first: boolean; latest: boolean;
  tokens: Token[];
  /** 「去年的今天」這種：前後幾天也算 */
  around: number;
};

const CN: Record<string, number> = { 一: 1, 兩: 2, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : CN[s] ?? NaN);
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ID_MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];

/** 停用字：前面的「我想看、找」，後面的「的照片、那天」 */
const PREFIX = /^(我想看|我要看|想看|找一下|找找|找|看看|看|有沒有|有没有|show me|find|ảnh|foto)\s*/i;
const SUFFIX = /\s*(的照片|的相片|的影片|照片|相片|影片|的時候|的时候|時候|时候|那天|那次|那一天|的回憶|的回忆|回憶|回忆|的|photos?|pictures?)$/i;
/** 全形數字、字母、符號換成半形（不用 normalize：有些手機的 JavaScript 不支援） */
const toHalf = (s: string) => s.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ');

type RangeKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'onThisDay' | 'ago';

const STOP = new Set(['的', '照片', '相片', '小孩', '孩子', '寶貝', '宝贝', '我的', 'my', 'the', 'of', 'in', 'at', 'on', 'photos', 'photo', 'pictures', 'and', 'dan', 'và', 'yang', 'của']);

export function parseQuery(input: string, today = new Date()): Parsed {
  let q = ` ${toHalf(input).toLowerCase().trim()} `;
  const tokens: Token[] = [];
  let from: string | null = null, to: string | null = null, around = 0;
  const Y = today.getFullYear(), M = today.getMonth() + 1;
  /**
   * 找到就交給 fn（fn 回傳 false 代表不算），算的話從句子裡拿掉。
   * nd：前一個字不能是數字（例如「2025」裡的「25」不算日期；不用 (?<!) 寫法，有些手機不支援）
   */
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void, nd = false) => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of q.matchAll(g)) {
      const i = m.index ?? 0;
      if (nd && i > 0 && /\d/.test(q[i - 1])) continue;
      if (fn(m) === false) continue;
      q = `${q.slice(0, i)} ${q.slice(i + m[0].length)}`;
      return true;
    }
    return false;
  };
  const setRange = (f: string, t: string) => { from = f; to = t; };

  // 順序：第一次／最近 → 去年的今天 → N 天前 → 年份修飾（今年、去年）→ 具體日期 → 月份 → 季節 → 今天、這週…
  let first = false, latest = false;
  take(/第一次|首次|頭一次|头一次|first time|\bfirst\b|pertama|lần đầu/, () => { first = true; tokens.push({ t: 'first' }); });
  take(/最近一次|最近的?|最新的?|latest|most recent|terbaru|mới nhất|gần nhất/, () => { latest = true; tokens.push({ t: 'latest' }); });

  take(/(?:(\d+|[一兩两二三四五])\s*年前|去年|last year|a year ago|setahun lalu|năm ngoái)\s*的?\s*(?:今天|today|hari ini|hôm nay)|on this day|this day last year/, (m) => {
    const k = m[1] ? num(m[1]) : 1;
    const d = new Date(Y - (k || 1), today.getMonth(), today.getDate());
    around = 3;
    setRange(ymd(addDays(d, -3)), ymd(addDays(d, 3)));
    tokens.push({ t: 'range', key: 'onThisDay' });
  });

  if (from == null) take(/(\d+|[一兩两二三四五六七八九十半]|a|an|one|two|three|four|five|six)\s*(?:個|个)?\s*(天|日|週|周|星期|禮拜|礼拜|月|年|days?|weeks?|months?|years?)\s*(?:前|ago)/, (m) => {
    const n = num(m[1]);
    if (!(n > 0)) return false;
    const u = m[2];
    if (/天|日|day/.test(u)) {
      const d = addDays(today, -Math.round(n));
      setRange(ymd(d), ymd(d)); tokens.push({ t: 'day', y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }); return;
    }
    else if (/週|周|星期|禮拜|礼拜|week/.test(u)) { const s = addDays(today, -7 * Math.round(n) - ((today.getDay() + 6) % 7)); setRange(ymd(s), ymd(addDays(s, 6))); }
    else if (/月|month/.test(u) && n === 0.5) { setRange(ymd(addDays(today, -21)), ymd(addDays(today, -7))); }
    else if (/月|month/.test(u) || n === 0.5) {
      const d = new Date(Y, today.getMonth() - (n === 0.5 && !/月|month/.test(u) ? 6 : Math.round(n)), 1);
      const y = d.getFullYear(), mm = d.getMonth() + 1;
      setRange(monthFrom(y, mm), monthTo(y, mm)); tokens.push({ t: 'month', y, m: mm }); return;
    }
    else { const y = Y - Math.round(n); setRange(`${y}-01-01`, `${y}-12-31`); tokens.push({ t: 'year', y }); return; }
    tokens.push({ t: 'range', key: 'ago' });
  });

  // 年份：今年／去年／前年、2025、2025年、民國 114 年
  let yMod: number | null = null, yExplicit = false;
  take(/今年|this year|tahun ini|năm nay/, () => { yMod = Y; });
  if (yMod == null) take(/去年|last year|tahun lalu|năm ngoái|năm trước/, () => { yMod = Y - 1; });
  if (yMod == null) take(/前年|year before last/, () => { yMod = Y - 2; });

  // 具體日期：2025/12/24、2025年12月24日
  if (from == null) take(/(20\d\d)\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})\s*(?:日|號|号)?/, (m) => {
    if (!validMD(+m[2], +m[3])) return false;
    const d = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    setRange(d, d); tokens.push({ t: 'day', y: +m[1], m: +m[2], d: +m[3] });
  });
  // 年月：2025/12、2025-12、2025年12月、Oct 2025
  if (from == null) take(/(20\d\d)\s*[-./年]\s*(\d{1,2})\s*月?(?!\d)/, (m) => {
    const mm = +m[2];
    if (mm < 1 || mm > 12) return false;
    setRange(monthFrom(+m[1], mm), monthTo(+m[1], mm)); tokens.push({ t: 'month', y: +m[1], m: mm });
  });
  // 民國年：114年
  if (from == null && yMod == null) take(/(1[01]\d)\s*年(?!\d)/, (m) => { yMod = +m[1] + 1911; yExplicit = true; }, true);
  // 西元年：2025、2025年
  if (from == null && yMod == null) take(/(20\d\d)\s*年?(?!\d)/, (m) => { yMod = +m[1]; yExplicit = true; }, true);

  // 月／日：12/24、12月24日（沒說年份：最近一次的那一天）
  if (from == null) take(/(\d{1,2})\s*(?:[/.]|月)\s*(\d{1,2})\s*(?:日|號|号)?(?!\d)/, (m) => {
    const mm = +m[1], dd = +m[2];
    if (!validMD(mm, dd)) return false;
    let y = yMod ?? Y;
    if (yMod == null && new Date(y, mm - 1, dd).getTime() > today.getTime()) y -= 1;
    const d = `${y}-${pad(mm)}-${pad(dd)}`;
    setRange(d, d); tokens.push({ t: 'day', y, m: mm, d: dd });
  }, true);
  // 月份：10月、10月份、october、oktober、tháng 10
  const monthAt = (mm: number) => {
    let y = yMod ?? Y;
    if (yMod == null && mm > M) y -= 1;
    setRange(monthFrom(y, mm), monthTo(y, mm)); tokens.push({ t: 'month', y, m: mm });
  };
  if (from == null) take(/(\d{1,2}|十一|十二|[一二三四五六七八九十])\s*月份?(?!\d)/, (m) => {
    const mm = m[1] === '十一' ? 11 : m[1] === '十二' ? 12 : num(m[1]);
    if (!(mm >= 1 && mm <= 12)) return false;
    monthAt(mm);
  }, true);
  if (from == null) take(/tháng\s*(\d{1,2})/, (m) => { const mm = +m[1]; if (mm < 1 || mm > 12) return false; monthAt(mm); });
  if (from == null) take(new RegExp(`\\b(${ID_MONTHS.join('|')})\\b`), (m) => { monthAt(ID_MONTHS.indexOf(m[1]) + 1); });
  if (from == null) take(new RegExp(`\\b(${EN_MONTHS.join('|')})[a-z]*\\.?\\b`), (m) => { monthAt(EN_MONTHS.indexOf(m[1]) + 1); });

  // 季節：春天、去年夏天、暑假、寒假
  if (from == null) take(/春天|春季|spring|musim semi|mùa xuân|夏天|夏季|summer(?! vacation)|musim panas|mùa hè|秋天|秋季|autumn|fall|musim gugur|mùa thu|冬天|冬季|winter(?! break)|musim dingin|mùa đông|暑假|summer vacation|summer break|寒假|winter break|winter vacation/, (m) => {
    const w = m[0];
    const s: Season = /暑假|summer (vacation|break)/.test(w) ? 'summerBreak' : /寒假|winter (break|vacation)/.test(w) ? 'winterBreak'
      : /春|spring|semi|xuân/.test(w) ? 'spring' : /夏|summer|panas|hè/.test(w) ? 'summer' : /秋|autumn|fall|gugur|thu/.test(w) ? 'autumn' : 'winter';
    // [開始月, 開始日, 結束月, 結束日, 是否跨年]
    const R: Record<Season, [number, number, number, number, boolean]> = {
      spring: [3, 1, 5, 31, false], summer: [6, 1, 8, 31, false], autumn: [9, 1, 11, 30, false],
      winter: [12, 1, 2, 28, true], summerBreak: [7, 1, 8, 31, false], winterBreak: [1, 15, 2, 20, false],
    };
    const [m1, d1, m2, d2, cross] = R[s];
    let y = yMod ?? Y;
    if (yMod == null) {
      // 沒說年份：今年的這個季節還沒開始，就是去年的
      const start = new Date(y, m1 - 1, d1);
      if (start.getTime() > today.getTime()) y -= 1;
    }
    const endY = cross ? y + 1 : y;
    setRange(`${y}-${pad(m1)}-${pad(d1)}`, `${endY}-${pad(m2)}-${pad(Math.min(d2, lastDay(endY, m2)))}`);
    tokens.push({ t: 'season', y, s });
  });

  // 今天、昨天、這週、上週、這個月、上個月
  const named: [RegExp, RangeKey, () => [string, string]][] = [
    [/今天|today|hari ini|hôm nay/, 'today', () => [ymd(today), ymd(today)]],
    [/昨天|yesterday|kemarin|hôm qua/, 'yesterday', () => { const d = ymd(addDays(today, -1)); return [d, d]; }],
    [/這週|这周|本週|本周|這禮拜|这礼拜|這星期|这星期|this week|minggu ini|tuần này/, 'thisWeek', () => { const s = addDays(today, -((today.getDay() + 6) % 7)); return [ymd(s), ymd(addDays(s, 6))]; }],
    [/上週|上周|上禮拜|上礼拜|上星期|last week|minggu lalu|tuần trước/, 'lastWeek', () => { const s = addDays(today, -((today.getDay() + 6) % 7) - 7); return [ymd(s), ymd(addDays(s, 6))]; }],
    [/這個月|这个月|本月|這月|这月|this month|bulan ini|tháng này/, 'thisMonth', () => [monthFrom(Y, M), monthTo(Y, M)]],
    [/上個月|上个月|上月|last month|bulan lalu|tháng trước/, 'lastMonth', () => { const d = new Date(Y, M - 2, 1); return [monthFrom(d.getFullYear(), d.getMonth() + 1), monthTo(d.getFullYear(), d.getMonth() + 1)]; }],
  ];
  for (const [re, key, fn] of named) {
    if (from != null) break;
    take(re, () => { const [f, t] = fn(); setRange(f, t); tokens.push({ t: 'range', key }); });
  }

  // 只有年份（今年、去年、2025）
  if (from == null && yMod != null) {
    setRange(`${yMod}-01-01`, `${yMod}-12-31`);
    tokens.push(yExplicit || (yMod !== Y && yMod !== Y - 1) ? { t: 'year', y: yMod } : { t: 'range', key: yMod === Y ? 'thisYear' : 'lastYear' });
  } else if (yMod != null) {
    // 年份修飾了月份／季節／日期：小標籤裡已經有年份了
  }

  // 剩下的字：活動名稱
  const slots: string[][] = [];
  for (const ph of PHRASES) {
    if (q.includes(ph)) {
      q = q.replace(ph, ' ');
      slots.push([ph]);
      tokens.push({ t: 'word', w: ph, g: groupOf(ph)?.id || null });
    }
  }
  for (let chunk of q.split(/[\s,，。！？!?;；:：]+/)) {
    for (let i = 0; i < 3; i++) chunk = chunk.replace(PREFIX, '').replace(SUFFIX, '');
    // 「妹妹的生日」：拆成兩個都要符合（找不到的字，搜尋時會先略過）
    for (let part of chunk.split(/的/)) {
      for (let i = 0; i < 2; i++) part = part.replace(PREFIX, '').replace(SUFFIX, '');
      if (!part || STOP.has(part)) continue;
      // 「運動會和玩水」：其中一個符合就好
      const alts = part.split(/和|跟|與|与|或|、|\bor\b|\batau\b|\bhoặc\b/).map((x) => x.replace(SUFFIX, '').trim()).filter((x) => x && !STOP.has(x));
      if (!alts.length) continue;
      slots.push(alts);
      for (const w of alts) tokens.push({ t: 'word', w, g: groupOf(w)?.id || null });
    }
  }
  return { from, to, slots, first, latest, tokens, around };
}

/* ---------------------------------------------------------------- 找 */

/** 這個活動符不符合這個字（同一類的字也算） */
function hit(ev: TMEvent, w: string): boolean {
  const hay = low(ev.folder);
  if (hay.includes(low(w))) return true;
  const g = groupOf(w);
  return !!g && g.keys.some((k) => hay.includes(low(k)));
}

/**
 * 找符合的活動。ignored：完全找不到的字（例如「妹妹的生日」裡的「妹妹」），先略過不算，畫面上會說一聲。
 */
export function search(events: TMEvent[], p: Parsed): { events: TMEvent[]; ignored: string[] } {
  const ignored: string[] = [];
  const slots = p.slots.filter((alts) => {
    const ok = events.some((e) => alts.some((w) => hit(e, w)));
    if (!ok) ignored.push(...alts);
    return ok;
  });
  // 說的字全部都找不到：不要拿日期去湊一堆不相干的活動
  if (p.slots.length && !slots.length) return { events: [], ignored };
  let out = events.filter((e) => (p.from == null || e.day >= p.from) && (p.to == null || e.day <= p.to)
    && slots.every((alts) => alts.some((w) => hit(e, w))));
  out = [...out].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  if (p.first) out.reverse();
  return { events: out, ignored };
}

/** 那段時間沒有回憶：找最接近那段時間的活動（說了活動名稱的話，只找那種活動） */
export function nearest(events: TMEvent[], p: Parsed, k = 3): TMEvent[] {
  if (p.from == null || p.to == null) return [];
  const f = dayOf(p.from).getTime(), t = dayOf(p.to).getTime();
  const pool = events.filter((e) => p.slots.every((alts) => alts.some((w) => hit(e, w))));
  const dist = (e: TMEvent) => { const d = dayOf(e.day).getTime(); return d < f ? f - d : d > t ? d - t : 0; };
  return [...pool].sort((a, b) => dist(a) - dist(b)).slice(0, k);
}

/** 有沒有真的說了什麼（空白、只有「的照片」不算） */
export const hasQuery = (p: Parsed) => p.from != null || p.slots.length > 0 || p.first || p.latest;

/* ---------------------------------------------------------------- 時光機的其他玩法 */

/** 時光尺：每個月有幾張照片（從第一張的月份到這個月，最多 48 個月） */
export function months(events: TMEvent[], today = new Date()): { y: number; m: number; n: number }[] {
  if (!events.length) return [];
  const count = new Map<string, number>();
  let min = events[0].day;
  for (const e of events) {
    const k = e.day.slice(0, 7);
    count.set(k, (count.get(k) || 0) + e.photos.length);
    if (e.day < min) min = e.day;
  }
  const out: { y: number; m: number; n: number }[] = [];
  let y = Number(min.slice(0, 4)), m = Number(min.slice(5, 7));
  const endY = today.getFullYear(), endM = today.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ y, m, n: count.get(`${y}-${pad(m)}`) || 0 });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.slice(-48);
}

/** 回憶雲：常出現的活動（類別 + 資料夾名稱裡常見的字），大小看有幾次 */
export function cloud(events: TMEvent[], lang: TMLang, limit = 16): { label: string; q: string; n: number }[] {
  const out: { label: string; q: string; n: number }[] = [];
  const used = new Set<string>();
  for (const g of GROUPS) {
    const n = events.filter((e) => g.keys.some((k) => low(e.folder).includes(low(k)))).length;
    if (n) { out.push({ label: g.label[lang], q: g.label['zh-Hant'], n }); used.add(g.id); }
  }
  const words = new Map<string, number>();
  for (const e of events) {
    const seen = new Set<string>();
    for (const w of bareName(e.name).split(/[\s\-_.,，、/()（）[\]【】]+/)) {
      if (w.length < 2 || /^\d+$/.test(w) || seen.has(w) || groupOf(w)) continue;
      seen.add(w);
      words.set(w, (words.get(w) || 0) + 1);
    }
  }
  for (const [w, n] of words) out.push({ label: w, q: w, n });
  return out.sort((a, b) => b.n - a.n).slice(0, limit);
}

/** 那年的今天：今天的前後 3 天，1～5 年前有沒有活動 */
export function onThisDay(events: TMEvent[], today = new Date()): { years: number; events: TMEvent[] }[] {
  const out: { years: number; events: TMEvent[] }[] = [];
  for (let k = 1; k <= 5; k++) {
    const d = new Date(today.getFullYear() - k, today.getMonth(), today.getDate());
    const f = ymd(addDays(d, -3)), t = ymd(addDays(d, 3));
    const list = events.filter((e) => e.day >= f && e.day <= t);
    if (list.length) out.push({ years: k, events: list });
  }
  return out;
}

/** 回憶扭蛋：隨機抽一個活動（盡量抽兩週以前的；不要連續抽到同一個） */
export function gacha(events: TMEvent[], avoid: string | null, rnd = Math.random, today = new Date()): TMEvent | null {
  const cut = ymd(addDays(today, -14));
  let pool = events.filter((e) => e.day <= cut && e.folder !== avoid);
  if (!pool.length) pool = events.filter((e) => e.folder !== avoid);
  if (!pool.length) pool = events;
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}

/* ---------------------------------------------------------------- 畫面上的字（五種語言） */

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** 日期：2025/12/24、Dec 24, 2025、24 Des 2025、24/12/2025 */
export function fmtDay(day: string, lang: TMLang): string {
  const y = +day.slice(0, 4), m = +day.slice(5, 7), d = +day.slice(8, 10);
  if (lang === 'en') return `${MONTH_EN[m - 1]} ${d}, ${y}`;
  if (lang === 'id') return `${d} ${MONTH_ID[m - 1]} ${y}`;
  if (lang === 'vi') return `${pad(d)}/${pad(m)}/${y}`;
  return `${y}/${m}/${d}`;
}

/** 時光尺上的月份 */
export function fmtMonth(y: number, m: number, lang: TMLang, withYear = false): string {
  if (lang === 'en') return withYear ? `${MONTH_EN[m - 1]} ${y}` : MONTH_EN[m - 1];
  if (lang === 'id') return withYear ? `${MONTH_ID[m - 1]} ${y}` : MONTH_ID[m - 1];
  if (lang === 'vi') return withYear ? `T${m}/${y}` : `T${m}`;
  return withYear ? `${y} 年 ${m} 月` : `${m} 月`;
}

const T: Record<string, Labels> = {
  today: L('今天', '今天', 'Today', 'Hari ini', 'Hôm nay'),
  yesterday: L('昨天', '昨天', 'Yesterday', 'Kemarin', 'Hôm qua'),
  thisWeek: L('這週', '这周', 'This week', 'Minggu ini', 'Tuần này'),
  lastWeek: L('上週', '上周', 'Last week', 'Minggu lalu', 'Tuần trước'),
  thisMonth: L('這個月', '这个月', 'This month', 'Bulan ini', 'Tháng này'),
  lastMonth: L('上個月', '上个月', 'Last month', 'Bulan lalu', 'Tháng trước'),
  thisYear: L('今年', '今年', 'This year', 'Tahun ini', 'Năm nay'),
  lastYear: L('去年', '去年', 'Last year', 'Tahun lalu', 'Năm ngoái'),
  onThisDay: L('那年的今天', '那年的今天', 'On this day', 'Hari ini dulu', 'Ngày này năm xưa'),
  ago: L('那時候', '那时候', 'Back then', 'Waktu itu', 'Hồi đó'),
  first: L('第一次', '第一次', 'The first time', 'Pertama kali', 'Lần đầu'),
  latest: L('最近一次', '最近一次', 'Most recent', 'Terbaru', 'Gần nhất'),
  spring: L('春天', '春天', 'Spring', 'Musim semi', 'Mùa xuân'),
  summer: L('夏天', '夏天', 'Summer', 'Musim panas', 'Mùa hè'),
  autumn: L('秋天', '秋天', 'Autumn', 'Musim gugur', 'Mùa thu'),
  winter: L('冬天', '冬天', 'Winter', 'Musim dingin', 'Mùa đông'),
  summerBreak: L('暑假', '暑假', 'Summer break', 'Libur kenaikan', 'Nghỉ hè'),
  winterBreak: L('寒假', '寒假', 'Winter break', 'Libur semester', 'Nghỉ đông'),
};

/** 「時光機設定」小標籤上的字 */
export function tokenLabel(tok: Token, lang: TMLang): string {
  const yearSuffix = (y: number) => (lang === 'zh-Hant' || lang === 'zh-Hans' ? `${y} 年` : String(y));
  switch (tok.t) {
    case 'range': return T[tok.key][lang];
    case 'first': return T.first[lang];
    case 'latest': return T.latest[lang];
    case 'year': return yearSuffix(tok.y);
    case 'month': return fmtMonth(tok.y, tok.m, lang, true);
    case 'day': return fmtDay(`${tok.y}-${pad(tok.m)}-${pad(tok.d)}`, lang);
    case 'season': return lang === 'zh-Hant' || lang === 'zh-Hans' ? `${tok.y} ${T[tok.s][lang]}` : `${T[tok.s][lang]} ${tok.y}`;
    case 'word': {
      const g = tok.g ? GROUPS.find((x) => x.id === tok.g) : null;
      if (!g) return tok.w;
      return low(g.label[lang]) === low(tok.w) ? g.label[lang] : `${tok.w} · ${g.label[lang]}`;
    }
  }
}

/** 結果的一句話：找到 3 個活動、42 張照片 · 2025/12/24 – 2026/10/18 */
export function summary(list: TMEvent[], lang: TMLang): string {
  const n = list.reduce((a, e) => a + e.photos.length, 0);
  const days = list.map((e) => e.day).sort();
  const span = days.length ? (days[0] === days[days.length - 1] ? fmtDay(days[0], lang) : `${fmtDay(days[0], lang)} – ${fmtDay(days[days.length - 1], lang)}`) : '';
  switch (lang) {
    case 'en': return `${list.length} event${list.length === 1 ? '' : 's'}, ${n} photo${n === 1 ? '' : 's'} · ${span}`;
    case 'id': return `${list.length} acara, ${n} foto · ${span}`;
    case 'vi': return `${list.length} hoạt động, ${n} ảnh · ${span}`;
    case 'zh-Hans': return `找到 ${list.length} 个活动、${n} 张照片 · ${span}`;
    default: return `找到 ${list.length} 個活動、${n} 張照片 · ${span}`;
  }
}

/** 「幾年前」 */
export function yearsAgo(k: number, lang: TMLang): string {
  switch (lang) {
    case 'en': return k === 1 ? '1 year ago today' : `${k} years ago today`;
    case 'id': return `${k} tahun lalu, hari ini`;
    case 'vi': return `${k} năm trước, ngày này`;
    case 'zh-Hans': return k === 1 ? '去年的今天' : `${k} 年前的今天`;
    default: return k === 1 ? '去年的今天' : `${k} 年前的今天`;
  }
}

/** 輸入框裡輪流出現的例子 */
export const EXAMPLES: Labels[] = [
  L('去年聖誕節', '去年圣诞节', 'Christmas last year', 'Natal tahun lalu', 'Giáng sinh năm ngoái'),
  L('第一次運動會', '第一次运动会', 'first sports day', 'olahraga pertama', 'hội thao lần đầu'),
  L('上個月', '上个月', 'last month', 'bulan lalu', 'tháng trước'),
  L('生日', '生日', 'birthday', 'ulang tahun', 'sinh nhật'),
  L('今年夏天玩水', '今年夏天玩水', 'water play this summer', 'main air musim panas', 'chơi nước mùa hè'),
  L('10/18', '10/18', 'Oct 2025', 'Oktober', 'tháng 10'),
];
