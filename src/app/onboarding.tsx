import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { getLang, langChosen, LANGS, setLang, tr, useLang } from '../i18n';
import { askNotificationPermission, syncSchedule } from '../services/background';
import * as DB from '../services/db';
import { signIn, signOut, restore, type Account } from '../services/drive';
import { downloadModel, modelReady, W600K_MB, warmUp } from '../services/recognizer';
import { Logo } from '../ui/art';
import { art, Bar, Btn, Card, H1, H2, Icon, Link, P, Paper } from '../ui/kit';
import { FolderPicker } from '../ui/FolderPicker';
import { pickAndAddRefs } from '../ui/pickRefs';
import { removeReference } from '../services/scanner';
import { SYSTEM_FONT, useTheme } from '../ui/theme';

function Step({ n, title, done, active, detail, onChange, changeLabel, alwaysOpen, children }: {
  n: number; title: string; done: boolean; active: boolean; detail?: string | null; onChange?: () => void; changeLabel?: string;
  alwaysOpen?: boolean; // 完成後內容也一直顯示（可以繼續修改）
  children?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Card pad={16} style={[{ opacity: active || done ? 1 : 0.55 }, done && { backgroundColor: t.c.yesWash }, !active && !done && { boxShadow: 'none' } as any]}>
      <H2 style={{ fontSize: 18 }}>{done ? '✓ ' : `${n}. `}{title}</H2>
      {done && (detail || onChange) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {detail ? <P muted style={{ fontSize: 13.5, flex: 1 }} numberOfLines={2}>{detail}</P> : <View style={{ flex: 1 }} />}
          {onChange ? <Link title={`${changeLabel || tr('common.change')} ›`} onPress={onChange} /> : null}
        </View>
      ) : null}
      {(active && !done) || (alwaysOpen && (active || done)) ? <View style={{ marginTop: 10, gap: 10 }}>{children}</View> : null}
    </Card>
  );
}

