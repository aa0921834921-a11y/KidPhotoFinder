// @ts-check
/* 時光娃娃機 3D 版
 * 座標：X 左右、Y 高度、Z 前後（+Z 是機台正面、朝向玩家）。單位：公尺。
 * 機台：寬 2.4、深 1.75、高 4.1。下櫃 0～1.43（含斜面控制台），遊戲室 1.43～3.38，招牌箱 3.38～4.1。
 * 所有零件都是同一個 3D 場景；四個視角只換相機。
 */
/** @type {typeof import('three')} */
const THREE = /** @type {any} */ (window).THREE;

/* ============================== 尺寸 ============================== */
const OW = 2.4, OD = 1.75, OH = 4.1;
const PIL = 0.12;                       // 四角立柱
const FY = 1.43;                        // 遊戲室地板（也是控制台後緣高度）
const GLASS_Y0 = 1.47, GLASS_Y1 = 3.30; // 玻璃下緣、上緣
const TOP_Y0 = 3.38;                    // 招牌箱底
const XI = OW / 2 - PIL, ZI = OD / 2 - PIL;   // 立柱內側 1.08、0.755
const GZ = ZI + 0.03, GX = XI + 0.03, BZ = -(ZI + 0.03);  // 前玻璃 z、側玻璃 x、後牆 z
const LOW_H = 1.2;                      // 下櫃正面面板高度
const FRONT_Z = OD / 2;                 // 0.875
const CON = { z0: FRONT_Z - 0.015, z1: FRONT_Z + 0.55, yBack: FY, yFront: 1.30, yLip: 1.21, yBottom: 1.16 };
const R = 0.2;                          // 水晶球半徑
const CH = 0.62, HB = 0.5;              // 出獎口洞口大小、防護板高度
const HX0 = -GX, HX1 = -GX + CH, HZ0 = GZ - CH, HZ1 = GZ;     // 洞口範圍（左前角）
const DOOR = { x0: -0.965, x1: -0.45, y0: 0.26, y1: 0.95 };    // 下櫃取獎口（對齊 cabinet_front_lower 圖上的位置）
const FLAP_Z = FRONT_Z - 0.03;
const YT = FY - 0.26;                                           // 漏斗下緣（喉部）高度
const TX0 = DOOR.x0, TX1 = DOOR.x1, TZ0 = HZ0 + 0.05, TZ1 = HZ1 - 0.05;   // 喉部＝掉落通道的範圍（左右剛好對齊取獎口）
const rampY = (z) => DOOR.y0 + 0.25 * (FLAP_Z - z);              // 通道底部斜坡（往取獎口方向變低）
const RAIL_Y = 3.24, BEAM_Y = 3.205, ANCHOR_Y = 3.15;           // 軌道、橫樑、吊線起點
const CAR_X = 0.79, CAR_ZMIN = -0.6, CAR_ZMAX = 0.43;          // 台車範圍（張開的爪子不會碰到玻璃）
const HOME = { x: Math.max(-CAR_X, (HX0 + HX1) / 2), z: Math.min(CAR_ZMAX, (HZ0 + HZ1) / 2) };   // 出獎口上方（台車到得了的地方）
/* 爪子：照 GPT 爪子圖的比例做成 3D（以吊環為原點，往下是 -Y） */
const PALM = -0.33;                       // 三個爪臂關節的高度
const HUB_BOT = -0.36;                    // 中央圓柱底部（球頂會碰到這裡）
const JOINT_R = 0.085;                    // 關節離中心軸的距離
/** 爪臂中心線（爪臂平面：x 往外、y 往上；以關節為原點；角度 0 = 剛好抱住一顆球） */
const FINGER = [[0, 0], [0.077, -0.06], [0.09, -0.098], [0.129, -0.1775], [0.134, -0.274], [0.101, -0.356], [0.042, -0.417]];
const FINGER_R = [0.018, 0.018, 0.017, 0.015, 0.012, 0.007];   // 每一段的半寬（碰撞用；越到爪尖越細）
const PHI = { open: 0.5, half: 0.2, closed: -0.28 };
const PHI_MAX = PHI.open + 0.12;          // 被球頂開的極限
const PHI_WEAK = 0.3;                     // 爪力變弱時鬆到的角度（球會從爪尖之間掉下去）
const BALL_Y = HUB_BOT - R - 0.005;       // 剛好被抱住時球心的高度（爪子座標）
const CLAW_COM = 0.42;                    // 吊環到爪子重心（擺盪用）
/* 遊戲手感 */
const G = 9.8, VMAX = 0.65, AMAX = 1.8, VTRAVEL = 0.55, VDROP = 0.5, VLIFT = 0.45, CABLE0 = 0.06, TIME = 25;
const CABLE_MAX = ANCHOR_Y - FY - 0.3;

const DEMO_PHOTOS = [["運動會", "2025 年 10 月 18 日"], ["生日會", "2025 年 11 月 2 日"], ["海邊旅行", "2025 年 8 月 9 日"], ["美勞課", "2026 年 3 月 12 日"],
  ["開學第一天", "2025 年 9 月 1 日"], ["家庭旅行・夕陽", "2025 年 7 月 26 日"], ["野餐日", "2026 年 4 月 18 日"], ["音樂課", "2026 年 5 月 6 日"],
  ["玩水日", "2026 年 7 月 8 日"], ["聖誕派對", "2025 年 12 月 24 日"], ["向日葵花田", "2025 年 9 月 26 日"]];
const PROPS = [["prop_bear", "propBear"], ["prop_train", "propTrain"]];

/* ============================== 跟 App 溝通 ==============================
 * App（React Native 的 WebView，或網頁版的 iframe）會傳：孩子的照片（小圖）、活動名稱、日期、目前語言的文字。
 * 單獨打開這一頁時（沒有 App），用內建的示範照片。
 */
/** 圖：App 版的 HTML 把所有圖都包在 window.__ART（不用網路）；單獨的網頁版直接讀 a/ 資料夾 */
const INLINE = /** @type {Record<string,string>} */ (/** @type {any} */ (window).__ART || {});
/** @param {string} p */
const art = (p) => INLINE[p] || p;
const HOST = /** @type {any} */ (window).ReactNativeWebView ? "rn" : (window.parent !== window && /[#&?]app\b/.test(location.hash + location.search) ? "frame" : "none");
/** 傳訊息給 App */
function send(msg) {
  try {
    if (HOST === "rn") /** @type {any} */ (window).ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if (HOST === "frame") window.parent.postMessage({ claw: msg }, "*");
  } catch (e) { }
}
/** 畫面上的文字（預設繁體中文；App 會傳目前語言的文字進來） */
const TXT = {
  loading: "時光娃娃機準備中…", start: "推搖桿開始，按「抓取」放下爪子", slip: "滑掉了！", win: "夾到了！", miss: "沒夾到，再試一次", over: "次數用完了，按「補充 10 次」再玩",
  timer: "⏱ {n} 秒", ready: "準備好了", overShort: "次數用完了", coins: "剩 {n} 次", refilled: "補充了 10 次", relaid: "機台重新擺好了",
  album: "收藏冊", albumTitle: "時光收藏冊", albumEmpty: "還沒有收藏，去夾一顆回憶吧！", close: "關閉", keep: "收進收藏冊", kept: "收進收藏冊了",
  openDay: "看這一天", recenter: "回正", relay: "重新擺放", refill: "補充 10 次", soundOn: "音效開", soundOff: "音效關",
  hint: "單指拖曳轉動・雙指縮放", hintPc: "電腦：方向鍵移動、空白鍵放爪", rareLine: "✦ 很久沒看的回憶 ✦", catchLine: "抓住這一天的時光",
  propBear: "稀有收藏：時光小熊", propTrain: "稀有收藏：回憶列車", propLine: "很少見的收藏品", demo: "示範資料", back: "返回",
  openInApp: "在 App 裡可以看這一天的全部照片", pad: "搖桿", grab: "抓取",
};
/** @type {Record<string,string>} */ let I18N = {};
/** @param {string} k @param {Record<string, any>} [p] */
function TT(k, p) {
  let v = I18N[k] || /** @type {any} */ (TXT)[k] || k;
  if (p) for (const a of Object.keys(p)) v = v.split("{" + a + "}").join(String(p[a]));
  return v;
}
/** @typedef {{ id: string, mem: string, img: string, title: string, date: string, fx?: number, fy?: number, rare?: boolean, tex?: THREE.Texture }} Pic */
/** @type {Pic[]} 球裡的照片 */
let pics = [];
let isDemo = false;

/* ============================== 畫面 ============================== */
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("cv"));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b1d);
scene.fog = new THREE.Fog(0x070b1d, 14, 30);

/* 環境光貼圖：一個深藍房間，上方暖色柔光箱、側邊冷色長條（給黃銅和玻璃反射用） */
function makeEnvironment() {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: 0x0c1230, side: THREE.BackSide }));
  room.position.y = 4; env.add(room);
  /** @param {number} w @param {number} h @param {THREE.Vector3} p @param {number} color @param {number} k */
  const panel = (w, h, p, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(p); m.lookAt(0, 2, 0); env.add(m);
  };
  panel(10, 4, new THREE.Vector3(0, 9, 6), 0xffe2b0, 4.5);     // 上方暖光
  panel(3, 8, new THREE.Vector3(-10, 4, 2), 0x9fb4ff, 2.6);    // 左側冷光
  panel(3, 8, new THREE.Vector3(10, 4, -2), 0xffc98a, 3.2);    // 右側暖光
  panel(1.2, 6, new THREE.Vector3(6, 5, 8), 0xffffff, 5);       // 一條很亮的窄光（玻璃上的高光）
  panel(14, 2, new THREE.Vector3(0, 1, 11), 0xfff2dd, 1.4);    // 正面低光
  panel(6, 3, new THREE.Vector3(0, 7, -10), 0x6f7cff, 0.9);
  const rt = pm.fromScene(env, 0.035);
  pm.dispose();
  return rt.texture;
}
scene.environment = makeEnvironment();

/* ============================== 素材 ============================== */
const manager = new THREE.LoadingManager();
const TL = new THREE.TextureLoader(manager);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
/** @param {string} name @param {{srgb?:boolean, rep?:[number,number], off?:[number,number]}} [o] */
function tex(name, o = {}) {
  const t = TL.load(art("a/" + name + ".webp"));
  if (o.srgb !== false) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, MAX_ANISO);
  if (o.rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.rep[0], o.rep[1]); }
  if (o.off) t.offset.set(o.off[0], o.off[1]);
  return t;
}
const T = {
  brass: tex("brass_metal", { rep: [1, 1] }), navy: tex("navy_enamel", { rep: [2, 2] }), floor: tex("floor_inner", { rep: [0.7, 0.7] }),
  sign: tex("sign_front"), back: tex("back_wall", { rep: [1, 0.866], off: [0, 0.067] }), front: tex("cabinet_front_lower"),
  side: tex("cabinet_side_panel"), panel: tex("console_top"), btn: tex("btn_top"), glassDecal: tex("glass_front", { rep: [0.943, 0.8465], off: [0.028, 0.132] }),
  railx: tex("rail_x"), carriage: tex("carriage_top"), shadow: tex("ball_shadow"), sparkle: tex("sparkle"),
  pat1: tex("ball_pattern_1"), pat2: tex("ball_pattern_2"), patR: tex("ball_pattern_rare"),
  photos: DEMO_PHOTOS.map((_, i) => tex("photo" + i)), props: PROPS.map(([k]) => tex(k)),
  band: tex("claw_band"), glowBand: tex("claw_glow"), medal: tex("claw_medal"),
};
// 爪子的星星環、發光環：從 GPT 爪子圖攤平切出來（半圈），鏡像重複包滿一圈，星星主圖案朝正面
for (const t of [T.band, T.glowBand]) { t.wrapS = THREE.MirroredRepeatWrapping; t.repeat.set(2, 1); t.offset.set(0.5, 0); }
T.front.repeat.set(1 / OW, 1 / LOW_H); T.front.offset.set(0.5, 0);   // 正面面板用形狀座標當 UV（公尺）→ 對到整張圖
for (const t of T.props) { t.repeat.set(0.7, 0.7); t.offset.set(0.15, 0.17); }   // 收藏品只取中間（原圖外圈畫了一顆球，不要球中球）

/* ============================== 材質 ============================== */
const MAT = {
  brass: new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.brass, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 }),
  brassDark: new THREE.MeshStandardMaterial({ color: 0xb98a3c, metalness: 1, roughness: 0.38 }),
  navy: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.navy, metalness: 0.2, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.28 }),
  navyDark: new THREE.MeshStandardMaterial({ color: 0x0b1028, metalness: 0.2, roughness: 0.6 }),
  // 機身內部：不反射環境光、也沒有高光（不然洞裡會亮亮的灰藍色）
  // （r149 的色碼直接當線性值用，所以深色要寫得更深）
  inside: new THREE.MeshLambertMaterial({ color: 0x010207, side: THREE.DoubleSide }),   // 霧面、不反光
  insideFloor: new THREE.MeshStandardMaterial({ color: 0x04060f, metalness: 0.3, roughness: 0.55, envMapIntensity: 0.12 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x15151c, metalness: 0, roughness: 0.75 }),
  cable: new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.6, roughness: 0.35 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xdfe8ff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.03,
    envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
  acrylic: new THREE.MeshPhysicalMaterial({ color: 0xc9d6ff, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.22, clearcoat: 1, envMapIntensity: 1.4,
    side: THREE.DoubleSide, depthWrite: false }),
  crystal: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.025, transmission: 1, ior: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, envMapIntensity: 2.2, attenuationColor: new THREE.Color(0xc9d2ff), attenuationDistance: 0.9 }),
  glow: new THREE.MeshPhysicalMaterial({ color: 0x2c3d8f, emissive: 0x4660d6, emissiveIntensity: 0.32, metalness: 0.1, roughness: 0.15, clearcoat: 1 }),
  led: new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xffd49a, emissiveIntensity: 0.9, roughness: 0.5 }),
  ledSoft: new THREE.MeshStandardMaterial({ color: 0xc9a46a, emissive: 0xffb45e, emissiveIntensity: 0.22, roughness: 0.45, metalness: 0.2 }),
  slot: new THREE.MeshStandardMaterial({ color: 0x050608, metalness: 0.2, roughness: 0.8 }),
  sign: new THREE.MeshStandardMaterial({ map: T.sign, emissiveMap: T.sign, emissive: 0xffffff, emissiveIntensity: 0.28, metalness: 0.3, roughness: 0.45 }),
  back: new THREE.MeshStandardMaterial({ map: T.back, emissiveMap: T.back, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.7 }),
  floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.92, metalness: 0 }),
  front: new THREE.MeshPhysicalMaterial({ map: T.front, metalness: 0.25, roughness: 0.45, clearcoat: 0.4 }),
  sidePlaque: new THREE.MeshPhysicalMaterial({ map: T.side, metalness: 0.3, roughness: 0.42, clearcoat: 0.4 }),
  panel: new THREE.MeshPhysicalMaterial({ map: T.panel, metalness: 0.25, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x0b1130, metalness: 0.3, roughness: 0.45 }),
};

