import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { engineReady, modelReady, warmUp } from '../services/recognizer';
import { addReferencePhotos } from '../services/scanner';

/** onProgress：顯示進度文字（傳空字串代表結束） */
export async function pickAndAddRefs(onProgress?: (msg: string) => void): Promise<boolean> {
  if (!modelReady()) { Alert.alert('還沒準備好', '請先完成首次設定（下載辨識模型）。'); return false; }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 1 });
  if (r.canceled || !r.assets.length) return false;
  const n = r.assets.length;
  let res;
  try {
    if (!engineReady()) {
      onProgress?.('正在啟動辨識引擎…第一次會比較久，大約半分鐘');
      await warmUp();
    }
    res = await addReferencePhotos(r.assets.map((a) => a.uri), (i) => onProgress?.(`正在找照片裡的臉 ${i + 1} / ${n}`));
  } finally {
    onProgress?.('');
  }
  if (res.noface) Alert.alert('加好了', `${res.ok} 張可以用，${res.noface} 張找不到臉（可以刪掉換別張）。`);
  return true;
}