/** 第一個畫面：選語言（每個語言用它自己的文字寫，看不懂中文也找得到） */
function LanguagePage({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const lang = useLang();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 14 }}>
      <View style={{ alignItems: 'center', paddingTop: 12, gap: 10 }}>
        <Logo size={72} />
        <Icon name="globe" size={30} color={t.c.accentDeep} />
        <Text style={{ fontFamily: SYSTEM_FONT, fontSize: 17, lineHeight: 26, color: t.c.ink, textAlign: 'center' }}>
          選擇語言 · 选择语言 · Choose your language{'\n'}Pilih bahasa · Chọn ngôn ngữ
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        {LANGS.map((l) => {
          const on = l.k === lang;
          return (
            <Pressable key={l.k} onPress={() => setLang(l.k)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={l.name}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16,
                borderWidth: 2, borderColor: on ? t.c.accent : t.c.line, backgroundColor: on ? t.c.accentWash : t.c.card2,
              }, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: SYSTEM_FONT, fontSize: 18, fontWeight: '600', color: on ? t.c.accentDeep : t.c.ink }}>{l.name}</Text>
                <Text style={{ fontFamily: SYSTEM_FONT, fontSize: 12.5, color: t.c.muted, marginTop: 2 }}>{l.hint}</Text>
              </View>
              <View style={{
                width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? t.c.accent : t.c.line,
                backgroundColor: on ? t.c.accent : 'transparent', alignItems: 'center', justifyContent: 'center',
              }}>
                {on ? <Text style={{ color: t.c.onAccent, fontSize: 14, fontWeight: '700' }}>✓</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Btn title={`${tr('lang.continue')} →`} onPress={() => { setLang(getLang()); onDone(); }} style={{ marginTop: 6 }} />
      <P muted style={{ fontSize: 13, textAlign: 'center' }}>{tr('lang.later')}</P>
    </ScrollView>
  );
}

export default function Onboarding() {
  const t = useTheme();
  const lang = useLang();
  const [langPage, setLangPage] = useState(!langChosen());
  const [model, setModel] = useState(modelReady());
  const [prog, setProg] = useState<number | null>(null);
  const [acct, setAcct] = useState<Account | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [refList, setRefList] = useState<{ id: string; uri: string; status: string }[]>([]);
  const refs = refList.filter((x) => x.status !== 'noface').length;
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const reloadRefs = () => DB.listRefs().then((r) => setRefList(r.map(({ id, uri, status }) => ({ id, uri, status }))));
  const askRemove = (r: { id: string; uri: string }) => Alert.alert(tr('ob.removeTitle'), tr('ob.removeBody'), [
    { text: tr('common.cancel'), style: 'cancel' },
    { text: tr('ob.remove'), style: 'destructive', onPress: async () => { await removeReference(r.id, r.uri); reloadRefs(); } },
  ]);
  useEffect(() => {
    restore().then(setAcct);
    DB.getSettings().then((s) => setFolder(s.folderName));
    reloadRefs();
  }, []);

  const step = !model ? 1 : !acct ? 2 : !folder ? 3 : refs < 3 ? 4 : 5;
  // 模型下載好之後就先在背景啟動辨識引擎，挑完參考照片時就不用再等
  useEffect(() => { if (model) warmUp(); }, [model]);

  const getModel = async () => {
    setProg(0);
    try { await downloadModel(setProg); setModel(true); } catch (e: any) { Alert.alert(tr('ob.dlFailTitle'), tr('ob.dlFailBody', { err: String(e?.message || e) })); }
    finally { setProg(null); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await MediaLibrary.requestPermissionsAsync(true);
      const notify = await askNotificationPermission();
      await DB.saveSettings({ onboarded: true, notify });
      await syncSchedule(true).catch(() => {});
      router.replace('/');
    } finally { setBusy(false); }
  };

  if (langPage) return <Paper><LanguagePage onDone={() => setLangPage(false)} /></Paper>;

  const langName = LANGS.find((l) => l.k === lang)?.name || '';
  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 14 }}>
        <Pressable onPress={() => setLangPage(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('lang.pick')}
          style={({ pressed }) => [{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.card2 }, pressed && { opacity: 0.6 }]}>
          <Icon name="globe" size={16} color={t.c.accentDeep} />
          <Text style={{ fontFamily: SYSTEM_FONT, fontSize: 13.5, color: t.c.accentDeep }}>{langName}</Text>
        </Pressable>
        {t.art === 'watercolor' ? <Image source={art.children} style={{ width: '100%', height: 90 }} contentFit="contain" /> : <View style={{ alignItems: 'center', paddingVertical: 8 }}><Logo size={72} /></View>}
        <H1>{tr('ob.welcome')}</H1>
        <P muted>{tr('ob.intro')}</P>

        <Step n={1} title={tr('ob.s1')} done={model} active={step === 1}>
          <P muted style={{ fontSize: 13 }}>{tr('ob.s1Body', { mb: W600K_MB })}</P>
          {prog != null ? <Bar value={prog} /> : <Btn title={tr('ob.s1Btn')} onPress={getModel} />}
        </Step>

        <Step n={2} title={tr('ob.s2')} done={!!acct} active={step === 2} detail={acct?.email} changeLabel={tr('ob.s2Change')}
          onChange={async () => {
            try { await signOut(); setAcct(null); setAcct(await signIn()); } catch (e: any) { Alert.alert(tr('common.signInFailed'), String(e?.message || e)); }
          }}>
          <P muted style={{ fontSize: 13 }}>{tr('ob.s2Body')}</P>
          <Btn title={tr('ob.s2Btn')} onPress={async () => {
            try { setAcct(await signIn()); } catch (e: any) { Alert.alert(tr('common.signInFailed'), String(e?.message || e)); }
          }} />
        </Step>

        <Step n={3} title={tr('ob.s3')} done={!!folder} active={step === 3} detail={folder ? `📁 ${folder}` : null}
          onChange={() => setPick(true)}>
          <Btn title={tr('ob.s3Btn')} onPress={() => setPick(true)} />
        </Step>

        <Step n={4} title={tr('ob.s4')} done={refs >= 3} active={step === 4} alwaysOpen>
          <P muted style={{ fontSize: 13 }}>{tr('ob.s4Body', { n: refs })}{refList.length ? tr('ob.s4Tap') : ''}</P>
          {refList.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {refList.map((r) => (
                <Pressable key={r.id} onPress={() => askRemove(r)} accessibilityRole="button" accessibilityLabel={tr('ob.removeTitle')}>
                  <Image source={{ uri: r.uri }} contentFit="cover"
                    style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, borderColor: r.status === 'noface' ? t.c.no : t.c.yes }} />
                  <View style={{ position: 'absolute', right: -2, top: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: t.c.card, borderWidth: 1, borderColor: t.c.line, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, color: t.c.muted, lineHeight: 13 }}>✕</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {refList.some((r) => r.status === 'noface') ? <P style={{ fontSize: 12.5, color: t.c.noDeep }}>{tr('ob.s4NoFace')}</P> : null}
          <Btn busy={busy} kind={refs >= 3 ? 'ghost' : 'primary'} title={refList.length ? tr('ob.s4More') : tr('ob.s4Pick')} onPress={async () => {
            setBusy(true);
            try { await pickAndAddRefs(setMsg); } catch (e: any) { Alert.alert(tr('common.addFailed'), String(e?.message || e)); }
            finally { setBusy(false); reloadRefs(); }
          }} />
          {msg ? <P muted style={{ fontSize: 13, textAlign: 'center' }}>{msg}</P> : null}
        </Step>

        <Step n={5} title={tr('ob.s5')} done={false} active={step === 5}>
          <P muted style={{ fontSize: 13 }}>{tr('ob.s5Body')}</P>
          <Btn busy={busy} title={tr('ob.s5Btn')} onPress={finish} />
        </Step>
      </ScrollView>
      <FolderPicker visible={pick} onClose={() => setPick(false)} onPick={async (f) => {
        setPick(false);
        await DB.saveSettings({ folderId: f.id, folderName: f.name });
        setFolder(f.name);
      }} />
    </Paper>
  );
}
