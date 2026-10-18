import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { askNotificationPermission, syncSchedule } from '../services/background';
import * as DB from '../services/db';
import { signIn, restore, type Account } from '../services/drive';
import { downloadModel, modelReady, W600K_MB } from '../services/recognizer';
import { Logo } from '../ui/art';
import { art, Bar, Btn, Card, H1, H2, P, Paper } from '../ui/kit';
import { FolderPicker } from '../ui/FolderPicker';
import { pickAndAddRefs } from '../ui/pickRefs';
import { useTheme } from '../ui/theme';

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Card pad={16} style={[{ opacity: active || done ? 1 : 0.55 }, done && { backgroundColor: t.c.yesWash }, !active && !done && { boxShadow: 'none' } as any]}>
      <H2 style={{ fontSize: 18 }}>{done ? '✓ ' : `${n}. `}{title}</H2>
      {active && !done ? <View style={{ marginTop: 10, gap: 10 }}>{children}</View> : null}
    </Card>
  );
}

export default function Onboarding() {
  const t = useTheme();
  const [model, setModel] = useState(modelReady());
  const [prog, setProg] = useState<number | null>(null);
  const [acct, setAcct] = useState<Account | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [refs, setRefs] = useState(0);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);

  const reloadRefs = () => DB.listRefs().then((r) => setRefs(r.filter((x) => x.status !== 'noface').length));
  useEffect(() => {
    restore().then(setAcct);
    DB.getSettings().then((s) => setFolder(s.folderName));
    reloadRefs();
  }, []);

  const step = !model ? 1 : !acct ? 2 : !folder ? 3 : refs < 3 ? 4 : 5;

  const getModel = async () => {
    setProg(0);
    try { await downloadModel(setProg); setModel(true); } catch (e: any) { Alert.alert('下載沒有完成', `${e?.message || e}\n請確認網路後再試一次。`); }
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

  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 14 }}>
        {t.art === 'watercolor' ? <Image source={art.children} style={{ width: '100%', height: 90 }} contentFit="contain" /> : <View style={{ alignItems: 'center', paddingVertical: 8 }}><Logo size={72} /></View>}
        <H1>歡迎使用{'\n'}童年拾光 ♡</H1>
        <P muted>五個小步驟，之後每天會自動幫你把孩子的照片收進手機相簿。</P>

        <Step n={1} title="下載辨識模型" done={model} active={step === 1}>
          <P muted style={{ fontSize: 13 }}>約 {W600K_MB} MB，只要下載一次，建議連 Wi-Fi。辨識全部在手機裡完成。</P>
          {prog != null ? <Bar value={prog} /> : <Btn title="開始下載" onPress={getModel} />}
        </Step>

        <Step n={2} title="登入 Google 帳號" done={!!acct} active={step === 2}>
          <P muted style={{ fontSize: 13 }}>用「收到老師分享連結」的那個帳號。只會讀取，不會改動任何檔案。</P>
          <Btn title="用 Google 登入" onPress={async () => {
            try { setAcct(await signIn()); } catch (e: any) { Alert.alert('登入失敗', String(e?.message || e)); }
          }} />
        </Step>

        <Step n={3} title="選老師分享的資料夾" done={!!folder} active={step === 3}>
          <Btn title="選資料夾" onPress={() => setPick(true)} />
        </Step>

        <Step n={4} title="放幾張孩子的照片" done={refs >= 3} active={step === 4}>
          <P muted style={{ fontSize: 13 }}>從手機相簿挑 5～15 張清楚的臉（目前 {refs} 張）。</P>
          <Btn busy={busy} title="＋ 挑照片" onPress={async () => {
            setBusy(true);
            try { await pickAndAddRefs(); } catch (e: any) { Alert.alert('沒有加成功', String(e?.message || e)); }
            finally { setBusy(false); reloadRefs(); }
          }} />
        </Step>

        <Step n={5} title="允許存照片和通知" done={false} active={step === 5}>
          <P muted style={{ fontSize: 13 }}>找到的照片會存進「照片」App 的「童年拾光」相簿；有新照片時會通知你。</P>
          <Btn busy={busy} title="完成，開始使用 ✿" onPress={finish} />
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