MAT.crystal.thickness = 0.16;   // （型別定義的參數表少了這個欄位，建立後再設定）
MAT.crystal.iridescence = 0.45; MAT.crystal.iridescenceIOR = 1.28; MAT.crystal.iridescenceThicknessRange = [180, 420];   // 玻璃上淡淡的彩虹光（跟 GPT 的水晶球一樣）

/* ============================== 小工具 ============================== */
/** @param {THREE.BufferGeometry} g @param {THREE.Material|THREE.Material[]} m @param {THREE.Object3D} parent @param {number} [x] @param {number} [y] @param {number} [z] */
function mesh(g, m, parent, x = 0, y = 0, z = 0, cast = true, receive = true) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = receive; parent.add(o); return o;
}
/** 一個長方體 */
function box(w, h, d, m, parent, x, y, z, cast = true, receive = true) { return mesh(new THREE.BoxGeometry(w, h, d), m, parent, x, y, z, cast, receive); }
/** 兩點之間的圓柱（管子、桿子） */
function rod(a, b, r, m, parent, cast = true) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const o = mesh(new THREE.CylinderGeometry(r, r, L, 14), m, parent, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, cast, true);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ============================== 1. 機台本體 ============================== */
const machine = new THREE.Group(); scene.add(machine);
/** @type {THREE.Object3D[]} 俯視鏡頭不畫的東西（招牌箱、天花板），其他鏡頭照常 */
const HIDE_IN_TOP = [];
const G_BODY = new THREE.Group(), G_ROOM = new THREE.Group(), G_TOP = new THREE.Group(), G_CONSOLE = new THREE.Group(), G_CHUTE = new THREE.Group();
machine.add(G_BODY, G_ROOM, G_TOP, G_CONSOLE, G_CHUTE);

mesh(new THREE.CircleGeometry(9, 64), MAT.ground, scene, 0, 0, 0, false, true).rotation.x = -Math.PI / 2;

function buildBody() {
  const g = G_BODY;
  // 底座
  box(OW + 0.1, 0.08, OD + 0.1, MAT.navyDark, g, 0, 0.04, 0);
  box(OW + 0.12, 0.025, OD + 0.12, MAT.brass, g, 0, 0.09, 0);
  // 左右側板、後板、頂板（遊戲室地板下）
  for (const s of [-1, 1]) {
    box(0.05, FY - 0.1, OD, MAT.navy, g, s * (OW / 2 - 0.025), 0.1 + (FY - 0.1) / 2, 0);
    const plaque = mesh(new THREE.PlaneGeometry(0.62, 1.15), MAT.sidePlaque, g, s * (OW / 2 + 0.001), 0.72, -0.05, false, true);
    plaque.rotation.y = s * Math.PI / 2;
    // 側板金邊
    box(0.03, 0.03, OD + 0.02, MAT.brass, g, s * (OW / 2 + 0.005), FY - 0.015, 0);
    box(0.03, FY - 0.1, 0.03, MAT.brass, g, s * (OW / 2 + 0.005), 0.1 + (FY - 0.1) / 2, -OD / 2 + 0.01);
  }
  box(OW, FY - 0.1, 0.04, MAT.navy, g, 0, 0.1 + (FY - 0.1) / 2, -OD / 2 + 0.02);
  // 正面面板（挖出取獎口和收藏券出口，是真的洞）
  const sh = new THREE.Shape();
  sh.moveTo(-OW / 2, 0.1); sh.lineTo(OW / 2, 0.1); sh.lineTo(OW / 2, LOW_H); sh.lineTo(-OW / 2, LOW_H); sh.closePath();
  const door = new THREE.Path(); door.moveTo(DOOR.x0, DOOR.y0); door.lineTo(DOOR.x0, DOOR.y1); door.lineTo(DOOR.x1, DOOR.y1); door.lineTo(DOOR.x1, DOOR.y0); door.closePath();
  const slot = new THREE.Path(); const sx0 = -OW / 2 + 0.757 * OW, sx1 = -OW / 2 + 0.884 * OW, sy0 = (1 - 0.742) * LOW_H, sy1 = (1 - 0.537) * LOW_H;
  slot.moveTo(sx0, sy0); slot.lineTo(sx0, sy1); slot.lineTo(sx1, sy1); slot.lineTo(sx1, sy0); slot.closePath();
  sh.holes.push(door, slot);
  const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
  const front = mesh(fg, [MAT.front, MAT.navy], g, 0, 0, FRONT_Z - 0.03, true, true);
  front.userData.front = true;
  // 收藏券出口：裡面一個小凹槽
  const sw = sx1 - sx0, shh = sy1 - sy0, scx = (sx0 + sx1) / 2, scy = (sy0 + sy1) / 2, sd = 0.07, sz = FRONT_Z - 0.03 - sd / 2;
  box(sw, shh, 0.01, MAT.inside, g, scx, scy, FRONT_Z - 0.03 - sd, false, true);
  box(sw, 0.01, sd, MAT.insideFloor, g, scx, sy0 - 0.005, sz, false, true); box(sw, 0.01, sd, MAT.inside, g, scx, sy1 + 0.005, sz, false, true);
  for (const x of [sx0 - 0.005, sx1 + 0.005]) box(0.01, shh, sd, MAT.inside, g, x, scy, sz, false, true);
  return { sx0, sx1, sy0, sy1 };
}
const SLOT = buildBody();

/* 斜面控制台：從下櫃正面上緣往玩家方向伸出來，表面傾斜 */
const PANEL = {};
const ART = { x0: -0.9175, x1: 0.1536, jsX: -0.5, jsV: 0.5768 };   // 控制台貼圖裡方向面板的左右邊界、搖桿位置（tools/make_console.py）
function buildConsole() {
  const g = G_CONSOLE;
  const prof = new THREE.Shape();
  prof.moveTo(CON.z0, CON.yBottom); prof.lineTo(CON.z0, CON.yBack); prof.lineTo(CON.z1, CON.yFront); prof.lineTo(CON.z1, CON.yLip);
  prof.lineTo(CON.z1 - 0.12, CON.yBottom); prof.closePath();
  const geo = new THREE.ExtrudeGeometry(prof, { depth: OW, bevelEnabled: false });
  const body = mesh(geo, MAT.navy, g, OW / 2, 0, 0); body.rotation.y = -Math.PI / 2;
  // 斜面的方向
  const back = V(0, CON.yBack, CON.z0), fr = V(0, CON.yFront, CON.z1);
  const along = new THREE.Vector3().subVectors(fr, back), L = along.length(); along.normalize();
  const normal = new THREE.Vector3(0, along.z, -along.y).normalize();          // 朝上、朝玩家
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(1, 0, 0), along.clone().negate(), normal));
  // 斜面整片貼圖（2.4 m 寬）：左邊是 GPT 的方向面板（搖桿在四個箭頭中間），右邊是琺瑯深藍，裝按鈕和投幣口
  const plane = mesh(new THREE.PlaneGeometry(OW, L), MAT.panel, g, 0, 0, 0, false, true);
  plane.quaternion.copy(q); plane.position.copy(back).addScaledVector(along, L / 2).addScaledVector(normal, 0.002);
  // 斜面金邊
  rod(V(-OW / 2, CON.yBack + 0.012, CON.z0 + 0.01), V(OW / 2, CON.yBack + 0.012, CON.z0 + 0.01), 0.018, MAT.brass, g);
  rod(V(-OW / 2, CON.yFront, CON.z1), V(OW / 2, CON.yFront, CON.z1), 0.022, MAT.brass, g);
  rod(V(-OW / 2, CON.yLip, CON.z1), V(OW / 2, CON.yLip, CON.z1), 0.012, MAT.brass, g);
  /** 斜面上的位置：x 是世界座標，v 是從後緣往前的比例 → 世界座標 */
  const at = (x, v) => back.clone().addScaledVector(along, v * L).addScaledVector(V(1, 0, 0), x);
  const lift = (p, h) => p.clone().addScaledVector(normal, h);
  for (const x of [ART.x0, ART.x1]) rod(lift(at(x, 0.02), 0.006), lift(at(x, 0.98), 0.006), 0.009, MAT.brass, g);
  Object.assign(PANEL, { along, normal, q, L, at });
  /** 在斜面上放一組零件：本地 Y 是斜面的法線（朝上），Z 往玩家 */
  const seat = (x, v) => { const o = new THREE.Group(); o.position.copy(at(x, v)); o.quaternion.copy(q); g.add(o); const up = new THREE.Group(); up.rotation.x = Math.PI / 2; o.add(up); return up; };
  // ---- 搖桿（底座、橡膠套、桿子、水晶球頭；桿子可以傾斜）
  const jsUp = seat(ART.jsX, ART.jsV);
  mesh(new THREE.CylinderGeometry(0.094, 0.1, 0.02, 40), MAT.brass, jsUp, 0, 0.01, 0);
  mesh(new THREE.TorusGeometry(0.084, 0.009, 10, 44), MAT.brassDark, jsUp, 0, 0.022, 0).rotation.x = Math.PI / 2;
  const stickPivot = new THREE.Group(); stickPivot.position.y = 0.022; stickPivot.scale.setScalar(1.25); jsUp.add(stickPivot);
  mesh(new THREE.CylinderGeometry(0.022, 0.05, 0.05, 24), MAT.rubber, stickPivot, 0, 0.025, 0);
  for (let i = 0; i < 3; i++) mesh(new THREE.TorusGeometry(0.044 - i * 0.009, 0.007, 8, 24), MAT.rubber, stickPivot, 0, 0.008 + i * 0.016, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.13, 16), MAT.brass, stickPivot, 0, 0.09, 0);
  mesh(new THREE.SphereGeometry(0.042, 32, 20), MAT.crystal, stickPivot, 0, 0.17, 0);
  mesh(new THREE.SphereGeometry(0.014, 16, 10), MAT.brass, stickPivot, 0, 0.17, 0);
  mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.02, 16), MAT.brass, stickPivot, 0, 0.13, 0);
  // ---- 投幣口（黃銅面板、投幣槽、退幣鈕、指示燈）
  const coin = seat(0.95, 0.5);
  mesh(new THREE.BoxGeometry(0.16, 0.016, 0.25), MAT.brass, coin, 0, 0.008, 0);
  mesh(new THREE.BoxGeometry(0.12, 0.006, 0.2), MAT.navyDark, coin, 0, 0.017, 0);
  mesh(new THREE.BoxGeometry(0.03, 0.01, 0.1), MAT.brassDark, coin, 0, 0.02, -0.025);
  mesh(new THREE.BoxGeometry(0.012, 0.012, 0.082), MAT.slot, coin, 0, 0.021, -0.025);
  mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.016, 24), MAT.brassDark, coin, 0, 0.026, 0.065);
  mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 16), MAT.ledSoft, coin, 0, 0.022, -0.088);
  // ---- 抓取按鈕（外圈、按鈕本體；按下會往下沉）
  const btUp = seat(0.5, 0.5);
  const flange = mesh(new THREE.RingGeometry(0.15, 0.2, 56), MAT.brass, btUp, 0, 0.004, 0, false, true); flange.rotation.x = -Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.176, 0.006, 8, 56), MAT.ledSoft, btUp, 0, 0.006, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.148, 0.155, 0.03, 48), MAT.brass, btUp, 0, 0.015, 0);
  mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.034, 48), MAT.navyDark, btUp, 0, 0.018, 0);
  const capMats = [new THREE.MeshPhysicalMaterial({ color: 0xf1d9a4, metalness: 0.5, roughness: 0.3 }),
    new THREE.MeshPhysicalMaterial({ map: T.btn, transparent: true, alphaTest: 0.2, metalness: 0.15, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1 }),
    new THREE.MeshStandardMaterial({ color: 0x3a2a10 })];
  const cap = mesh(new THREE.CylinderGeometry(0.122, 0.124, 0.045, 48), capMats, btUp, 0, 0.042, 0);
  Object.assign(PANEL, { stickPivot, cap, capY: 0.042 });
}
buildConsole();

/* 遊戲室：立柱、上下框、玻璃、後牆、地板、天花板 */
function buildRoom() {
  const g = G_ROOM;
  const px = OW / 2 - PIL / 2, pz = OD / 2 - PIL / 2, ph = TOP_Y0 - FY + 0.06, py = FY - 0.03 + ph / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(PIL, ph, PIL, MAT.brass, g, sx * px, py, sz * pz);
    if (sz > 0) box(0.045, ph - 0.12, 0.006, MAT.navy, g, sx * px, py, pz + PIL / 2 + 0.002, false, true);   // 前立柱的琺瑯飾條
  }
  // 下框、上框
  for (const y of [FY + 0.02, GLASS_Y1 + 0.04]) {
    const t = y < 2 ? 0.08 : 0.08;
    box(OW - 2 * PIL, t, 0.07, MAT.brass, g, 0, y, GZ + 0.005);
    box(OW - 2 * PIL, t, 0.07, MAT.brass, g, 0, y, BZ - 0.005);
    for (const s of [-1, 1]) box(0.07, t, OD - 2 * PIL, MAT.brass, g, s * (GX + 0.005), y, 0);
  }
  // 玻璃：正面、左右（真的透明面板，有厚度感的反光）
  const gh = GLASS_Y1 - GLASS_Y0, gy = (GLASS_Y0 + GLASS_Y1) / 2;
  const fg = mesh(new THREE.PlaneGeometry(2 * GX, gh), MAT.glass, g, 0, gy, GZ, false, false); fg.renderOrder = 20;
  const deco = mesh(new THREE.PlaneGeometry(2 * GX, gh), new THREE.MeshBasicMaterial({ map: T.glassDecal, transparent: true, depthWrite: false, opacity: 0.85 }), g, 0, gy, GZ + 0.004, false, false);
  deco.renderOrder = 21;
  for (const s of [-1, 1]) { const sg = mesh(new THREE.PlaneGeometry(2 * ZI + 0.06, gh), MAT.glass, g, s * GX, gy, 0, false, false); sg.rotation.y = Math.PI / 2; sg.renderOrder = 20; }
  // 後牆（不透明的星空時鐘）
  mesh(new THREE.PlaneGeometry(2 * GX, GLASS_Y1 - FY), MAT.back, g, 0, (FY + GLASS_Y1) / 2, BZ, false, true);
  // 地板（左前角是出獎口，所以是 L 形）
  const fl = new THREE.Shape();
  fl.moveTo(-GX, BZ); fl.lineTo(GX, BZ); fl.lineTo(GX, GZ); fl.lineTo(HX1, GZ); fl.lineTo(HX1, HZ0); fl.lineTo(-GX, HZ0); fl.closePath();
  const floor = mesh(new THREE.ExtrudeGeometry(fl, { depth: 0.03, bevelEnabled: false }), [MAT.floor, MAT.navyDark], g, 0, FY, 0, false, true);
  floor.rotation.x = Math.PI / 2; floor.position.y = FY;   // 形狀的 y 變成世界的 z
  // 天花板＋暖色燈條
  const ceil = mesh(new THREE.PlaneGeometry(2 * GX, 2 * ZI + 0.06), MAT.navyDark, g, 0, GLASS_Y1 + 0.075, 0, false, true); ceil.rotation.x = Math.PI / 2;
  HIDE_IN_TOP.push(ceil);
  for (const z of [GZ - 0.05, BZ + 0.05]) HIDE_IN_TOP.push(box(2 * GX - 0.1, 0.012, 0.035, MAT.led, g, 0, GLASS_Y1 + 0.06, z, false, false));
}
buildRoom();

