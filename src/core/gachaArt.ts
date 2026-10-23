/**
 * 回憶扭蛋機的美術素材位置（由素材處理程式產生；手機版、電腦版共用）。
 * 單位是「機器座標」：玻璃罩頂端在 y=0、底座腳在 y=1861，機器寬 1211。
 * 素材在 assets/gacha/（電腦版在 web/gacha/）。
 */
export type Rect = { x: number; y: number; w: number; h: number };

/** 整個畫面（機器＋蕾絲墊＋花）：機器在正中間 */
export const SCENE: Rect = { x: -340, y: -70, w: 1891, h: 2240 };

export const ART = {
  doily: { x: -219, y: 1645.3, w: 1650, h: 513.5 },
  base: { x: -2, y: 1037, w: 1217, h: 827 },
  baseFront: { x: 346, y: 1459, w: 511, h: 286 },
  holeShade: { x: 376, y: 1486, w: 452, h: 230 },
  holeGlow: { x: 373, y: 1485, w: 458, h: 234 },
  /** 取物口裡面（深色的洞） */
  hole: { x: 386, y: 1499, w: 431, h: 206 },
  globeBack: { x: 41, y: 344, w: 1130, h: 708 },
  globeFront: { x: 41, y: 344, w: 1130, h: 708 },
  globeGlow: { x: 21, y: 322, w: 1170, h: 753 },
  globeTop: { x: 167, y: -2, w: 882, h: 371 },
  globeRim: { x: 178, y: 1039, w: 856, h: 106 },
  /** 扭蛋只畫在這個範圍裡（掉出玻璃罩底部就看不到） */
  clip: { x: 39, y: 252, w: 1130, h: 885 },
  flowerL: { x: -315.7, y: 1405.7, w: 649.5, h: 581.1 },
  flowerR: { x: 648.2, y: 1455.7, w: 567.6, h: 476.6 },
  /** 旋鈕：圓心、直徑；sy 是上下壓扁一點（跟底座的角度一致） */
  knob: { cx: 602.9, cy: 1322.6, d: 345.1, sy: 0.95 },
};

/** 扭蛋圖（含開殼的上下半）：球的直徑佔整張圖的比例 */
export const CAP_FRAC = 0.88;

/** 拍立得：整張圖的大小，照片放的位置（中心、寬高、傾斜角度）、底下小標籤的位置 */
export const POLAROID = {
  w: 1105, h: 1045,
  photo: { cx: 577.1, cy: 468.7, w: 729, h: 620, rot: -4.66 },
  tag: { cx: 782.0, cy: 868.0, w: 420, h: 110, rot: -5.1 },
};
