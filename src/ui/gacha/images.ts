/** 回憶扭蛋機的圖和聲音（assets/gacha）。位置表在 core/gachaArt.ts */
import type { Kind } from '../../core/gacha';

const cap = {
  pink: require('../../../assets/gacha/cap_pink.webp'),
  peach: require('../../../assets/gacha/cap_peach.webp'),
  gold: require('../../../assets/gacha/cap_gold.webp'),
  mint: require('../../../assets/gacha/cap_mint.webp'),
  blue: require('../../../assets/gacha/cap_blue.webp'),
  purple: require('../../../assets/gacha/cap_purple.webp'),
} as Record<Kind, number>;

const half = {
  pink: { u: require('../../../assets/gacha/half_pink_u.webp'), l: require('../../../assets/gacha/half_pink_l.webp') },
  peach: { u: require('../../../assets/gacha/half_peach_u.webp'), l: require('../../../assets/gacha/half_peach_l.webp') },
  gold: { u: require('../../../assets/gacha/half_gold_u.webp'), l: require('../../../assets/gacha/half_gold_l.webp') },
  mint: { u: require('../../../assets/gacha/half_mint_u.webp'), l: require('../../../assets/gacha/half_mint_l.webp') },
  blue: { u: require('../../../assets/gacha/half_blue_u.webp'), l: require('../../../assets/gacha/half_blue_l.webp') },
  purple: { u: require('../../../assets/gacha/half_purple_u.webp'), l: require('../../../assets/gacha/half_purple_l.webp') },
} as Record<Kind, { u: number; l: number }>;

export const IMG = {
  thumb: require('../../../assets/gacha/thumb.webp'),
  doily: require('../../../assets/gacha/doily.webp'),
  base: require('../../../assets/gacha/base.webp'),
  baseFront: require('../../../assets/gacha/base_front.webp'),
  holeShade: require('../../../assets/gacha/hole_shade.webp'),
  holeGlow: require('../../../assets/gacha/hole_glow.webp'),
  globeBack: require('../../../assets/gacha/globe_back.webp'),
  globeFront: require('../../../assets/gacha/globe_front.webp'),
  globeGlow: require('../../../assets/gacha/globe_glow.webp'),
  globeTop: require('../../../assets/gacha/globe_top.webp'),
  globeRim: require('../../../assets/gacha/globe_rim.webp'),
  knob: require('../../../assets/gacha/knob.webp'),
  knobGlint: require('../../../assets/gacha/knob_glint.webp'),
  flowerL: require('../../../assets/gacha/flower_l.webp'),
  flowerR: require('../../../assets/gacha/flower_r.webp'),
  shadow: require('../../../assets/gacha/shadow.webp'),
  glow: require('../../../assets/gacha/glow.webp'),
  star: require('../../../assets/gacha/star.webp'),
  heart: require('../../../assets/gacha/heart.webp'),
  heart2: require('../../../assets/gacha/heart2.webp'),
  fx: require('../../../assets/gacha/fx.webp'),
  rays: require('../../../assets/gacha/rays.webp'),
  flash: require('../../../assets/gacha/flash.webp'),
  orbit: require('../../../assets/gacha/orbit.webp'),
  arrows: require('../../../assets/gacha/arrows.webp'),
  motion: require('../../../assets/gacha/motion.webp'),
  polaroid: require('../../../assets/gacha/polaroid.webp'),
  cap,
  half,
};

export const SND = {
  turn: require('../../../assets/gacha/turn.wav'),
  land: require('../../../assets/gacha/land.wav'),
  chime: require('../../../assets/gacha/chime.wav'),
};
