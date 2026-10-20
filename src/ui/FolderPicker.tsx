import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { tr, useLang } from '../i18n';
import { candidateFolders, type FolderChoice } from '../services/drive';
import { Btn, H2, Icon, P } from './kit';
import { R, useTheme } from './theme';

export function FolderPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (f: FolderChoice) => void }) {
  const t = useTheme();
  useLang();
  const C = { surface: t.c.card2, roseDeep: t.c.noDeep, rose: t.c.accent, line: t.c.line, tan: t.c.tan, ink: t.c.ink, muted: t.c.muted };
  const [list, setList] = useState<FolderChoice[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!visible) return;
    setList(null); setErr('');
    candidateFolders().then(setList).catch((e) => setErr(String(e?.message || e)));
  }, [visible]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.c.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '80%', padding: 18, gap: 10 }}>
          <H2>{tr('fp.title')}</H2>
          <P muted style={{ fontSize: 13 }}>{tr('fp.sub')}</P>
          {err ? <P style={{ color: C.roseDeep }}>{err}</P> : null}
          {!list && !err ? <ActivityIndicator color={C.rose} style={{ margin: 30 }} /> : null}
          <ScrollView>
            {list?.map((f) => (
              <Pressable key={f.id} onPress={() => onPick(f)} style={({ pressed }) => ({ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line, opacity: pressed ? 0.6 : 1 })}>
                <Icon name="folder" color={C.tan} />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...t.round, fontSize: 16, color: C.ink }}>{f.name}</Text>
                  <Text style={{ ...t.round, fontSize: 12, color: C.muted }}>{f.where}</Text>
                </View>
              </Pressable>
            ))}
            {list && !list.length ? <P muted>{tr('fp.none')}</P> : null}
          </ScrollView>
          <Btn kind="ghost" title={tr('common.cancel')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
