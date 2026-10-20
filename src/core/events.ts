/**
 * 新照片的整理方式（通知和「新照片」頁共用）：依活動（老師的資料夾）分組、挑出孩子的臉最清楚的照片。
 * 這裡只有計算，不碰手機功能。
 */

export type EventPhoto = {
  file_id: string; asset_id: string; folder: string; kind: string;
  w: number | null; h: number | null;
  fx: number | null; fy: number | null; fw: number | null; fh: number | null;
};

export type PhotoEvent<P extends EventPhoto> = { folder: string; name: string; photos: P[] };

/** 資料夾路徑的最後一層，就是活動名稱（例如「1020 慶生會」） */
export const eventName = (folder: string) => folder.split('/').filter(Boolean).pop() || folder;

/** 孩子的臉佔照片高度的比例（越大越清楚；找不到臉是 0） */
export const faceSize = (p: EventPhoto) => (p.fh && p.h ? p.fh / p.h : 0);

/** 孩子的臉在照片裡的相對位置 [x, y, 寬, 高]（0～1）；不知道的話是 [-1, -1, -1, -1] */
export const relBox = (p: EventPhoto): number[] =>
  p.fx != null && p.fy != null && p.fw && p.fh && p.w && p.h
    ? [p.fx / p.w, p.fy / p.h, p.fw / p.w, p.fh / p.h]
    : [-1, -1, -1, -1];

/** 依活動分組：照片多的活動在前面（一樣多就照原本的順序） */
export function groupEvents<P extends EventPhoto>(rows: P[]): PhotoEvent<P>[] {
  const map = new Map<string, P[]>();
  for (const r of rows) {
    if (!map.has(r.folder)) map.set(r.folder, []);
    map.get(r.folder)!.push(r);
  }
  return [...map].map(([folder, photos]) => ({ folder, name: eventName(folder), photos }))
    .sort((a, b) => b.photos.length - a.photos.length);
}

/** 孩子的臉最清楚的 n 張照片（影片不算） */
export function bestPhotos<P extends EventPhoto>(rows: P[], n: number): P[] {
  return rows.filter((p) => p.kind !== 'video').sort((a, b) => faceSize(b) - faceSize(a)).slice(0, n);
}

/** 照片排序：最清楚的第一張，其他照原本的順序 */
export function heroFirst<P extends EventPhoto>(rows: P[]): P[] {
  const [best] = bestPhotos(rows, 1);
  return best ? [best, ...rows.filter((r) => r !== best)] : rows;
}