/* 招牌箱 */
function buildTop() {
  const g = G_TOP, h = OH - TOP_Y0 - 0.05;
  const mats = [MAT.navy, MAT.navy, MAT.navy, MAT.navy, MAT.sign, MAT.navy];
  box(OW, h, OD, mats, g, 0, TOP_Y0 + h / 2, 0);
  box(OW + 0.1, 0.05, OD + 0.1, MAT.brass, g, 0, OH - 0.025, 0);
  box(OW + 0.06, 0.03, OD + 0.06, MAT.brass, g, 0, TOP_Y0 + 0.015, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(0.05, 20, 14), MAT.brass, g, sx * (OW / 2 + 0.02), OH + 0.03, sz * (OD / 2 + 0.02));
  // 側面金色飾框
  for (const s of [-1, 1]) {
    const x = s * (OW / 2 + 0.006), y0 = TOP_Y0 + 0.08, y1 = OH - 0.12, z0 = -OD / 2 + 0.1, z1 = OD / 2 - 0.1;
    rod(V(x, y0, z0), V(x, y0, z1), 0.012, MAT.brass, g); rod(V(x, y1, z0), V(x, y1, z1), 0.012, MAT.brass, g);
    rod(V(x, y0, z0), V(x, y1, z0), 0.012, MAT.brass, g); rod(V(x, y0, z1), V(x, y1, z1), 0.012, MAT.brass, g);
    mesh(new THREE.SphereGeometry(0.035, 16, 12), MAT.brass, g, x, (y0 + y1) / 2, 0);
  }
  HIDE_IN_TOP.push(g);
}
buildTop();

/* 出獎口：遊戲室裡的洞（防護板＋導流斜板），下櫃裡的掉落通道，正面的取獎口和可開關的擋板 */
const FLAP = {};
function buildChute() {
  const g = G_CHUTE;
  const hx = (HX0 + HX1) / 2, hz = (HZ0 + HZ1) / 2;
  // 防護板（壓克力）＋金色上緣
  const a1 = mesh(new THREE.PlaneGeometry(CH, HB), MAT.acrylic, g, HX1, FY + HB / 2, hz, false, false); a1.rotation.y = Math.PI / 2; a1.renderOrder = 15;
  const a2 = mesh(new THREE.PlaneGeometry(CH, HB), MAT.acrylic, g, hx, FY + HB / 2, HZ0, false, false); a2.renderOrder = 15;
  rod(V(HX1, FY + HB, HZ0), V(HX1, FY + HB, HZ1), 0.014, MAT.brass, g);
  rod(V(HX0, FY + HB, HZ0), V(HX1, FY + HB, HZ0), 0.014, MAT.brass, g);
  rod(V(HX1, FY, HZ0), V(HX1, FY + HB, HZ0), 0.016, MAT.brass, g);
  // 洞口金框
  rod(V(HX1, FY + 0.01, HZ0), V(HX1, FY + 0.01, HZ1), 0.02, MAT.brass, g);
  rod(V(HX0, FY + 0.01, HZ0), V(HX1, FY + 0.01, HZ0), 0.02, MAT.brass, g);
  // 導流斜板（黃銅漏斗）：從洞口往下收到喉部，把球導向取獎口那一側
  const top = [V(HX0, FY, HZ0), V(HX1, FY, HZ0), V(HX1, FY, HZ1), V(HX0, FY, HZ1)];
  const bot = [V(TX0, YT, TZ0), V(TX1, YT, TZ0), V(TX1, YT, TZ1), V(TX0, YT, TZ1)];
  const pos = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pos.push(...top[i].toArray(), ...top[j].toArray(), ...bot[j].toArray(), ...top[i].toArray(), ...bot[j].toArray(), ...bot[i].toArray()); }
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); fgeo.computeVertexNormals();
  mesh(fgeo, new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.brass, metalness: 1, roughness: 0.35, side: THREE.DoubleSide }), g, 0, 0, 0, false, true);
  // 掉落通道（下櫃裡面，霧黑內壁）：左右牆、後牆、前牆（取獎口上方）、隧道頂、往前斜的底
  /** 一片牆：中心、寬、高、朝向 */
  const wall = (w, h, x, y, z, ry, m = MAT.inside) => { const o = mesh(new THREE.PlaneGeometry(w, h), m, g, x, y, z, false, true); o.rotation.y = ry; return o; };
  const yb = rampY(TZ0) - 0.02, sh = YT - yb, sy = (YT + yb) / 2, sd = FLAP_Z - TZ0, szc = (FLAP_Z + TZ0) / 2;
  wall(sd, sh, TX0, sy, szc, Math.PI / 2); wall(sd, sh, TX1, sy, szc, Math.PI / 2);
  wall(TX1 - TX0, sh, (TX0 + TX1) / 2, sy, TZ0, 0);
  wall(TX1 - TX0, YT - DOOR.y1, (TX0 + TX1) / 2, (YT + DOOR.y1) / 2, TZ1, 0);
  const roof = mesh(new THREE.PlaneGeometry(TX1 - TX0, FLAP_Z - TZ1), MAT.inside, g, (TX0 + TX1) / 2, DOOR.y1, (TZ1 + FLAP_Z) / 2, false, true); roof.rotation.x = Math.PI / 2;
  const rl = Math.hypot(FLAP_Z - TZ0, rampY(TZ0) - DOOR.y0);
  const ramp = mesh(new THREE.PlaneGeometry(TX1 - TX0, rl), MAT.insideFloor, g, (TX0 + TX1) / 2, (rampY(TZ0) + DOOR.y0) / 2, szc, false, true);
  ramp.rotation.x = -Math.PI / 2 + Math.atan2(rampY(TZ0) - DOOR.y0, FLAP_Z - TZ0);
  const dw = DOOR.x1 - DOOR.x0, dh = DOOR.y1 - DOOR.y0, dx = (DOOR.x0 + DOOR.x1) / 2;
  const fz = FRONT_Z + 0.012;
  rod(V(DOOR.x0 - 0.015, DOOR.y0 - 0.015, fz), V(DOOR.x1 + 0.015, DOOR.y0 - 0.015, fz), 0.017, MAT.brass, g);
  rod(V(DOOR.x0 - 0.015, DOOR.y1 + 0.015, fz), V(DOOR.x1 + 0.015, DOOR.y1 + 0.015, fz), 0.017, MAT.brass, g);
  rod(V(DOOR.x0 - 0.015, DOOR.y0 - 0.015, fz), V(DOOR.x0 - 0.015, DOOR.y1 + 0.015, fz), 0.017, MAT.brass, g);
  rod(V(DOOR.x1 + 0.015, DOOR.y0 - 0.015, fz), V(DOOR.x1 + 0.015, DOOR.y1 + 0.015, fz), 0.017, MAT.brass, g);
  // 擋板：上緣有鉸鍊，可以往外翻開
  const hinge = new THREE.Group(); hinge.position.set(dx, DOOR.y1 - 0.01, FLAP_Z); g.add(hinge);
  rod(V(DOOR.x0 + 0.01, 0, 0).add(V(-dx, 0, 0)), V(DOOR.x1 - 0.01, 0, 0).add(V(-dx, 0, 0)), 0.012, MAT.brass, hinge);
  const flapGlass = mesh(new THREE.PlaneGeometry(dw - 0.03, dh - 0.03), new THREE.MeshPhysicalMaterial({ color: 0x8a9bd6, metalness: 0, roughness: 0.15,
    transparent: true, opacity: 0.35, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }), hinge, 0, -(dh - 0.03) / 2, 0, false, false);
  flapGlass.renderOrder = 16;
  box(dw - 0.03, 0.03, 0.012, MAT.brass, hinge, 0, -(dh - 0.03), 0);
  Object.assign(FLAP, { hinge, angle: 0, target: 0 });
}
buildChute();

/* ============================== 燈光 ============================== */
scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x1a1208, 0.35));
const key = new THREE.DirectionalLight(0xfff0d8, 1.25); key.position.set(3.5, 7, 6); key.target.position.set(0, 1.8, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -3.4, right: 3.4, top: 4.6, bottom: -1.2, near: 1, far: 18 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0x8fa2ff, 0.45); fill.position.set(-5, 3.5, 3); scene.add(fill);
const roomSpot = new THREE.SpotLight(0xffe2b8, 1.6, 4.5, 0.95, 0.55, 1.2); roomSpot.position.set(0, GLASS_Y1 - 0.02, 0.05); roomSpot.target.position.set(0, FY, 0);
roomSpot.castShadow = true; roomSpot.shadow.mapSize.set(1024, 1024); roomSpot.shadow.bias = -0.0006; roomSpot.shadow.camera.near = 0.2; roomSpot.shadow.camera.far = 3;
scene.add(roomSpot, roomSpot.target);
for (const x of [-0.8, 0.8]) { const p = new THREE.PointLight(0xffd29a, 0.35, 2.6, 1.6); p.position.set(x, GLASS_Y1 - 0.1, 0.45); scene.add(p); }
const doorLight = new THREE.PointLight(0xffd88a, 0, 1.2, 2); doorLight.position.set((DOOR.x0 + DOOR.x1) / 2, (DOOR.y0 + DOOR.y1) / 2, FRONT_Z + 0.15); scene.add(doorLight);

/* ============================== 2. 軌道、台車、爪子 ============================== */
const G_GANTRY = new THREE.Group(); scene.add(G_GANTRY);
const beam = new THREE.Group(); G_GANTRY.add(beam);       // 前後移動（Z）
const carriage = new THREE.Group(); beam.add(carriage);    // 左右移動（X）
function buildGantry() {
  // 兩條固定的 Z 軸軌道（貼在天花板下）
  for (const s of [-1, 1]) {
    const x = s * (GX - 0.07);
    box(0.05, 0.045, 2 * ZI + 0.02, MAT.brass, G_GANTRY, x, RAIL_Y, 0);
    box(0.012, 0.06, 2 * ZI + 0.02, MAT.brassDark, G_GANTRY, x - s * 0.03, RAIL_Y + 0.02, 0);
    for (const z of [-ZI, ZI]) box(0.07, 0.07, 0.04, MAT.brass, G_GANTRY, x, RAIL_Y + 0.02, z);
  }
  // X 軸橫樑（跟著 Z 移動）：金屬樑＋兩端滑塊＋輪子；正面貼 rail_x 當局部紋理
  const bl = 2 * (GX - 0.07);
  box(bl - 0.06, 0.05, 0.075, MAT.brass, beam, 0, BEAM_Y, 0);
  const strip = mesh(new THREE.PlaneGeometry(bl - 0.1, 0.05), new THREE.MeshStandardMaterial({ map: T.railx, metalness: 0.8, roughness: 0.35, transparent: true, alphaTest: 0.1 }),
    beam, 0, BEAM_Y, 0.0385, false, false);
  const strip2 = strip.clone(); strip2.position.z = -0.0385; strip2.rotation.y = Math.PI; beam.add(strip2);
  for (const s of [-1, 1]) {
    box(0.1, 0.075, 0.13, MAT.navy, beam, s * (GX - 0.07), BEAM_Y + 0.01, 0);
    for (const dz of [-0.04, 0.04]) { const w = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), MAT.brassDark, beam, s * (GX - 0.07), RAIL_Y + 0.03, dz); w.rotation.z = Math.PI / 2; }
  }
  // 台車（跟著 X 移動）
  box(0.2, 0.085, 0.17, MAT.navy, carriage, 0, BEAM_Y - 0.015, 0);
  const lid = mesh(new THREE.BoxGeometry(0.21, 0.018, 0.18), [MAT.brass, MAT.brass, new THREE.MeshStandardMaterial({ map: T.carriage, metalness: 0.9, roughness: 0.3 }), MAT.brass, MAT.brass, MAT.brass],
    carriage, 0, BEAM_Y + 0.036, 0);
  lid.castShadow = true;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 14), MAT.brassDark, carriage, sx * 0.07, BEAM_Y + 0.032, sz * 0.05); w.rotation.x = Math.PI / 2; }
  mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 20), MAT.brass, carriage, 0, ANCHOR_Y + 0.012, 0);   // 捲線器出口
}
buildGantry();

/* 吊線 */
const cableMesh = mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 1, 10), MAT.cable, scene, 0, 0, 0, true, false);
/* 爪子（照 GPT 爪子圖）：吊環、上蓋、星星琺瑯環、柱身＋活塞、發光水晶環、關節座、三根兩節式爪臂（上連桿＋彎爪）、伸縮撐桿、星星圓章 */
const claw = new THREE.Group(); scene.add(claw);
/** @type {THREE.Group[]} */ const arms = [];
/** @type {{sleeve:THREE.Mesh, rod:THREE.Mesh, top:THREE.Vector3}[]} */ const struts = [];
const ARM_A = [0, 1, 2].map(k => Math.PI / 2 + k * 2 * Math.PI / 3);                 // 第一根朝正面
const ARM_JOINT = ARM_A.map(a => V(JOINT_R * Math.cos(a), PALM, JOINT_R * Math.sin(a)));
const ARM_AXIS = ARM_A.map(a => V(-Math.sin(a), 0, Math.cos(a)));                     // 關節轉軸（爪子座標）
/** 有粗細變化的扁管：沿著爪臂平面上的曲線；w = 平面內的寬、h = 垂直平面的厚、off = 往外偏移
 * @param {THREE.Curve<THREE.Vector3>} curve @param {number} n @param {(t:number)=>number} wFn @param {(t:number)=>number} hFn
 * @param {((t:number)=>number)|null} [off] @param {number} [radial] */
