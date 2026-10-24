/** 星座的名字和一句話（五種語言，在 i18n 裡） */
import { tr } from '../../i18n';
import type { ConsKey } from './constellations';

export const consName = (k: ConsKey) => tr(`sky.c.${k}` as `sky.c.${ConsKey}`);
export const consTag = (k: ConsKey) => tr(`sky.t.${k}` as `sky.t.${ConsKey}`);
