import { useEffect, useState } from 'react';
import { previewUri } from '../services/drive';

/** 讀照片縮圖（雲端硬碟），畫面捲動到才下載。 */
export function usePreview(fileId: string | null, size = 1024): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUri(null);
    if (fileId) previewUri(fileId, size).then((u) => alive && setUri(u)).catch(() => {});
    return () => { alive = false; };
  }, [fileId, size]);
  return uri;
}