function bladeGeometry(curve, n, wFn, hFn, off = null, radial = 14) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), T0 = curve.getTangentAt(t), N = V(-T0.y, T0.x, 0);
    const w = wFn(t) / 2, h = hFn(t) / 2, o = off ? off(t) : 0;
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a);
      pos.push(p.x + N.x * (w * c + o), p.y + N.y * (w * c + o), h * s2); uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function buildClaw() {
  const B = MAT.brass, Bd = MAT.brassDark;
  const medalMat = new THREE.MeshStandardMaterial({ map: T.medal, transparent: true, alphaTest: 0.35, metalness: 0.45, roughness: 0.3 });
  /** 關節軸兩端的星星圓章（朝 ±z 的小圓牌＋金框） */
  const medals = (parent, x, y, half, r) => {
    for (const s2 of [1, -1]) {
      const d = mesh(new THREE.CircleGeometry(r, 28), medalMat, parent, x, y, s2 * (half + 0.0008), false, false); if (s2 < 0) d.rotation.y = Math.PI;
      mesh(new THREE.TorusGeometry(r, r * 0.17, 8, 28), B, parent, x, y, s2 * half, false, false);
    }
  };
  // 中央部分
  mesh(new THREE.TorusGeometry(0.024, 0.007, 10, 28), B, claw, 0, -0.012, 0);
  mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.04, 20), B, claw, 0, -0.045, 0);
  mesh(new THREE.CylinderGeometry(0.09, 0.112, 0.03, 40), B, claw, 0, -0.08, 0);
  mesh(new THREE.TorusGeometry(0.112, 0.008, 10, 48), B, claw, 0, -0.095, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.016, 48), B, claw, 0, -0.103, 0);
  const bandMat = new THREE.MeshPhysicalMaterial({ map: T.band, metalness: 0.35, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  mesh(new THREE.CylinderGeometry(0.126, 0.126, 0.07, 64, 1, true), bandMat, claw, 0, -0.146, 0);
  for (const y of [-0.112, -0.18]) mesh(new THREE.TorusGeometry(0.128, 0.005, 8, 56), B, claw, 0, y, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.016, 48), B, claw, 0, -0.189, 0);
  mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.02, 40), B, claw, 0, -0.207, 0);
  mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 40), B, claw, 0, -0.24, 0);
  const glowMat = new THREE.MeshStandardMaterial({ map: T.glowBand, emissiveMap: T.glowBand, emissive: 0xffffff, emissiveIntensity: 0.55, metalness: 0.1, roughness: 0.25 });
  mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.045, 48, 1, true), glowMat, claw, 0, -0.288, 0, false, false);
  for (const y of [-0.265, -0.31]) mesh(new THREE.TorusGeometry(0.068, 0.006, 8, 40), B, claw, 0, y, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.04, 40), B, claw, 0, -0.33, 0);
  mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.012, 32), Bd, claw, 0, -0.354, 0);
  // 柱身旁邊的活塞（裝飾，在兩根爪臂中間）
  for (const a of ARM_A) {
    const x = 0.088 * Math.cos(a + Math.PI / 3), z = 0.088 * Math.sin(a + Math.PI / 3);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 14), B, claw, x, -0.255, z);
    mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.016, 14), Bd, claw, x, -0.315, z);
  }
  // 三根爪臂
  const talon = new THREE.CatmullRomCurve3(FINGER.slice(1).map(([x, y]) => V(x, y, 0)), false, "centripetal");
  const bar = new THREE.LineCurve3(V(0, 0, 0), V(FINGER[1][0], FINGER[1][1], 0));
  const wT = (t) => 0.005 + 0.031 * (1 - Math.pow(t, 2.2)), hT = (t) => 0.005 + 0.037 * (1 - Math.pow(t, 2.4));
  const barGeo = bladeGeometry(bar, 4, () => 0.036, () => 0.04);
  const talonGeo = bladeGeometry(talon, 60, wT, hT);
  // 爪臂外側的深藍琺瑯飾條（只在上半段）
  const inlayCurve = new THREE.CatmullRomCurve3([0.04, 0.12, 0.22, 0.32, 0.42, 0.5].map(t => talon.getPointAt(t)), false, "centripetal");
  const inlayGeo = bladeGeometry(inlayCurve, 30, () => 0.008, (t) => hT(0.04 + t * 0.46) * 0.62, (t) => wT(0.04 + t * 0.46) / 2 - 0.002);
  for (let k = 0; k < 3; k++) {
    const a = ARM_A[k];
    const pivot = new THREE.Group(); pivot.position.copy(ARM_JOINT[k]); pivot.rotation.y = -a; claw.add(pivot);
    const arm = new THREE.Group(); pivot.add(arm);
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 20), B, arm, 0, 0, 0).rotation.x = Math.PI / 2;   // 關節
    medals(arm, 0, 0, 0.025, 0.019);
    mesh(barGeo, B, arm);
    const [ex, ey] = FINGER[1];
    mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.048, 20), B, arm, ex, ey, 0).rotation.x = Math.PI / 2;  // 手肘
    medals(arm, ex, ey, 0.024, 0.018);
    mesh(talonGeo, B, arm);
    mesh(inlayGeo, MAT.navy, arm, 0, 0, 0, false, false);
    arm.rotation.z = PHI.open;
    arms.push(arm);
    // 伸縮撐桿：從發光環旁邊的上關節，接到爪臂手肘（爪子張合時會跟著伸縮）
    const top = V(0.085 * Math.cos(a), -0.288, 0.085 * Math.sin(a));
    const up = new THREE.Group(); up.position.copy(top); up.rotation.y = -a; claw.add(up);
    mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 16), B, up, 0, 0, 0).rotation.x = Math.PI / 2;
    medals(up, 0, 0, 0.02, 0.014);
    const sleeve = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 14), B, claw);
    const rod = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.07, 12), Bd, claw);
    struts.push({ sleeve, rod, top });
  }
}
buildClaw();
/** 爪臂上第 i 個點（爪子座標） */
function armPoint(i, phi, k, out) {
  const [x, y] = FINGER[i], a = ARM_A[k];
  const xr = x * Math.cos(phi) - y * Math.sin(phi), yr = x * Math.sin(phi) + y * Math.cos(phi);
  const r = JOINT_R + xr; return (out || new THREE.Vector3()).set(r * Math.cos(a), PALM + yr, r * Math.sin(a));
}
/** 點到線段：最近點參數 t */
function segT(px, py, pz, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L2 = abx * abx + aby * aby + abz * abz;
  return L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / L2));
}
/* 抱住一顆球的角度（截圖、示範用） */
const PHI_GRAB = (() => {
  const e0 = V(0, 0, 0), e1 = V(0, 0, 0);
  for (let phi = PHI.open; phi > PHI.closed; phi -= 0.004) {
    let m = 1e9;
    for (let i = 1; i < FINGER.length - 1; i++) {
      armPoint(i, phi, 0, e0); armPoint(i + 1, phi, 0, e1); const t = segT(0, BALL_Y, 0, e0, e1);
      m = Math.min(m, Math.hypot(e0.x + (e1.x - e0.x) * t, e0.y + (e1.y - e0.y) * t - BALL_Y, e0.z + (e1.z - e0.z) * t) - FINGER_R[i]);
    }
    if (m <= R + 0.003) return phi;
  }
  return 0;
})();

/* ============================== 3. 水晶球 ============================== */
/** @typedef {{x:number,y:number,z:number,vx:number,vy:number,vz:number,k:any,held:boolean,gone:boolean,inChute:boolean,arrived:boolean,wasHeld?:boolean,onRamp?:boolean,x0?:number,y0?:number,z0?:number,cc?:boolean,
 *  obj:THREE.Group, spin:THREE.Group, card:THREE.Group, shadow:THREE.Mesh}} Ball */
/** @type {Ball[]} */
let balls = [];
const G_BALLS = new THREE.Group(); scene.add(G_BALLS);
const GEO = {
  ball: new THREE.SphereGeometry(R, 48, 32), shell: new THREE.SphereGeometry(R * 1.006, 40, 24),
  card: new THREE.CircleGeometry(R * 0.62, 48), rim: new THREE.RingGeometry(R * 0.62, R * 0.655, 48), shadow: new THREE.PlaneGeometry(R * 2.7, R * 2.7),
};
const shellMats = [T.pat1, T.pat2, T.patR].map(m => new THREE.MeshStandardMaterial({ map: m, transparent: true, depthWrite: false, metalness: 1, roughness: 0.28, color: 0xffe2a8 }));
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb98a3c, metalness: 1, roughness: 0.42, side: THREE.DoubleSide });
const shadowMat = new THREE.MeshBasicMaterial({ map: T.shadow, transparent: true, depthWrite: false, opacity: 0.55, color: 0x000000 });
let rnd = Math.random;
function makeBallMesh(k) {
  const obj = new THREE.Group(), spin = new THREE.Group(), card = new THREE.Group();
  obj.add(spin, card);
  const glass = new THREE.Mesh(GEO.ball, MAT.crystal); glass.castShadow = false; spin.add(glass);
  const shell = new THREE.Mesh(GEO.shell, shellMats[k.rare ? 2 : k.pat]); shell.renderOrder = 6; spin.add(shell);
  const map = k.type === "photo" ? (pics[k.p] && pics[k.p].tex) || T.photos[0] : T.props[k.prop];
  const pic = new THREE.Mesh(GEO.card, new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0 }));
  card.add(pic, new THREE.Mesh(GEO.rim, rimMat));
  const shadow = new THREE.Mesh(GEO.shadow, shadowMat.clone()); shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 2; scene.add(shadow);
  G_BALLS.add(obj);
  return { obj, spin, card, shadow };
}
function clearBalls() { for (const b of balls) { G_BALLS.remove(b.obj); scene.remove(b.shadow); } balls = []; }
let settling = false;
function makeBalls() {
  clearBalls();
  const kinds = [];
  const np = Math.max(1, pics.length), anyRare = pics.some(x => x.rare);
  for (let i = 0; i < 13; i++) { const p = i % np; kinds.push({ type: "photo", p, pat: i % 2, rare: anyRare ? !!(pics[p] && pics[p].rare) && i < np : i === 4 }); }
  kinds.push({ type: "prop", prop: 0, name: TT(PROPS[0][1]), pat: 0 }, { type: "prop", prop: 1, name: TT(PROPS[1][1]), pat: 1 });
  for (let i = kinds.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const spots = [];
  for (let layer = 0; layer < 3; layer++) for (let zi = 0; zi < 3; zi++) for (let xi = 0; xi < 5; xi++) {
    const x = -0.84 + xi * 0.42 + (layer % 2) * 0.21, z = -0.5 + zi * 0.42 + (layer % 2) * 0.21;
    if (x > GX - R || z > GZ - R) continue;
    if (x < HX1 + R && z > HZ0 - R) continue;
    spots.push([x, FY + R + layer * 0.36, z]);
  }
  kinds.forEach((k, i) => {
    const [x, y, z] = spots[i];
    const b = /** @type {Ball} */ ({ x: x + (rnd() - 0.5) * 0.05, y, z: z + (rnd() - 0.5) * 0.05, vx: 0, vy: 0, vz: 0, k, held: false, gone: false, inChute: false, arrived: false, ...makeBallMesh(k) });
    b.spin.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    balls.push(b);
  });
  settling = true; for (let i = 0; i < 1400; i++) physics(1 / 240); settling = false;
  for (const b of balls) { b.vx = b.vy = b.vz = 0; }
  syncBalls(0);
}

/* ============================== 物理 ============================== */
const PLATES = [
  { x0: HX1 - 0.01, x1: HX1 + 0.01, z0: HZ0 - 0.01, z1: HZ1 },
  { x0: HX0, x1: HX1 + 0.01, z0: HZ0 - 0.01, z1: HZ0 + 0.01 },
];
const overHole = (b) => b.x < HX1 && b.z > HZ0;
function plate(b, p) {
  const qx = Math.max(p.x0, Math.min(b.x, p.x1)), qy = Math.max(FY, Math.min(b.y, settling ? 4 : FY + HB)), qz = Math.max(p.z0, Math.min(b.z, p.z1));
  let dx = b.x - qx, dy = b.y - qy, dz = b.z - qz, d = Math.hypot(dx, dy, dz);
  if (d >= R) return;
  if (d < 1e-6) { dy = 1; d = 1; }
  const nx = dx / d, ny = dy / d, nz = dz / d, push = R - d;
  b.x += nx * push; b.y += ny * push; b.z += nz * push;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz; if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; b.vz -= 1.3 * vn * nz; }
}
/* 漏斗四面斜板：每一面是一個平面（法線朝通道裡面） */
const FUNNEL = (() => {
  const top = [V(HX0, FY, HZ0), V(HX1, FY, HZ0), V(HX1, FY, HZ1), V(HX0, FY, HZ1)];
  const bot = [V(TX0, YT, TZ0), V(TX1, YT, TZ0), V(TX1, YT, TZ1), V(TX0, YT, TZ1)];
  const c = V((TX0 + TX1) / 2, (FY + YT) / 2, (TZ0 + TZ1) / 2), out = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, n = new THREE.Vector3().subVectors(top[j], top[i]).cross(new THREE.Vector3().subVectors(bot[i], top[i])).normalize();
    if (n.dot(new THREE.Vector3().subVectors(c, top[i])) < 0) n.negate();
    out.push({ p: top[i], n });
  }
  return out;
})();
/** 球在漏斗裡（洞口上方到喉部）：碰到斜板就沿著板子滑 */
function funnel(b) {
  if (b.y < YT || b.y > FY + R) return;
  for (const f of FUNNEL) {
    const s = f.n.x * (b.x - f.p.x) + f.n.y * (b.y - f.p.y) + f.n.z * (b.z - f.p.z);
    if (s >= R) continue;
    const cy = b.y - f.n.y * s; if (cy > FY + 0.01 || cy < YT - 0.01) continue;   // 接觸點要在斜板上（不是斜板延伸出去的平面）
    const push = R - s; b.x += f.n.x * push; b.y += f.n.y * push; b.z += f.n.z * push;
    const vn = b.vx * f.n.x + b.vy * f.n.y + b.vz * f.n.z;
    if (vn < 0) { b.vx -= 1.25 * vn * f.n.x; b.vy -= 1.25 * vn * f.n.y; b.vz -= 1.25 * vn * f.n.z; }
  }
}
/** 掉進洞以後：漏斗 → 直通道 → 往前斜的底部 → 取獎口擋板 */
function chuteWalls(b) {
  funnel(b);
  if (b.y < YT + 0.02) {
    const lo = TX0 + R + 0.004, hi = TX1 - R - 0.004;
    if (b.x < lo) { b.x = lo; if (b.vx < 0) b.vx *= -0.3; } if (b.x > hi) { b.x = hi; if (b.vx > 0) b.vx *= -0.3; }
    const zlo = TZ0 + R + 0.004, zhi = b.y + R > DOOR.y1 ? TZ1 - R - 0.004 : FLAP_Z - R - 0.005;   // 前牆只到取獎口上緣，下面可以往前滾
    if (b.z < zlo) { b.z = zlo; if (b.vz < 0) b.vz *= -0.3; } if (b.z > zhi) { b.z = zhi; if (b.vz > 0) b.vz *= -0.2; }
  }
  const fy = rampY(b.z) + R;
  if (b.y < fy) { b.y = fy; if (b.vy < 0) b.vy *= -0.25; b.onRamp = true; }
}
/* ============================== 爪子碰撞：碰到球會被擋住 ==============================
 * 爪子當成有重量的機構：吊線長度（上下）和三根爪臂的角度都可以被推回去，球是會動的。
 * 碰到時一起修正位置：推得動的球被推開；推不動（下面有地板或別的球撐著）就換爪子被頂住——
 * 往下放的時候停住、合爪的時候那根爪臂停在碰到的角度。夾住以後球是靠三根爪臂「托著」上升，不是貼在爪子上。
 */
