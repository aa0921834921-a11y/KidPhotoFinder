/** 星空的篩選：看哪個孩子（有兩個以上孩子才出現）、看哪些星座 */
import React, { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tr } from '../../../i18n';
import type * as DB from '../../../services/db';
import { CONS, CONS_ORDER, type ConsKey } from '../constellations';
import { Glyph, GOLD } from './GoldIcon';
import { consName } from '../text';

export function FilterSheet({ kids, kid, setKid, consOn, toggle, counts, font, onClose }: {
  kids: DB.Kid[]; kid: string | null; setKid: (k: string | null) => void;
  consOn: Record<ConsKey, boolean>; toggle: (k: ConsKey) => void; counts: Record<ConsKey, number>;
  font: { title: TextStyle; round: TextStyle }; onClose: () => void;
}) {
  const ins = useSafeAreaInsets();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,5,20,0.55)' }]} onPress={onClose} accessibilityLabel={tr('mem.close')} />
      <View style={[s.sheet, { paddingBottom: ins.bottom + 16 }]}>
        <Text style={[font.title, s.h]}>{tr('sky.filter')}</Text>
        {kids.length > 1 ? (
          <>
            <Text style={[font.round, s.sub]}>{tr('sky.kids')}</Text>
            <View style={s.wrap}>
              {[{ key: null as string | null, name: tr('mem.kidAll') }, ...kids.map((k) => ({ key: k.key as string | null, name: k.name || tr('refs.myChild') }))].map((k) => {
                const on = kid === k.key;
                return (
                  <Pressable key={String(k.key)} onPress={() => setKid(k.key)} style={[s.chip, on && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                    <Text style={[font.round, s.chipText, on && { color: '#2C2008' }]}>{k.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        <Text style={[font.round, s.sub]}>{tr('sky.cons')}</Text>
        <View style={s.wrap}>
          {CONS_ORDER.map((k) => {
            const on = consOn[k];
            return (
              <Pressable key={k} onPress={() => toggle(k)} style={[s.chip, { borderColor: CONS[k].color }, on && { backgroundColor: 'rgba(255,255,255,0.08)' }, !on && { opacity: 0.5 }]}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Glyph name={CONS[k].icon} size={16} color={CONS[k].color} stroke={4} />
                <Text style={[font.round, s.chipText, { color: CONS[k].color }]}>{consName(k)}</Text>
                <Text style={[font.round, s.n]}>{counts[k]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onClose} style={s.done} accessibilityRole="button">
          <Text style={[font.round, { color: '#2C2008', fontSize: 15.5, fontWeight: '700' }]}>{tr('sky.done')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 560, alignSelf: 'center', marginHorizontal: 'auto', padding: 18, gap: 10,
    backgroundColor: '#0E1338', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: 'rgba(255,226,162,0.35)',
    boxShadow: '0px -10px 30px rgba(0,0,0,0.5)',
  } as ViewStyle,
  h: { fontSize: 20, color: GOLD },
  sub: { fontSize: 13, color: '#B9B2E0', marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.2, borderColor: 'rgba(255,226,162,0.6)' },
  chipOn: { backgroundColor: '#FFD98A', borderColor: '#FFD98A' },
  chipText: { fontSize: 14, color: GOLD },
  n: { fontSize: 12, color: '#B9B2E0' },
  done: { marginTop: 8, minHeight: 48, borderRadius: 999, backgroundColor: '#FFD98A', alignItems: 'center', justifyContent: 'center' },
});
