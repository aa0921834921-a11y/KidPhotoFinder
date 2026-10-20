/* 網頁體驗版：新照片通知（只做畫面需要的部分） */
export const NOTICE_ID = 4101;
export const BACKLOG_ID = 4102;
export const TEST_ID = 4199;
export const LINE_PKG = 'jp.naver.line.android';
const q = new URLSearchParams((globalThis as any).location?.search || '');
/** 示範：老師剛上傳的照片（1016 戶外教學 4 張、1017 美勞課 3 張） */
const BATCH = q.get('empty') === '1' ? [] : ['p10', 'p08', 'p07', 'p05', 'p13', 'p12', 'p11'];
let seen = false;
export async function openBatch() { seen = true; return BATCH; }
export async function unseenCount() { return seen ? 0 : BATCH.length; }
export async function askNotificationPermission() { return true; }
export async function sendTest() { return true; }
export async function flushDigest() {}
export async function afterBackground() {}
export async function afterManual() {}
export function localizeChannel() {}