const W_BALL = 1, W_CABLE = 0.45;
let wArm = 8;                                              // 爪臂角度的反慣量：夾緊時變小（比較硬）
const phis = [PHI.open, PHI.open, PHI.open], phisPrev = [PHI.open, PHI.open, PHI.open];
const armTouch = [0, 0, 0];
let cablePush = 0;                                         // 這一小步吊線被往上頂回去的量（判斷「放到底了」）
const _down = V(0, -1, 0);
const CL = { M: V(0, 0, 0), q: new THREE.Quaternion(), qi: new THREE.Quaternion(), axis: V(0, -1, 0), Mp: V(0, 0, 0), qp: new THREE.Quaternion() };
/** @type {THREE.Vector3[][]} 三根爪臂的點（爪子座標） */
const FP = [0, 1, 2].map(() => FINGER.map(() => V(0, 0, 0)));
function fingerPts(k) { for (let i = 0; i < FINGER.length; i++) armPoint(i, phis[k], k, FP[k][i]); }
function clawFrame() {
  CL.axis.set(sw.x, -(cable + CLAW_COM), sw.z).normalize();
  CL.q.setFromUnitVectors(_down, CL.axis); CL.qi.copy(CL.q).invert();
  CL.M.set(car.x, ANCHOR_Y, car.z).addScaledVector(CL.axis, cable);
}
function saveClawPrev() { CL.Mp.copy(CL.M); CL.qp.copy(CL.q); for (let k = 0; k < 3; k++) phisPrev[k] = phis[k]; }
const _l = V(0, 0, 0), _p = V(0, 0, 0), _n = V(0, 0, 0), _nw = V(0, 0, 0), _J = V(0, 0, 0), _e0 = V(0, 0, 0), _e1 = V(0, 0, 0), _w0 = V(0, 0, 0), _w1 = V(0, 0, 0);
/** 套用一次修正：λ、吊線方向的梯度、爪臂角度的梯度（k=-1 表示沒有爪臂） */
function applyClaw(lam, wc, gCab, wa, gPhi, k) {
  if (wc) { const dc = lam * wc * gCab; cable += dc; if (dc < 0) cablePush -= dc; CL.M.addScaledVector(CL.axis, dc); }
  if (k >= 0) { armTouch[k] = 1; if (wa) { phis[k] = Math.max(PHI.closed, Math.min(PHI_MAX, phis[k] + lam * wa * gPhi)); fingerPts(k); } }
}
/** 吊線、爪臂可不可以往那個方向動（捲線器不會被拉長；到頂、到極限就不能再動） */
function wCab(g) { return (g > 0 || cable <= CABLE0 + 1e-6) ? 0 : W_CABLE; }
function wPhi(g, k) { return (g > 0 && phis[k] >= PHI_MAX) || (g < 0 && phis[k] <= PHI.closed) ? 0 : wArm; }
/** 某個爪子零件上的點（爪子座標 p）現在的速度：跟上一小步同一點的位置比 */
function partVel(pNow, pPrev, dt, out) {
  _w0.copy(pNow).applyQuaternion(CL.q).add(CL.M); _w1.copy(pPrev).applyQuaternion(CL.qp).add(CL.Mp);
  return out.subVectors(_w0, _w1).multiplyScalar(1 / dt);
}
const _vp = V(0, 0, 0), _pp = V(0, 0, 0), _pn = V(0, 0, 0);
/** 球和爪子零件接觸後：球不能再往零件裡面跑（相對速度的法線分量歸零） */
function ballVel(b, nw, vp) {
  const vr = (b.vx - vp.x) * nw.x + (b.vy - vp.y) * nw.y + (b.vz - vp.z) * nw.z;
  if (vr < 0) { b.vx -= vr * nw.x; b.vy -= vr * nw.y; b.vz -= vr * nw.z; }
}
/** 球和中央圓柱（爪子座標裡的直立圓柱 y0~y1、半徑 rh） */
function hubContact(b, y0, y1, rh, dt) {
  const rho = Math.hypot(_l.x, _l.z), s = rho > rh ? rh / rho : 1;
  _p.set(_l.x * s, Math.max(y0, Math.min(y1, _l.y)), _l.z * s);
  if (_l.y >= y0 && _l.y <= y1 && rho > 1e-6) _p.set(_l.x * rh / rho, _l.y, _l.z * rh / rho);
  _n.subVectors(_l, _p); const d = _n.length(), C = d - R; if (C >= 0) return;
  b.cc = true;
  if (d < 1e-6) _n.set(0, -1, 0); else _n.multiplyScalar(1 / d);
  const gCab = _n.y, wc = wCab(gCab), lam = -C / (W_BALL + wc * gCab * gCab);
  _nw.copy(_n).applyQuaternion(CL.q);
  b.x += _nw.x * lam; b.y += _nw.y * lam; b.z += _nw.z * lam; _l.addScaledVector(_n, lam);
  applyClaw(lam, wc, gCab, 0, 0, -1); if (wc) _l.y += lam * wc * gCab;
  ballVel(b, _nw, partVel(_p, _p, dt, _vp));
}
/** 球和第 k 根爪臂的第 i 段 */
function fingerContact(b, k, i, dt) {
  const a = FP[k][i], c = FP[k][i + 1], t = segT(_l.x, _l.y, _l.z, a, c);
  _p.set(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t, a.z + (c.z - a.z) * t);
  _n.subVectors(_l, _p); const d = _n.length(), C = d - (R + FINGER_R[i]); if (C >= 0) return;
  b.cc = true;
  if (d < 1e-6) _n.set(0, -1, 0); else _n.multiplyScalar(1 / d);
  _J.subVectors(_p, ARM_JOINT[k]); _J.crossVectors(ARM_AXIS[k], _J);              // 爪臂張開時這一點往哪裡動
  const gCab = _n.y, gPhi = -_n.dot(_J), wc = wCab(gCab), wa = wPhi(gPhi, k);
  const lam = -C / (W_BALL + wc * gCab * gCab + wa * gPhi * gPhi);
  _nw.copy(_n).applyQuaternion(CL.q);
  b.x += _nw.x * lam; b.y += _nw.y * lam; b.z += _nw.z * lam; _l.addScaledVector(_n, lam);
  applyClaw(lam, wc, gCab, wa, gPhi, k); if (wc) _l.y += lam * wc * gCab;
  // 這一點的速度：修正後的位置 跟 上一小步同一點（同一根爪、同一個位置）比
  armPoint(i, phisPrev[k], k, _e0); armPoint(i + 1, phisPrev[k], k, _e1); _pp.lerpVectors(_e0, _e1, t);
  _pn.lerpVectors(FP[k][i], FP[k][i + 1], t);
  ballVel(b, _nw, partVel(_pn, _pp, dt, _vp));
}
/** 一顆球和整個爪子 */
function clawBall(b, dt) {
  const dx = b.x - CL.M.x, dy = b.y - CL.M.y, dz = b.z - CL.M.z;
  if (dx * dx + dz * dz > 0.62 * 0.62 || dy > 0.25 || dy < -1.05) return;
  _l.set(dx, dy, dz).applyQuaternion(CL.qi);
  hubContact(b, HUB_BOT, -0.2, 0.075, dt);
  hubContact(b, -0.2, -0.09, 0.135, dt);
  for (let k = 0; k < 3; k++) for (let i = 0; i < FINGER.length - 1; i++) fingerContact(b, k, i, dt);
}
/** 爪子碰地板、玻璃、出獎口防護板：爪子被推回去（吊線變短或爪臂被推開/推合） */
function clawStatic() {
  for (let k = 0; k < 3; k++) {
    for (let i = 1; i < FINGER.length; i++) {
      const r = FINGER_R[i - 1], pl = FP[k][i];
      const pw = _w0.copy(pl).applyQuaternion(CL.q).add(CL.M);
      _J.subVectors(pl, ARM_JOINT[k]); _J.crossVectors(ARM_AXIS[k], _J).applyQuaternion(CL.q);
      const A = CL.axis;
      /** 一個限制：C < 0 表示穿進去；gc、gp 是 C 對吊線、爪臂角度的梯度 */
      const fix = (C, gc, gp) => {
        if (C >= 0) return;
        const wc = wCab(gc), wa = wPhi(gp, k), W = wc * gc * gc + wa * gp * gp; if (W < 1e-9) return;
        applyClaw(-C / W, wc, gc, wa, gp, k);
      };
      if (!(pw.x < HX1 && pw.z > HZ0)) fix(pw.y - r - FY, A.y, _J.y);
      fix(GX - r - pw.x, -A.x, -_J.x); fix(pw.x + GX - r, A.x, _J.x);
      fix(GZ - r - pw.z, -A.z, -_J.z); fix(pw.z - BZ - r, A.z, _J.z);
      if (pw.y < FY + HB + r) for (const p of PLATES) {
        const qx = Math.max(p.x0, Math.min(pw.x, p.x1)), qy = Math.max(FY, Math.min(pw.y, FY + HB)), qz = Math.max(p.z0, Math.min(pw.z, p.z1));
        const nx = pw.x - qx, ny = pw.y - qy, nz = pw.z - qz, d = Math.hypot(nx, ny, nz);
        if (d >= r || d < 1e-6) continue;
        fix(d - r, (nx * A.x + ny * A.y + nz * A.z) / d, (nx * _J.x + ny * _J.y + nz * _J.z) / d);
      }
    }
  }
  // 中央圓柱底部碰地板
  const hb = _w0.set(0, HUB_BOT, 0).applyQuaternion(CL.q).add(CL.M);
  if (!(hb.x < HX1 && hb.z > HZ0) && hb.y - 0.04 < FY) { const gc = CL.axis.y, wc = wCab(gc); if (wc) applyClaw(-(hb.y - 0.04 - FY) / (wc * gc * gc), wc, gc, 0, 0, -1); }
}
function physics(dt) {
  cablePush = 0;
  for (const b of balls) { if (b.gone || b.arrived) continue; b.x0 = b.x; b.y0 = b.y; b.z0 = b.z; b.cc = false; b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; }
  for (let it = 0; it < 3; it++) {
    clawFrame(); for (let k = 0; k < 3; k++) fingerPts(k);
    clawStatic();
    for (const b of balls) if (!b.gone && !b.arrived) clawBall(b, dt);
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]; if (a.gone) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]; if (b.gone) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= 4 * R * R || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, ov = 2 * R - d;
        const fa = a.arrived, fb = b.arrived;
        const wa = fa ? 0 : (fb ? 1 : 0.5), wb = fb ? 0 : (fa ? 1 : 0.5);
        a.x -= nx * ov * wa; a.y -= ny * ov * wa; a.z -= nz * ov * wa; b.x += nx * ov * wb; b.y += ny * ov * wb; b.z += nz * ov * wb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
        if (rv < 0) { const j2 = -1.15 * rv; if (!fa) { a.vx -= j2 * nx * wa; a.vy -= j2 * ny * wa; a.vz -= j2 * nz * wa; } if (!fb) { b.vx += j2 * nx * wb; b.vy += j2 * ny * wb; b.vz += j2 * nz * wb; } }
      }
    }
    for (const b of balls) {
      if (b.gone || b.arrived) continue;
      if (b.inChute) { chuteWalls(b); continue; }
      if (b.x < -GX + R) { b.x = -GX + R; if (b.vx < 0) b.vx *= -0.3; } if (b.x > GX - R) { b.x = GX - R; if (b.vx > 0) b.vx *= -0.3; }
      if (b.z < BZ + R) { b.z = BZ + R; if (b.vz < 0) b.vz *= -0.3; } if (b.z > GZ - R - 0.006) { b.z = GZ - R - 0.006; if (b.vz > 0) b.vz *= -0.3; }
      if (!overHole(b) && b.y < FY + R) { b.y = FY + R; if (b.vy < 0) b.vy *= -0.22; }
      if (b.y > GLASS_Y1 - R) { b.y = GLASS_Y1 - R; if (b.vy > 0) b.vy = 0; }
      for (const p of PLATES) plate(b, p);
      if (overHole(b)) funnel(b);
      if (overHole(b) && b.y < FY - 0.05) b.inChute = true;
    }
  }
  for (const b of balls) {
    if (b.gone || b.arrived) continue;
    // 被爪子碰到的球：速度＝這一小步真的移動了多少（被爪子托著、推著時才不會亂加速）
    if (b.cc) {
      let vx = (b.x - (b.x0 ?? b.x)) / dt, vy = (b.y - (b.y0 ?? b.y)) / dt, vz = (b.z - (b.z0 ?? b.z)) / dt; const v = Math.hypot(vx, vy, vz);
      if (v > 2.5) { vx *= 2.5 / v; vy *= 2.5 / v; vz *= 2.5 / v; }
      b.vx = vx; b.vy = vy; b.vz = vz;
    }
    const k = 1 - 0.8 * dt; b.vx *= k; b.vy *= k; b.vz *= k;
    if (b.inChute) {   // 掉落通道底部往前斜：沿著斜坡往取獎口滾
      if (b.onRamp) { b.vz += G * 0.24 * dt; b.vx *= 0.99; b.onRamp = false; }
    } else if (!b.held) {
      if (!overHole(b) && b.y <= FY + R + 0.001) { b.vx *= 0.985; b.vz *= 0.985; }
      if (Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.vz) < 0.09) { b.vx *= 0.6; b.vz *= 0.6; if (b.vy > 0) b.vy *= 0.6; }
    }
    if (b.inChute && b.z > FLAP_Z - R - 0.05 && b.y < DOOR.y0 + R + 0.12 && Math.hypot(b.vx, b.vy, b.vz) < 0.25 && !settling) arrive(b);
    if (settling && b.inChute) { b.gone = true; b.obj.visible = false; b.shadow.visible = false; }
  }
  clawFrame(); saveClawPrev();
}

/* ============================== 遊戲狀態 ============================== */
let state = "loading", st = 0, timer = TIME, coins = 10, misses = 0;
const car = { x: HOME.x, z: HOME.z, vx: 0, vz: 0 }, sw = { x: 0, z: 0, vx: 0, vz: 0 };
let cable = CABLE0, look = "open";            // look：open 張開、grip 夾緊、weak 爪力變弱
/** @type {Ball|null} */ let held = null;
/** @type {any} */ let plan = null;
let liftStart = 0, travelLen = 1, resultShown = false, inPile = false, stall = 0;
/** @type {Ball|null} */ let pendingWin = null;
let simMode = false, forceOk = false;
const stats = { grab: 0, nograb: 0, planOk: 0, slip: 0, weak: 0, winHeld: 0, winLuck: 0 };
const stick = { x: 0, y: 0 }, keys = {};
let grabDown = false;
clawFrame(); saveClawPrev();

