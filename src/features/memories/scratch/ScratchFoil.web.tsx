/**
 * 網頁版的銀箔：網頁要先下載 Skia（canvaskit.wasm，放在網站根目錄）才能畫。
 * 下載不到時老實說「網頁版刮不了」，不會假裝可以刮。
 */
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { tr } from '../../../i18n';
import type { FoilProps } from './ScratchFoilCanvas';

const BASE = process.env.EXPO_PUBLIC_BASE_URL || '';
let loaded: React.ComponentType<FoilProps> | null = null;

export default function ScratchFoil(p: FoilProps) {
  const [Comp, setComp] = useState<React.ComponentType<FoilProps> | null>(() => loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (Comp) return;
    let alive = true;
    LoadSkiaWeb({ locateFile: (file: string) => `${BASE}/${file}` })
      .then(() => import('./ScratchFoilCanvas'))
      .then((m) => { loaded = m.default; if (alive) setComp(() => m.default); })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [Comp]);
  if (Comp) return <Comp {...p} />;
  return (
    <View style={{ width: p.width, height: p.height, borderRadius: 16, backgroundColor: '#C9CEE3', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Text style={{ color: '#4B4466', fontSize: 13.5, textAlign: 'center' }}>{failed ? tr('sc.webNoSkia') : tr('mem.loading')}</Text>
    </View>
  );
}
export type { FoilProps };
