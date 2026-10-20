import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { tr } from '../i18n';
import { engineReady, modelReady, warmUp } from '../services/recognizer';
import { addReferencePhotos } from '../services/scanner';

/** onProgress：顯示進度文字（傳空字串代表結束） */
export async function pickAndAddRefs(onProgress?: (msg: string) => void, person = ''): Promise<boolean> {
  if (!modelReady()) { Alert.alert(tr('pick.notReadyTitle'), tr('pick.notReadyBody')); return false; }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 1 });
  if (r.canceled || !r.assets.length) return false;
  const n = r.assets.length;
  let res;
  try {
    if (!engineReady()) {
      onProgress?.(tr('pick.warming'));
      await warmUp();
    }
    res = await addReferencePhotos(r.assets.map((a) => a.uri), (i) => onProgress?.(tr('pick.finding', { i: i + 1, n })), person);
  } finally {
    onProgress?.('');
  }
  if (res.noface) Alert.alert(tr('pick.addedTitle'), tr('pick.addedBody', { ok: res.ok, noface: res.noface }));
  return true;
}