function clawGeom() {
  clawFrame();
  const q = CL.q.clone(), M = CL.M.clone();
  const toW = (p) => p.clone().applyQuaternion(q).add(M);
  const tips = [0, 1, 2].map(k => toW(armPoint(FINGER.length - 1, phis[k], k)));
  return { A: V(car.x, ANCHOR_Y, car.z), M, q, axis: CL.axis.clone(), palm: toW(V(0, HUB_BOT, 0)), ballc: toW(V(0, BALL_Y, 0)), tips, toW };
}
/** 爪子回到出獎口上方、收到最上面、張開（重新擺球前先把爪子移開，免得球碰到爪子） */
function clawHome() {
  if (held) { held.held = false; held = null; }
  car.x = HOME.x; car.z = HOME.z; car.vx = car.vz = 0; cable = CABLE0; sw.x = sw.z = sw.vx = sw.vz = 0;
  look = "open"; phis.fill(PHI.open); armTouch.fill(0); clawFrame(); saveClawPrev();
}
function say(t) { const m = document.getElementById("msg"); if (!m) return; m.textContent = t; m.style.opacity = t ? "1" : "0"; }
function updCoins() { const el = document.getElementById("coins"); if (el) el.textContent = TT("coins", { n: coins }); }
function startAim() {
  if (state !== "ready") return false;
  if (coins <= 0) { state = "over"; say(TT("over")); return false; }
  coins--; updCoins(); state = "aim"; timer = TIME; say(""); sfx("coin"); return true;
}
function startDrop() { if (state !== "aim") return; state = "drop"; st = 0; stall = 0; look = "open"; say(""); sfx("drop"); send({ type: "haptic", k: "light" }); }
const overHoleXZ = (x, z) => x < HX1 + 0.05 && z > HZ0 - 0.05;
/** 往下放什麼時候停：被球或地板頂住（吊線一直被推回來）、爪子在出獎口上方、吊線放到底 */
function dropStopped() {
  if (stall > 0.035) return true;
  const g = clawGeom(), low = Math.min(...g.tips.map(t => t.y));
  if (overHoleXZ(g.M.x, g.M.z) && low <= FY + HB + 0.03) return true;
  return cable >= CABLE_MAX;
}
/** 球心在爪子座標裡的位置 */
function inClaw(b) { clawFrame(); return _l.set(b.x - CL.M.x, b.y - CL.M.y, b.z - CL.M.z).applyQuaternion(CL.qi); }
/** 有幾根爪臂在球的下半部碰到它（＝托得住） */
function cradleCount(b) {
  const l = inClaw(b).clone(); let n = 0;
  for (let k = 0; k < 3; k++) {
    fingerPts(k); let ok = false;
    for (let i = 1; i < FINGER.length - 1; i++) {
      const a = FP[k][i], c = FP[k][i + 1], t = segT(l.x, l.y, l.z, a, c);
      const px = a.x + (c.x - a.x) * t, py = a.y + (c.y - a.y) * t, pz = a.z + (c.z - a.z) * t;
      const gap = Math.hypot(l.x - px, l.y - py, l.z - pz) - R - FINGER_R[i];
      if (gap < 0.015 && py < l.y - 0.02) ok = true;      // 這根爪在球的下半部貼著它
    }
    if (ok) n++;
  }
  return n;
}
/** 合爪以後：看看爪子裡有沒有真的托住一顆球 → 決定這次夾力夠不夠（真實娃娃機的「爪力」） */
function detectGrip(quiet = false) {
  let best = null, bs = -1e9;
  for (const b of balls) {
    if (b.gone || b.inChute || b.arrived) continue;
    const l = inClaw(b), rho = Math.hypot(l.x, l.z);
    if (rho > 0.2 || l.y > HUB_BOT || l.y < BALL_Y - 0.25) continue;
    const n = cradleCount(b); if (n < 2) continue;
    const sc = n - rho * 4; if (sc > bs) { bs = sc; best = { b, n, rho }; }
  }
  if (!best) { if (!quiet) stats.nograb++; return null; }
  if (quiet) stats.nograb--;
  const q = (best.n === 3 ? 1 : 0.55) * Math.max(0, 1 - Math.pow(best.rho / 0.17, 1.5));
  const pity = misses >= 4 ? Math.min(0.35, (misses - 3) * 0.08) : 0;
  const p = Math.min(0.9, 0.05 + 0.5 * Math.pow(q, 1.3) * (0.8 + rnd() * 0.35) + pity);   // 夾得正、三根爪都托住 → 爪力比較常夠
  const ok = forceOk || rnd() < p, r = rnd();
  plan = ok ? { type: "none" } : r < 0.45 ? { type: "lift", at: 0.15 + rnd() * 0.75 } : r < 0.8 ? { type: "top" } : { type: "travel", at: 0.05 + rnd() * 0.45 };
  stats.grab++; if (ok) stats.planOk++;
  return best.b;
}
/** 爪力變弱：爪臂慢慢鬆開，球如果卡不住就會自己掉下去 */
function weaken() { if (!held || look === "weak") return; look = "weak"; stats.weak++; }
/** 球真的離開爪子了 */
function lost() {
  if (!held) return;
  const b = held; held = null; b.held = false;
  stats.slip++; say(TT("slip")); sfx("slip"); send({ type: "haptic", k: "light" }); setTimeout(() => { if (state !== "win") say(""); }, 1100);
}
function arrive(b) {
  b.arrived = true; b.vx = b.vy = b.vz = 0;
  if (resultShown || pendingWin) return;
  if (b.wasHeld) stats.winHeld++; else stats.winLuck++;
  if (!["release", "ready", "aim", "over"].includes(state)) { pendingWin = b; return; }
  doWin(b);
}
function doWin(b) {
  pendingWin = null; resultShown = true; misses = 0; state = "win"; sfx("win");
  if (simMode) return;
  say(TT("win")); FLAP.target = -1.15; doorLight.intensity = 1.2; burst(); send({ type: "haptic", k: "success" });
  setTimeout(() => showTicket(b), 1100);
}
function finishTry() {
  if (state === "win") return;
  if (pendingWin) { doWin(pendingWin); return; }
  misses++; state = coins > 0 ? "ready" : "over"; look = "open";
  say(coins > 0 ? TT("miss") : TT("over")); setTimeout(() => { if (state === "ready") say(""); }, 1600);
}
function stickWorld() {
  let sx = stick.x, sy = stick.y;
  if (keys.ArrowLeft || keys.a) sx = -1; if (keys.ArrowRight || keys.d) sx = 1; if (keys.ArrowUp || keys.w) sy = 1; if (keys.ArrowDown || keys.s) sy = -1;
  const m = Math.hypot(sx, sy); if (m < 0.15) return { x: 0, z: 0 }; if (m > 1) { sx /= m; sy /= m; }
  // 搖桿往上＝往畫面裡面、往右＝畫面的右邊（鏡頭轉到側面、背面也一樣好操作）
  const c = Math.cos(orbit.yaw), sn = Math.sin(orbit.yaw);
  return { x: sx * c - sy * sn, z: -sx * sn - sy * c };
}
function update(dt) {
  st += dt;
  let tvx = 0, tvz = 0;
  if (state === "aim") {
    timer -= dt; if (timer <= 0) { timer = 0; startDrop(); }
    const v = stickWorld(); tvx = v.x * VMAX; tvz = v.z * VMAX;
  } else if (state === "travel") {
    const dx = HOME.x - car.x, dz = HOME.z - car.z, dist = Math.hypot(dx, dz), sp = Math.min(VTRAVEL, dist * 2.4);
    if (dist > 0.001) { tvx = dx / dist * sp; tvz = dz / dist * sp; }
    if (plan && plan.type === "travel" && held && 1 - dist / travelLen >= plan.at) weaken();
    if (dist < 0.008 && Math.hypot(car.vx, car.vz) < 0.03) { state = "settle"; st = 0; }
  }
  const pvx = car.vx, pvz = car.vz, cl = (v, t) => Math.max(-AMAX * dt, Math.min(AMAX * dt, t - v));
  car.vx += cl(car.vx, tvx); car.vz += cl(car.vz, tvz);
  car.x += car.vx * dt; car.z += car.vz * dt;
  const nx = Math.max(-CAR_X, Math.min(CAR_X, car.x)), nz = Math.max(CAR_ZMIN, Math.min(CAR_ZMAX, car.z));
  if (nx !== car.x) { car.x = nx; car.vx = 0; } if (nz !== car.z) { car.z = nz; car.vz = 0; }
  const ax = (car.vx - pvx) / dt, az = (car.vz - pvz) / dt;
  const Lp = cable + CLAW_COM, w2 = G / Lp, w = Math.sqrt(w2), zeta = inPile ? 0.9 : (state === "settle" ? 0.5 : 0.06);
  sw.vx += (-w2 * sw.x - 2 * zeta * w * sw.vx - ax) * dt; sw.vz += (-w2 * sw.z - 2 * zeta * w * sw.vz - az) * dt;
  sw.x += sw.vx * dt; sw.z += sw.vz * dt;
  const mx = 0.33 * Lp, m = Math.hypot(sw.x, sw.z); if (m > mx) { sw.x *= mx / m; sw.z *= mx / m; }
  const g = clawGeom();
  inPile = balls.some(b => !b.gone && !b.held && !b.inChute && b.y + R > Math.min(...g.tips.map(t => t.y)) && Math.hypot(b.x - g.palm.x, b.z - g.palm.z) < R + 0.4);
  // 吊線：往下放時如果一直被頂回來（碰到球或地板）就停
  if (state === "drop") {
    stall = cablePush > 0.5 * VDROP * dt ? stall + dt : Math.max(0, stall - dt * 0.5);
    cable = Math.min(CABLE_MAX, cable + VDROP * dt);
    if (dropStopped()) { state = "pause"; st = 0; stall = 0; sfx("stop"); }
  }
  else if ((state === "pause" || state === "close" || state === "hold") && !overHoleXZ(g.M.x, g.M.z)) cable = Math.min(CABLE_MAX, cable + VDROP * 0.25 * dt);   // 爪子自己的重量讓它坐穩
  if (state === "pause" && st > 0.25) { state = "close"; st = 0; look = "grip"; sfx("clank"); }
  else if (state === "close" && st >= 0.55) {
    const b = detectGrip();
    if (b) { held = b; b.held = true; b.wasHeld = false; } else plan = null;
    state = "hold"; st = 0;
  }
  else if (state === "hold" && st > 0.3) { state = "lift"; st = 0; liftStart = cable; }
  else if (state === "lift") {
    cable -= VLIFT * dt;
    if (plan && plan.type === "lift" && held && 1 - (cable - CABLE0) / Math.max(0.01, liftStart - CABLE0) >= plan.at) weaken();
    if (cable <= CABLE0) { cable = CABLE0; state = "top"; st = 0; sfx("stop"); }
  }
  else if (state === "top" && st > 0.35) {
    if (plan && plan.type === "top" && held) weaken();
    state = "travel"; st = 0; travelLen = Math.max(0.01, Math.hypot(HOME.x - car.x, HOME.z - car.z));
  }
  else if (state === "settle" && st > 0.8) {
    state = "release"; st = 0; look = "open";
    if (held) { held.held = false; held.wasHeld = true; held = null; }
    sfx("clank");
  }
  else if (state === "release" && (st > 3.6 || (st > 1.2 && !balls.some(b => b.inChute && !b.arrived && !b.gone)))) finishTry();
  if (!held && (state === "hold" || (state === "lift" && cable > liftStart - 0.25))) {
    const b = detectGrip(true); if (b) { held = b; b.held = true; b.wasHeld = false; }
  }
  // 球是不是還在爪子裡（爪力變弱或沒夾好會自己掉）
  if (held && ["lift", "top", "travel", "settle"].includes(state)) {
    const l = inClaw(held); if (Math.hypot(l.x, l.z) > 0.27 || l.y < BALL_Y - 0.3) lost();
  }
  // 三根爪臂的馬達：往目標角度轉；碰到東西就停在那裡（只會很慢地再壓一點點）
  const tgt = look === "grip" ? PHI.closed : look === "weak" ? PHI_WEAK : PHI.open;
  wArm = look === "grip" ? 1.5 : 8;
  for (let k = 0; k < 3; k++) {
    const d = tgt - phis[k], sp = (d < 0 ? (armTouch[k] ? 0.1 : 2.6) : (look === "weak" ? 0.9 : 2.6)) * dt;
    phis[k] += Math.max(-sp, Math.min(sp, d)); armTouch[k] = 0;
  }
  hum((state === "aim" && Math.hypot(car.vx, car.vz) > 0.05) || state === "travel" || state === "drop" || state === "lift");
}

/* ============================== 同步畫面 ============================== */
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = V(0, 1, 0);
function syncClaw() {
  const g = clawGeom();
  beam.position.z = car.z; carriage.position.x = car.x;
  claw.position.copy(g.M); claw.quaternion.copy(g.q);
  for (let k = 0; k < 3; k++) {
    arms[k].rotation.z = phis[k];
    // 撐桿：上關節 → 手肘，外管固定在上面、內桿跟著手肘（會伸縮）
    const s2 = struts[k], e = armPoint(1, phis[k], k), dir = e.clone().sub(s2.top), L = dir.length(); dir.multiplyScalar(1 / L);
    s2.sleeve.position.copy(s2.top).addScaledVector(dir, 0.035); s2.sleeve.quaternion.setFromUnitVectors(_up, dir);
    s2.rod.position.copy(e).addScaledVector(dir, -0.035); s2.rod.quaternion.setFromUnitVectors(_up, dir);
  }
  const mid = g.A.clone().add(g.M).multiplyScalar(0.5), d = g.A.clone().sub(g.M), L = d.length();
  cableMesh.position.copy(mid); cableMesh.scale.set(1, Math.max(0.001, L), 1); cableMesh.quaternion.setFromUnitVectors(_up, d.normalize());
}
function syncBalls(dt) {
  for (const b of balls) {
    if (b.gone) { b.obj.visible = false; b.shadow.visible = false; continue; }
    // 滾動：沿著移動方向轉
    const vh = Math.hypot(b.vx, b.vz);
    if (dt > 0 && vh > 0.01 && !b.held) { _v.set(b.vz, 0, -b.vx).normalize(); b.spin.rotateOnWorldAxis(_v, vh * dt / R); }
    b.obj.position.set(b.x, b.y, b.z);
    b.card.quaternion.copy(activeCam.quaternion);
    const onFloor = !b.inChute && !overHole(b);
    b.shadow.visible = onFloor;
    if (onFloor) { b.shadow.position.set(b.x, FY + 0.003, b.z + 0.01); /** @type {any} */ (b.shadow.material).opacity = Math.max(0.12, 0.6 - (b.y - FY - R) * 0.9); }
  }
}

