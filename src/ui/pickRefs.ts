import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { modelReady } from '../services/recognizer';
import { addReferencePhotos } from '../services/scanner';

export async function pickAndAddRefs(): Promise<boolean> {
  if (!modelReady()) { Alert.alert('還沒準備好', '請先完成首次設定（下載辨識模型）。'); return false; }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 1 });
  if (r.canceled || !r.assets.length) return false;
  const res = await addReferencePhotos(r.assets.map((a) => a.uri));
  if (res.noface) Alert.alert('加好了', `${res.ok} 張可以用，${res.noface} 張找不到臉（可以刪掉換別張）。`);
  return true;
}