/* ============================== 相機（只有整體視角：拖曳轉動 260 度、雙指／滾輪縮放） ============================== */
const persp = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
const activeCam = persp;
const YAW_MAX = THREE.MathUtils.degToRad(130);             // 左右各 130 度＝可以轉 260 度
const PITCH = [0.03, 1.0], ZOOM = [0.75, 2.6];
const ORBIT0 = { yaw: 0.62, pitch: 0.2, zoom: 1 };
const orbit = { ...ORBIT0, fx: 0, fz: 0.15 };                  // fx/fz：鏡頭看的地方（放大時會跟著爪子）
const VIEW = { w: 1, h: 1, availH: 1, cyPx: 0 };
function insets() {
  const top = /** @type {HTMLElement} */ (document.getElementById("hud")).getBoundingClientRect().bottom + 6;
  // 橫向畫面：搖桿和按鈕在左右兩角，不會擋到機台，下面只要讓出中間那行提示字
  if (window.innerWidth > window.innerHeight * 1.15) {
    const hint = /** @type {HTMLElement} */ (document.querySelector("#controls .hint")).getBoundingClientRect();
    return { top, bottom: hint.height > 0 ? window.innerHeight - hint.top + 8 : 10 };
  }
  const ctl = /** @type {HTMLElement} */ (document.getElementById("controls")).getBoundingClientRect();
  return { top, bottom: window.innerHeight - ctl.top + 6 };
}
function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  // 很大的畫面（電腦全螢幕、高解析度螢幕）降低一點解析度，最多大約 400 萬像素，才不會卡
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1, Math.sqrt(4e6 / Math.max(1, w * h))));
  renderer.setSize(w, h, false);
  const ins = insets(), availH = Math.max(120, h - ins.top - ins.bottom);
  Object.assign(VIEW, { w, h, availH, cyPx: ins.top + availH / 2 });
  persp.aspect = w / h;
  updateCam(0);
}
/** 每一格調整鏡頭：轉的角度、遠近；放大的時候慢慢對準爪子（方便瞄準） */
function updateCam(dt) {
  const { w, h, availH, cyPx } = VIEW;
  const k = Math.max(0, Math.min(0.85, (orbit.zoom - 1) / 1.1));
  const tx = car.x * k, tz = 0.15 + (car.z - 0.15) * k, f = dt ? Math.min(1, dt * 5) : 1;
  orbit.fx += (tx - orbit.fx) * f; orbit.fz += (tz - orbit.fz) * f;
  const target = V(orbit.fx, 2.0 - 0.25 * k, orbit.fz), tanH = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
  const needH = 4.75, needW = 3.25;
  const d = Math.max(needH * h / (2 * tanH * availH), needW * h / (2 * tanH * w * 0.96)) / orbit.zoom;
  persp.position.set(target.x + d * Math.sin(orbit.yaw) * Math.cos(orbit.pitch), target.y + d * Math.sin(orbit.pitch), target.z + d * Math.cos(orbit.yaw) * Math.cos(orbit.pitch));
  persp.lookAt(target); persp.updateProjectionMatrix();
  const shift = 1 - 2 * cyPx / h;                // 讓機台出現在上下控制列之間
  persp.projectionMatrix.elements[9] = -shift; persp.projectionMatrixInverse.copy(persp.projectionMatrix).invert();
}
let camFree = false;                               // 測試截圖用：鏡頭自己擺，不要每格重算

/* ============================== 特效：取獎口的星光 ============================== */
const sparkles = [];
function burst() {
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sparkle, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2a0 }));
    s.position.set((DOOR.x0 + DOOR.x1) / 2 + (rnd() - 0.5) * 0.6, (DOOR.y0 + DOOR.y1) / 2 + (rnd() - 0.5) * 0.7, FRONT_Z + 0.08 + rnd() * 0.2);
    s.userData = { t: -i * 0.07, life: 1.4 }; s.scale.setScalar(0.001); scene.add(s); sparkles.push(s);
  }
}
function tickSparkles(dt) {
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i]; s.userData.t += dt; const t = s.userData.t;
    if (t < 0) continue;
    const k = t / s.userData.life; s.scale.setScalar(0.22 * Math.sin(Math.min(1, k) * Math.PI)); s.position.y += dt * 0.12; s.material.rotation += dt;
    if (k >= 1) { scene.remove(s); sparkles.splice(i, 1); }
  }
}

/* ============================== 操作 ============================== */
const pad = /** @type {HTMLElement} */ (document.getElementById("pad")), knob = /** @type {HTMLElement} */ (document.getElementById("knob"));
let padId = -1;
function padAt(e) {
  const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
  let x = (e.clientX - cx) / rad, y = -(e.clientY - cy) / rad; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  stick.x = x; stick.y = y; knob.style.transform = `translate(calc(-50% + ${x * rad * 0.42}px), calc(-50% + ${-y * rad * 0.42}px))`;
}
// 搖桿：每一根手指各自追蹤（pointerId），另一隻手指按抓取鍵不會打斷搖桿
pad.addEventListener("pointerdown", e => { e.preventDefault(); audio(); padId = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch (er) { } if (state === "ready") startAim(); padAt(e); });
pad.addEventListener("pointermove", e => { if (e.pointerId === padId) padAt(e); });
const padUp = (e) => { if (e.pointerId !== padId) return; padId = -1; stick.x = stick.y = 0; knob.style.transform = "translate(-50%,-50%)"; };
pad.addEventListener("pointerup", padUp); pad.addEventListener("pointercancel", padUp); pad.addEventListener("lostpointercapture", padUp);
const grabBtn = /** @type {HTMLButtonElement} */ (document.getElementById("grab"));
/** 按下抓取：手指一碰到就放爪（不用等放開，也不用先停下搖桿） */
function pressGrab() {
  if (state === "ready") { if (startAim()) setTimeout(startDrop, 60); }
  else if (state === "aim") startDrop();
}
grabBtn.addEventListener("pointerdown", e => { e.preventDefault(); grabBtn.classList.add("down"); grabDown = true; audio(); pressGrab(); });
["pointerup", "pointerleave", "pointercancel"].forEach(t => grabBtn.addEventListener(t, () => { grabBtn.classList.remove("down"); grabDown = false; }));
grabBtn.addEventListener("click", e => e.preventDefault());
window.addEventListener("keydown", e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(k)) { e.preventDefault(); audio(); if (state === "ready") startAim(); }
  if ((k === " " || k === "Enter") && !e.repeat) { e.preventDefault(); grabDown = true; audio(); pressGrab(); }
});
window.addEventListener("keyup", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; if (k === " " || k === "Enter") grabDown = false; });
// 畫面：一根手指拖曳轉動（左右 260 度、上下）、兩根手指縮放；電腦用滾輪縮放
/** @type {Map<number,{x:number,y:number}>} */ const ptrs = new Map();
/** @type {any} */ let gest = null;
function gestStart() {
  const p = [...ptrs.values()];
  if (p.length === 1) gest = { kind: "turn", x: p[0].x, y: p[0].y, yaw: orbit.yaw, pitch: orbit.pitch };
  else if (p.length >= 2) gest = { kind: "zoom", d: Math.max(20, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)), zoom: orbit.zoom };
  else gest = null;
}
canvas.addEventListener("pointerdown", e => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (er) { } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); gestStart(); });
canvas.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const p = [...ptrs.values()];
  if (gest && gest.kind === "zoom" && p.length >= 2) {
    orbit.zoom = Math.max(ZOOM[0], Math.min(ZOOM[1], gest.zoom * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / gest.d));
  } else if (gest && gest.kind === "turn" && p.length === 1) {
    orbit.yaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, gest.yaw - (p[0].x - gest.x) * 0.0065));
    orbit.pitch = Math.max(PITCH[0], Math.min(PITCH[1], gest.pitch + (p[0].y - gest.y) * 0.004));
  }
  camFree = false;
});
const ptrUp = (e) => { if (!ptrs.delete(e.pointerId)) return; gestStart(); };
canvas.addEventListener("pointerup", ptrUp); canvas.addEventListener("pointercancel", ptrUp);
canvas.addEventListener("wheel", e => { e.preventDefault(); orbit.zoom = Math.max(ZOOM[0], Math.min(ZOOM[1], orbit.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); camFree = false; }, { passive: false });
document.getElementById("bCoin")?.addEventListener("click", () => { coins += 10; updCoins(); if (state === "over") { state = "ready"; say(""); } toast(TT("refilled")); });
document.getElementById("bReset")?.addEventListener("click", () => { if (!["ready", "over", "aim"].includes(state)) return; if (state === "aim") { state = "ready"; coins++; updCoins(); }   // 瞄準到一半重擺：這次不算
  clawHome(); makeBalls(); toast(TT("relaid")); });
document.getElementById("bView")?.addEventListener("click", () => { Object.assign(orbit, ORBIT0); camFree = false; });
document.getElementById("bBack")?.addEventListener("click", () => send({ type: "close" }));
function toast(t) { const el = /** @type {HTMLElement} */ (document.getElementById("toast")); el.textContent = t; el.hidden = false; clearTimeout(/** @type {any} */ (toast).t); /** @type {any} */ (toast).t = setTimeout(() => el.hidden = true, 2200); }

/* ============================== 收藏券 ============================== */
/** @type {{img:string,name:string,date:string}[]} 這次玩夾到的（App 另外會記住） */
const album = [];
/** 一顆球的照片、名稱、日期 */
function ballInfo(k) {
  if (k.type !== "photo") return { img: art("a/" + PROPS[k.prop][0] + ".webp"), name: k.name, date: TT("propLine"), id: "", mem: "", prop: true };
  const p = pics[k.p] || pics[0];
  return { img: p.img, name: p.title, date: p.date, id: p.id, mem: p.mem, prop: false };
}
let ticketBall = /** @type {Ball|null} */ (null);
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c); }
function showTicket(b) {
  ticketBall = b;
  const k = b.k, info = ballInfo(k), m = /** @type {HTMLElement} */ (document.getElementById("modal"));
  send({ type: "win", id: info.id, mem: info.mem });
  const spk = [[2, 8], [84, 4], [-4, 46], [88, 52], [6, 88], [82, 90]].map(([x, y], i) => `<img class="spk" src="${art("a/sparkle.webp")}" alt="" style="left:${x}%;top:${y}%;animation-delay:${i * 0.25}s">`).join("");
  m.innerHTML = `<div id="ticket"><img class="bg" src="${art("a/ticket.webp")}" alt=""><img id="tphoto" src="${info.img}" alt="" style="${info.prop ? "object-fit:contain" : ""}">
    <div id="ttext"><b>${esc(info.name)}</b><span>${esc(info.date)}</span><span>${k.rare ? TT("rareLine") : TT("catchLine")}</span></div>${spk}
    <div id="tbtns"><button id="tkeep">${TT("keep")}</button>${info.prop ? "" : `<button class="ghost" id="topen">${TT("openDay")}</button>`}</div></div>`;
  m.hidden = false;
  document.getElementById("tkeep")?.addEventListener("click", () => {
    album.unshift({ img: info.img, name: info.name, date: info.date }); albumN++;
    send({ type: "keep", id: info.id, mem: info.mem, prop: info.prop ? k.prop : -1 });
    updAlbumN(); closeTicket(b, TT("kept"));
  });
  document.getElementById("topen")?.addEventListener("click", () => {
    if (HOST === "none") { toast(TT("openInApp")); return; }
    send({ type: "open", id: info.id, mem: info.mem });
  });
}
function closeTicket(b, t) {
  /** @type {HTMLElement} */ (document.getElementById("modal")).hidden = true;
  ticketBall = null;
  if (b) { b.gone = true; }
  FLAP.target = 0; doorLight.intensity = 0;
  resultShown = false; held = null; state = coins > 0 ? "ready" : "over"; look = "open"; say(""); if (t) toast(t);
}
let albumN = 0;
function updAlbumN() { const n = document.getElementById("nAlbum"); if (n) n.textContent = String(albumN); }
/** @param {{img:string,name:string,date:string}[]} items */
function showAlbum(items) {
  const el = /** @type {HTMLElement} */ (document.getElementById("album"));
  el.innerHTML = `<h2>${TT("albumTitle")}</h2>${items.length ? `<div id="agrid">${items.map(a => `<figure><img src="${art(a.img)}" alt="">${esc(a.name)}<br>${esc(a.date)}</figure>`).join("")}</div>` : `<p style="color:#c9b48e">${TT("albumEmpty")}</p>`}<button class="pill" id="aclose">${TT("close")}</button>`;
  el.hidden = false; document.getElementById("aclose")?.addEventListener("click", () => el.hidden = true);
}
document.getElementById("bAlbum")?.addEventListener("click", () => {
  if (HOST === "none") showAlbum(album);
  else { showAlbum(album); send({ type: "album" }); }       // 先顯示這次夾到的，App 傳來全部收藏後再換
});
/** App 按返回鍵：先關掉收藏券／收藏冊，都沒開才離開 */
function goBack() {
  const al = /** @type {HTMLElement} */ (document.getElementById("album")), md = /** @type {HTMLElement} */ (document.getElementById("modal"));
  if (!al.hidden) { al.hidden = true; return; }
  if (!md.hidden && ticketBall) { closeTicket(ticketBall, ""); return; }
  send({ type: "close" });
}

/* ============================== 音效（簡單合成） ============================== */
/** @type {AudioContext|null} */ let AC = null; let soundOn = true; /** @type {GainNode|null} */ let humGain = null;
function audio() {
  if (AC || !soundOn) return;
  try {
    AC = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
    const o = AC.createOscillator(); humGain = AC.createGain(); o.type = "sawtooth"; o.frequency.value = 68; humGain.gain.value = 0;
    const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; o.connect(lp); lp.connect(humGain); humGain.connect(AC.destination); o.start();
  } catch (e) { AC = null; }
}
function hum(on) { if (!AC || !humGain) return; humGain.gain.setTargetAtTime(on && soundOn ? 0.035 : 0, AC.currentTime, 0.05); }
function tone(f, t0, dur, type, vol) {
  if (!AC) return null;
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, AC.currentTime + t0);
  g.gain.setValueAtTime(0.0001, AC.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, AC.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + t0 + dur);
  o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + t0); o.stop(AC.currentTime + t0 + dur + 0.05); return o;
}
function sfx(n) {
  if (!AC || !soundOn) return;
  try {
    if (n === "coin") { tone(988, 0, 0.12, "square", 0.05); tone(1319, 0.08, 0.25, "square", 0.05); }
    else if (n === "drop") { const o = tone(520, 0, 0.5, "triangle", 0.06); if (o) o.frequency.exponentialRampToValueAtTime(260, AC.currentTime + 0.5); }
    else if (n === "stop") tone(140, 0, 0.12, "square", 0.06);
    else if (n === "clank") { tone(220, 0, 0.08, "square", 0.08); tone(330, 0.05, 0.1, "square", 0.06); }
    else if (n === "slip") { const o = tone(600, 0, 0.35, "sine", 0.08); if (o) o.frequency.exponentialRampToValueAtTime(180, AC.currentTime + 0.35); }
    else if (n === "win") [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.4, "triangle", 0.08));
  } catch (e) { }
}
document.getElementById("bSound")?.addEventListener("click", e => { soundOn = !soundOn; /** @type {HTMLElement} */ (e.currentTarget).textContent = soundOn ? TT("soundOn") : TT("soundOff"); if (!soundOn) hum(false); else audio(); });

/* ============================== 主迴圈 ============================== */
let last = 0;
const TEST = location.search.includes("test");   // 測試模式：不自動播放，由測試程式一步一步推進
const timerEl = /** @type {HTMLElement} */ (document.getElementById("timer"));
/** 推進一格：遊戲、物理、控制台動畫、擋板、星光（不畫） */
function tick(dt) {
  if (state !== "loading") {
    const n = 4; for (let i = 0; i < n; i++) { update(dt / n); physics(dt / n); }
    timerEl.textContent = state === "aim" ? TT("timer", { n: Math.ceil(timer) }) : state === "ready" ? TT("ready") : state === "over" ? TT("overShort") : "…";
    grabBtn.disabled = !(state === "ready" || state === "aim");
  }
  // 控制台上的 3D 搖桿和按鈕跟著動
  const v = stickWorld(), pivot = PANEL.stickPivot;
  if (pivot) { pivot.rotation.x += ((v.z || 0) * 0.42 - pivot.rotation.x) * 0.3; pivot.rotation.z += (-(v.x || 0) * 0.42 - pivot.rotation.z) * 0.3; }
  if (PANEL.cap) PANEL.cap.position.y += ((grabDown ? PANEL.capY - 0.018 : PANEL.capY) - PANEL.cap.position.y) * 0.4;
  FLAP.angle += (FLAP.target - FLAP.angle) * Math.min(1, dt * 6); FLAP.hinge.rotation.x = FLAP.angle;
  syncClaw(); syncBalls(dt); tickSparkles(dt);
  if (!camFree) updateCam(dt);
}
function frame(t) {
  if (!TEST) requestAnimationFrame(frame);
  const dt = TEST ? t : Math.min(0.034, (t - last) / 1000 || 0.016); last = t;
  if (state === "loading") return;   // 還在等照片：畫面被「準備中」蓋住，先不畫（手機可以專心做照片，也省電）
  tick(dt);
  renderer.render(scene, activeCam);
}
window.addEventListener("resize", layout);
/** 把畫面上的固定文字換成目前語言 */
function applyTexts() {
  const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  set("tAlbum", TT("album")); set("bView", "↺ " + TT("recenter")); set("bReset", TT("relay")); set("bCoin", TT("refill"));
  set("bSound", soundOn ? TT("soundOn") : TT("soundOff")); set("tBack", TT("back")); set("loading", TT("loading")); set("tHint", TT("hint"));
  set("tHintPc", matchMedia("(pointer: fine)").matches ? TT("hintPc") : ""); set("demoTag", TT("demo"));
  pad.setAttribute("aria-label", TT("pad")); grabBtn.setAttribute("aria-label", TT("grab"));
  /** @type {HTMLElement} */ (document.getElementById("bBack")).hidden = HOST === "none";
  /** @type {HTMLElement} */ (document.getElementById("demoTag")).hidden = !isDemo;
  updCoins(); updAlbumN();
}
/** 圖（data URL 或網址）→ 材質；照片裁成正方形、孩子的臉在中間 */
function photoTexture(p) {
  return new Promise((res) => {
    const t = new THREE.TextureLoader().load(p.img, (tt) => {
      const im = /** @type {any} */ (tt.image), iw = im.width || 1, ih = im.height || 1;
      if (iw > ih) { const r = ih / iw; tt.repeat.set(r, 1); tt.offset.set(Math.max(0, Math.min(1 - r, (p.fx ?? 0.5) - r / 2)), 0); }
      else if (ih > iw) { const r = iw / ih; tt.repeat.set(1, r); tt.offset.set(0, Math.max(0, Math.min(1 - r, 1 - (p.fy ?? 0.42) - r / 2))); }
      res(tt);
    }, undefined, () => res(null));
    t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(8, MAX_ANISO);
  });
}
let started = false;
/** 收到照片（或用示範照片）以後開始 */
async function begin(list) {
  if (started) return; started = true;
  pics = list.length ? list : DEMO_PHOTOS.map(([title, date], i) => ({ id: "demo:" + i, mem: "demo", img: art("a/photo" + i + ".webp"), title, date, tex: T.photos[i] }));
  await Promise.all(pics.map(async (p) => { if (!p.tex) p.tex = /** @type {any} */ (await photoTexture(p)) || T.photos[0]; }));
  applyTexts(); makeBalls(); layout(); state = "ready"; say(TT("start"));
  /** @type {HTMLElement} */ (document.getElementById("loading")).hidden = true;
  send({ type: "started" });
}
/** App 傳來的訊息 */
function recv(m) {
  if (!m || typeof m !== "object") return;
  if (m.type === "init") {
    I18N = m.t || {}; isDemo = !!m.demo; albumN = m.albumN || 0; if (m.sound === false) soundOn = false;
    applyTexts(); begin(Array.isArray(m.photos) ? m.photos : []);
  } else if (m.type === "album") showAlbum(m.items || []);
  else if (m.type === "back") goBack();
  else if (m.type === "albumN") { albumN = m.n || 0; updAlbumN(); }
}
/** @type {any} */ (window).__clawRecv = recv;
window.addEventListener("message", e => { const d = /** @type {any} */ (e).data; if (d && d.claw) recv(d.claw); else if (typeof d === "string" && d[0] === "{") { try { recv(JSON.parse(d)); } catch (er) { } } });
document.addEventListener("message", (/** @type {any} */ e) => { try { recv(JSON.parse(e.data)); } catch (er) { } });
manager.onLoad = () => {
  applyTexts();
  try { renderer.render(scene, activeCam); } catch (e) { }   // 在「準備中」底下先畫一次：材質和貼圖先準備好，開始時不會卡一下
  if (HOST === "none" || TEST) begin([]);        // 單獨打開：用示範照片
  else send({ type: "ready" });                     // 等 App 傳照片進來（正式模式不會混進示範照片）
};
manager.onError = (u) => say("有素材載入失敗：" + u);
applyTexts(); layout(); if (!TEST) requestAnimationFrame(frame);

/* ============================== 測試用 ============================== */
/** @type {any} */ (window).__m = {
  THREE, scene, renderer, get state() { return state; }, get view() { return "overall"; }, setView: () => { camFree = false; layout(); }, layout, balls: () => balls, car, sw, stats, orbit,
  recv, get pics() { return pics; },
  /** 只顯示到某個階段的零件（做進度截圖用） */
  stage(n) { G_GANTRY.visible = claw.visible = cableMesh.visible = n >= 2; G_BALLS.visible = n >= 3; for (const b of balls) b.shadow.visible = n >= 3; },
  /** 擺出指定的爪子狀態（截圖用） */
  pose(p) { if (p.look) { const a = p.look === "grab" ? PHI_GRAB : PHI[p.look]; phis.fill(a); look = p.look === "open" ? "open" : "grip"; } if (p.x !== undefined) car.x = p.x; if (p.z !== undefined) car.z = p.z; if (p.cable !== undefined) cable = p.cable; sw.x = sw.z = sw.vx = sw.vz = 0; syncClaw(); clawFrame(); saveClawPrev(); },
  freeze(on) { state = on ? "loading" : "ready"; },
  force(on) { forceOk = on; },
  render() { syncClaw(); syncBalls(0); renderer.render(scene, activeCam); },
  /** 測試模式：往前推進幾秒（每格 1/60 秒），最後畫一張 */
  step(sec, drawEach) { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { tick(1 / 60); if (drawEach || i === n - 1) renderer.render(scene, activeCam); } },
  press(on) { grabDown = on; if (on) pressGrab(); },
  /** 只推進物理和遊戲（不畫），測試用 */
  adv(sec) { const n = Math.max(1, Math.round(sec * 240)); for (let i = 0; i < n; i++) { if (state !== "loading") update(1 / 240); physics(1 / 240); } },
  /** 截圖用：把整體相機放到指定位置看某一點 */
  look(px, py, pz, tx, ty, tz, fov) { camFree = true; persp.fov = fov || 34; persp.position.set(px, py, pz); persp.lookAt(tx, ty, tz); persp.updateProjectionMatrix(); },
  /** 測試：出獎通道的尺寸和斜板平面 */
  K: { FY, YT, TX0, TX1, TZ0, TZ1, HX0, HX1, HZ0, HZ1, DOOR, FLAP_Z, R, GX, GZ, FUNNEL: FUNNEL.map(f => ({ p: f.p.toArray(), n: f.n.toArray() })) },
  /** 測試：把台車直接放到某個位置（開始瞄準） */
  place(x, z) { if (state === "ready") startAim(); car.x = x; car.z = z; car.vx = car.vz = 0; sw.x = sw.z = sw.vx = sw.vz = 0; clawFrame(); saveClawPrev(); },
  /** 測試：固定亂數（讓擺球、結果可以重現） */
  seed(n) { rnd = ((s2) => () => ((s2 = Math.imul(48271, s2) % 2147483647) & 2147483647) / 2147483647)(n); },
  /** 測試：球在爪子座標裡的位置 */
  local(i) { const b = balls[i]; const l = inClaw(b); return [l.x, l.y, l.z]; },
  /** 測試：重新擺球、回到起點 */
  reset() { clawHome(); makeBalls(); state = "ready"; plan = null; pendingWin = null; resultShown = false; coins = 99; },
  /** 測試：只播得獎的擋板＋燈＋星光（不跳收藏券） */
  winFx() { FLAP.target = -1.15; doorLight.intensity = 1.2; burst(); },
  /** 測試：把一顆球放到某個位置（不在爪子上），讓它自己掉 */
  drop(i, x, y, z) { const b = balls[i]; b.held = false; b.gone = false; b.arrived = false; b.inChute = false; b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; return i; },
  /** 測試：螢幕上某一點（像素）打到哪個物件 */
  pick(px, py) {
    const rc = new THREE.Raycaster(), w = window.innerWidth, h = window.innerHeight;
    rc.setFromCamera(new THREE.Vector2(px / w * 2 - 1, -(py / h) * 2 + 1), activeCam);
    return rc.intersectObjects(scene.children, true).filter(i => i.object.visible).slice(0, 4).map(i => { const m = /** @type {any} */ (i.object).material, mm = Array.isArray(m) ? m[i.face?.materialIndex || 0] : m;
      return { geo: /** @type {any} */ (i.object).geometry.type, mat: mm.type, color: mm.color && mm.color.getHexString(), env: mm.envMapIntensity, p: i.point.toArray().map(v => +v.toFixed(3)), d: +i.distance.toFixed(3), parent: i.object.parent && i.object.parent.type }; });
  },
  clawPos() { const g = clawGeom(); return { M: g.M.toArray(), palm: g.palm.toArray(), tips: g.tips.map(t => t.toArray()), phis: phis.slice(), PHI_GRAB, cable, look, state, held: held ? balls.indexOf(held) : -1 }; },
  holdDemo() { const b = balls[0]; held = b; b.held = true; look = "grip"; phis.fill(PHI_GRAB); G_BALLS.visible = true; for (const o of balls) o.obj.visible = o === b; const g = clawGeom(); b.x = g.ballc.x; b.y = g.ballc.y; b.z = g.ballc.z; syncBalls(0); },
  /** 測試：每顆球跟爪子零件最深的穿透（負數＝穿進去幾公尺） */
  clawGap() {
    clawFrame(); for (let k = 0; k < 3; k++) fingerPts(k);
    let worst = 1e9, who = "";
    for (const b of balls) {
      if (b.gone || b.arrived) continue;
      const l = V(b.x, b.y, b.z).sub(CL.M).applyQuaternion(CL.qi);
      for (let k = 0; k < 3; k++) for (let i = 0; i < FINGER.length - 1; i++) {
        const a = FP[k][i], c = FP[k][i + 1], t = segT(l.x, l.y, l.z, a, c);
        const g2 = Math.hypot(l.x - (a.x + (c.x - a.x) * t), l.y - (a.y + (c.y - a.y) * t), l.z - (a.z + (c.z - a.z) * t)) - R - FINGER_R[i];
        if (g2 < worst) { worst = g2; who = "finger" + k + "." + i; }
      }
      const rho = Math.hypot(l.x, l.z), hy = Math.max(HUB_BOT, Math.min(-0.2, l.y));
      const hg = (l.y >= HUB_BOT && l.y <= -0.2) ? rho - 0.075 - R : Math.hypot(Math.max(0, rho - 0.075), l.y - hy) - R;
      if (hg < worst) { worst = hg; who = "hub"; }
    }
    // 爪臂碰玻璃／地板的穿透
    let wall = 1e9;
    for (let k = 0; k < 3; k++) for (let i = 1; i < FINGER.length; i++) {
      const r = FINGER_R[i - 1], pw = FP[k][i].clone().applyQuaternion(CL.q).add(CL.M);
      wall = Math.min(wall, GX - r - Math.abs(pw.x), GZ - r - pw.z, pw.z - BZ - r);
      if (!(pw.x < HX1 && pw.z > HZ0)) wall = Math.min(wall, pw.y - r - FY);
    }
    return { worst: +worst.toFixed(4), who, wall: +wall.toFixed(4) };
  },
  stick(x, y) { stick.x = x; stick.y = y; if (state === "ready" && (x || y)) startAim(); },
  win() { const b = balls.find(x => !x.gone && x.k.type === "photo"); if (b) { b.inChute = true; b.x = (DOOR.x0 + DOOR.x1) / 2; b.z = FLAP_Z - R - 0.02; b.y = DOOR.y0 + R + 0.02; b.wasHeld = true; arrive(b); } },
  /** 穿透檢查：球和球、球和玻璃／地板／後牆 */
  check() {
    let bb = 1e9, wall = 1e9, floor = 1e9;
    const live = balls.filter(b => !b.gone && !b.held && !b.inChute);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const a = live[i], b = live[j]; bb = Math.min(bb, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - 2 * R); }
    for (const b of live) { wall = Math.min(wall, GX - Math.abs(b.x) - R, GZ - b.z - R, b.z - BZ - R); if (!overHole(b)) floor = Math.min(floor, b.y - FY - R); }
    return { balls: live.length, ballGap: +bb.toFixed(4), wallGap: +wall.toFixed(4), floorGap: +floor.toFixed(4) };
  },
  sim(n, aim) {
    const save = rnd; simMode = true; let wins = 0, tries = 0;
    rnd = ((s) => () => ((s = Math.imul(48271, s) % 2147483647) & 2147483647) / 2147483647)(12345 + Math.round(aim * 7919));
    for (let t = 0; t < n; t++) {
      clawHome(); makeBalls(); coins = 99; misses = 0; resultShown = false; held = null; plan = null; pendingWin = null; state = "ready"; startAim();
      const free = balls.filter(b => !b.gone && !overHole(b) && !balls.some(o => o !== b && !o.gone && o.y > b.y + R * 0.8 && Math.hypot(o.x - b.x, o.z - b.z) < 2 * R));
      const tg = free[(rnd() * free.length) | 0];
      car.x = Math.max(-CAR_X, Math.min(CAR_X, tg.x + (rnd() - 0.5) * 2 * aim)); car.z = Math.max(CAR_ZMIN, Math.min(CAR_ZMAX, tg.z + (rnd() - 0.5) * 2 * aim));
      car.vx = car.vz = 0; sw.x = sw.z = sw.vx = sw.vz = 0; cable = CABLE0; phis.fill(PHI.open); look = "open"; clawFrame(); saveClawPrev();
      startDrop(); let won = false;
      for (let i = 0; i < 240 * 25; i++) { update(1 / 240); physics(1 / 240); if (state === "win") { won = true; break; } if (state === "ready" || state === "over") break; }
      tries++; if (won) wins++; pendingWin = null;
    }
    rnd = save; simMode = false; resultShown = false; clawHome(); makeBalls(); state = "ready"; coins = 10; updCoins();
    return { tries, wins, rate: wins / tries };
  },
};
