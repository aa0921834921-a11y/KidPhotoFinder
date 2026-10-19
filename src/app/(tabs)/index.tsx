import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as DB from '../../services/db';
import { NeedSignIn } from '../../services/drive';
import { interruptedScan, requestStop, runScan } from '../../services/scanner';
import { useApp } from '../../services/state';
import { CoverArt, Logo, Polaroid, Ribbon } from '../../ui/art';
import { FaceCard } from '../../ui/FaceCard';
import { art, Bar, Btn, cardStyle, DashLine, H2, Icon, P, Paper, useContentWidth } from '../../ui/kit';
import { makeStyles, useTheme, type Theme } from '../../ui/theme';
import { usePreview } from '../../ui/usePreview';

const greeting = () => { const h = new Date().getHours(); return h < 5 ? '夜深了' : h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; };
const PHASE: Record<string, string> = { model: '正在下載辨識模型', list: '正在看老師的資料夾', scan: '正在找臉', decide: '正在判斷', save: '正在存進相簿' };
const TILTS = [-2.2, 2, -0.8, 1.6, -1.8, 1.1];

type Recent = { file_id: string; at: string; name: string; folder: string };
const folderCap = (f: string) => (f.split('/').filter(Boolean).pop() || '').slice(0, 14);
const today = () => DB.now().slice(0, 10);
const fmtTime = (s: string) => `${s.slice(5, 7)}/${s.slice(8, 10)} ${s.slice(11, 16)}`;

function openPhoto(id: string) { router.push({ pathname: '/viewer', params: { id, list: 'saved' } }); }

/** 照片牆上的一張 */
function WallPhoto({ r, size, i }: { r: Recent; size: number; i: number }) {
  const uri = usePreview(r.file_id, 512);
  return (
    <Polaroid uri={uri} size={size} caption={folderCap(r.folder)} tilt={TILTS[i % TILTS.length]} tape={i % 3}
      badge={r.at.slice(0, 10) === today() ? '新' : undefined} onPress={() => openPhoto(r.file_id)} />
  );
}

/** 小相簿裡貼的一張 */
function Mount({ r, size, i }: { r: Recent; size: number; i: number }) {
  const uri = usePreview(r.file_id, 768);
  return <Polaroid uri={uri} size={size} ratio={1.08} caption={folderCap(r.folder)} tilt={i ? 3 : -3} tape={i ? 2 : 1} onPress={() => openPhoto(r.file_id)} />;
}

export default function Home() {
  const t = useTheme();
  const s = useStyles();
  const app = useApp((x) => x);
  const w = useContentWidth(16);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const [faces, setFaces] = useState<number[]>([]);
  const [refsOk, setRefsOk] = useState(0);
  const [auto, setAuto] = useState(true);

  useFocusEffect(useCallback(() => {
    DB.recentSaved(12).then(setRecent);
    DB.getMeta('last_scan').then(setLast);
    DB.decisionsList('review').then((l) => setFaces(l.slice(0, 3).map((x) => x.faceId))).catch(() => {});
    DB.listRefs().then((r) => setRefsOk(r.filter((x) => x.status === 'ok' || x.status === 'anchor' || x.status === 'multi').length)).catch(() => {});
    DB.getSettings().then((x) => setAuto(x.autoDaily));
  }, [app.version]));

  const latest = usePreview(recent[0]?.file_id || null, 768);

  const start = async (resume = false) => {
    try {
      const r = await runScan('manual', Infinity, { resume });
      Alert.alert(r.stopped ? '已經停止' : '完成了', r.saved ? `新存了 ${r.saved} 張照片到相簿${r.review ? `，另外 ${r.review} 張等你確認` : ''}。` : r.review ? `有 ${r.review} 張照片等你確認。` : '沒有新照片。');
    } catch (e: any) {
      if (e instanceof NeedSignIn) Alert.alert('需要重新登入', '請到「設定」重新登入 Google 帳號。');
      else Alert.alert('沒有完成', String(e?.message || e));
    }
  };

  // 上次整理到一半 App 被關掉了：打開時自動接著做（已經看過的照片不會重看）
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    interruptedScan().then((yes) => { if (yes) start(true); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 小相簿：最新一張＋另一個活動的一張
  const featured: Recent[] = [];
  if (recent[0]) {
    featured.push(recent[0]);
    const other = recent.find((r) => r.folder !== recent[0].folder) || recent[1];
    if (other && other !== recent[0]) featured.push(other);
  }
  const mountW = Math.floor((w - 28 - 16) / 2) - 12;
  const wallGap = t.tilt ? 12 : 8;
  const wallW = Math.floor((w - 28 - wallGap * 2) / 3) - (t.id === 'minimal' || t.id === 'starry' ? 0 : 10);
  const anyToday = recent.some((r) => r.at.slice(0, 10) === today());
  const wc = t.art === 'watercolor';

  const stats = [
    { ic: '▧', n: app.counts.saved, l: '已珍藏的照片' },
    { ic: '♡', n: app.counts.review, l: '待確認的笑臉' },
    { ic: '✿', n: app.counts.savedToday, l: '今天的新照片' },
    { ic: '♧', n: refsOk, l: '可用的參考照片' },
  ];

  return (
    <Paper cap="首頁・封面">
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {t.id !== 'book' ? (
          <View style={s.brand}>
            <Logo size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.brandName}>童年拾光</Text>
              <Text style={s.brandSub}>收藏每一個成長瞬間</Text>
            </View>
            <Pressable style={s.bell} onPress={() => router.push('/logs')} accessibilityLabel="執行紀錄">
              <Icon name="bell" size={21} />
              {app.counts.savedToday > 0 ? <View style={s.bellDot} /> : null}
            </Pressable>
          </View>
        ) : null}

        {/* 封面 */}
        <View style={s.cover}>
          <View style={s.eyebrow}>
            <View style={s.eyeLine} />
            <Text style={s.eyeEn}>OUR LITTLE MEMORIES</Text>
            <Text style={s.eyeZh}>孩子的成長手帳</Text>
          </View>
          <View style={s.tag}><Text style={s.tagText}>✦　每一張，都是珍貴的故事　✦</Text></View>
          <Text style={s.coverH1}>
            {greeting()}！{'\n'}<Text style={{ color: t.c.coverEm }}>陪你找回</Text>{'\n'}孩子的美好時光<Text style={s.heart}> ♡</Text>
          </Text>
          <Text style={s.lead}>從老師分享的照片裡，{'\n'}收藏每一個<Text style={{ color: t.c.accentDeep }}>閃閃發光的成長瞬間。</Text></Text>
          {app.running ? null : <Btn title="✿ 立即找新照片 ↗" onPress={() => start()} style={{ alignSelf: 'flex-start', marginTop: 16 }} />}
          <Text style={s.cfoot}>✎ {app.running ? '整理中…' : last ? `上次整理 ${fmtTime(last)}` : '還沒有整理過'}　·　{auto ? '每天會自動整理' : '自動整理已關閉'}</Text>
          <CoverArt uri={latest} width={w} onPhoto={recent[0] ? () => openPhoto(recent[0].file_id) : undefined} />
        </View>

        {/* 整理中 */}
        {app.running ? (
          <View style={[cardStyle(t), s.job]}>
            {wc ? <Text style={s.jobFlower}>✿</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="camera" color={t.c.accent} />
              <H2 style={{ flex: 1, fontSize: 18 }}>{PHASE[app.phase] || '整理中'}</H2>
              {app.phase === 'scan' || app.phase === 'list'
                ? <Btn small kind="ghost" title={app.stopping ? '停止中…' : '停止'} disabled={app.stopping} onPress={() => requestStop()} /> : null}
            </View>
            <View style={{ marginTop: 12 }}>
              <Bar value={app.phase === 'model' ? app.modelProgress : app.total ? app.done / app.total : 0} indeterminate={app.phase !== 'scan' && app.phase !== 'model'} />
            </View>
            <P muted style={{ marginTop: 8, fontSize: 13 }}>
              {app.stopping ? app.message : app.phase === 'scan' && app.total ? `${app.done} / ${app.total}　有臉的照片 ${app.found} 張　${app.eta}` : app.phase === 'model' ? `${Math.round(app.modelProgress * 100)}%` : app.message}
            </P>
            <P muted style={{ fontSize: 12 }}>可以切到別的 App，回來會繼續；第一次會比較久。</P>
          </View>
        ) : null}

        {/* 數字 */}
        <View style={s.inv}>
          {stats.map((x, i) => (
            <View key={x.l} style={[s.it, t.id === 'minimal' && s.itMin]}>
              <View style={[s.ic, { backgroundColor: t.c.ic[i] }]}>
                <Text style={[s.icText, { color: i === 2 ? t.c.yes : i === 3 ? t.c.tan : t.c.accentDeep }]}>{x.ic}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nm}>{x.n}</Text>
                <Text style={s.lb} numberOfLines={1} adjustsFontSizeToFit>{x.l}</Text>
              </View>
            </View>
          ))}
          {t.id !== 'minimal' ? (
            <>
              <DashLine vertical style={s.vSep} />
              <DashLine style={s.hSep} />
            </>
          ) : null}
        </View>

        {/* 待確認 */}
        {app.counts.review > 0 ? (
          <Pressable onPress={() => router.navigate('/review')} style={({ pressed }) => [s.callout, pressed && { transform: [{ scale: 0.99 }] }]}>
            {t.id !== 'minimal' ? <Text style={s.doo}>♡</Text> : null}
            <View style={s.faces}>
              {faces.map((f, i) => <FaceCard key={f} faceId={f} size={38} round style={[s.face, i ? { marginLeft: -11 } : null]} />)}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.coTitle}>有 {app.counts.review} 張小小笑臉{'\n'}等你來認認看 ♡</Text>
              <Text style={s.coSub}>小幫手還不太確定，請幫忙看看是不是家裡的寶貝。</Text>
              <View style={s.coGo}><Text style={s.coGoText}>一起確認 →</Text></View>
            </View>
          </Pressable>
        ) : null}

        {/* 整理 LINE 照片 */}
        <Pressable onPress={() => router.push('/clean')} style={({ pressed }) => [cardStyle(t), s.line, pressed && { transform: [{ scale: 0.99 }] }]}
          accessibilityRole="button" accessibilityLabel="整理 LINE 照片">
          <View style={s.lineIc}><Text style={s.lineIcText}>LINE</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.coTitle}>整理 LINE 相簿</Text>
            <Text style={s.coSub}>下載到手機後，一鍵留下有孩子的照片，其他的確認後刪除。</Text>
          </View>
          <Text style={s.coGoText}>›</Text>
        </Pressable>

        {/* 小相簿 */}
        {featured.length ? (
          <View style={{ gap: 10 }}>
            <Text style={s.ov}>CHAPTER 01 · LITTLE STORIES</Text>
            <Text style={s.chapTitle}>最近的成長故事</Text>
            <P muted style={{ marginTop: -4 }}>每一張普通的照片，都有一個獨一無二的童年時刻。</P>
            <View style={s.sbook}>
              {t.id === 'watercolor' || t.id === 'book' ? <View pointerEvents="none" style={s.spine} /> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                {featured.map((r, i) => <Mount key={r.file_id} r={r} i={i} size={mountW} />)}
              </View>
              <View style={s.note}>
                {t.id !== 'minimal' ? <Text style={{ color: '#D9AB70', fontSize: 17 }}>✿</Text> : null}
                <Text style={s.noteText}>把這些可愛的日常，留給未來的你。</Text>
                {t.id !== 'minimal' ? <Text style={{ color: '#D9AB70', fontSize: 15 }}>✧</Text> : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* 照片牆 */}
        <View style={s.sheet}>
          <Ribbon>{anyToday ? '今天收藏的小小時光' : '最近收藏的小小時光'}</Ribbon>
          <Text style={s.sheetSub}>一張一張收藏，慢慢長成專屬於你們的回憶。</Text>
          {recent.length ? (
            <>
              <View style={[s.wall, { gap: wallGap, rowGap: t.tilt ? 18 : 8 }]}>
                {recent.slice(0, 6).map((r, i) => <WallPhoto key={r.file_id} r={r} i={i} size={wallW} />)}
              </View>
              <View style={{ alignItems: 'center', marginTop: 18, zIndex: 2 }}>
                <Btn small kind="ghost" title="打開完整相簿 →" onPress={() => router.navigate('/album')} />
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 10, gap: 8 }}>
              <Logo size={54} />
              <P muted style={{ textAlign: 'center' }}>按「立即找新照片」，找到的照片會一張一張貼在這裡，也會存進手機相簿。</P>
            </View>
          )}
          {wc ? <Image source={art.blooms} style={s.corner} contentFit="contain" /> : null}
        </View>

        {/* 結尾 */}
        <View style={s.endq}>
          <DashLine style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
          {wc ? <Image source={art.children} style={{ width: 230, height: 66 }} contentFit="contain" /> : null}
          <Text style={s.endText}>那些平凡的小小日常，{'\n'}就是最值得珍藏的大大幸福 <Text style={{ color: t.c.accent }}>♡</Text></Text>
        </View>
      </ScrollView>
    </Paper>
  );
}

const useStyles = makeStyles((t: Theme) => {
  const c = t.c;
  const wc = t.id === 'watercolor' || t.id === 'book';
  const coverLook: ViewStyle =
    t.id === 'minimal' ? { borderRadius: 22, paddingBottom: 20, borderWidth: 0, backgroundImage: 'linear-gradient(150deg, #FFFFFF 0%, #FFFFFF 58%, #EAF6F0 100%)', boxShadow: t.shadow } as ViewStyle
      : t.id === 'starry' ? { borderRadius: 20, borderColor: '#38427A', backgroundImage: 'linear-gradient(160deg, #252E5C 0%, #1C2349 55%, #2A2357 100%)', boxShadow: t.shadow } as ViewStyle
        : t.id === 'candy' ? { borderRadius: 28, borderWidth: 2, backgroundImage: 'linear-gradient(160deg, #FFFFFF 0%, #FFFFFF 60%, #FFEFF6 100%)', boxShadow: '0px 6px 0px #F4CDE0' } as ViewStyle
          : {
            borderTopLeftRadius: 12, borderTopRightRadius: 18, borderBottomRightRadius: 20, borderBottomLeftRadius: 14, backgroundColor: '#FFF9EF',
            backgroundImage: 'radial-gradient(ellipse at 100% 0%, rgba(242,196,186,0.38) 0%, rgba(242,196,186,0) 45%), radial-gradient(ellipse at 0% 46%, rgba(205,222,196,0.34) 0%, rgba(205,222,196,0) 40%), radial-gradient(ellipse at 60% 100%, rgba(246,222,186,0.45) 0%, rgba(246,222,186,0) 50%)',
            boxShadow: '0px 16px 30px rgba(140,100,70,0.14), 0px 3px 2px rgba(190,155,120,0.22)',
          } as ViewStyle;
  return StyleSheet.create({
    scroll: { padding: 16, paddingTop: t.id === 'book' ? 12 : 14, paddingBottom: 40, gap: 16 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
    brandName: { ...t.title, fontSize: 17, color: c.ink, letterSpacing: 0.6 },
    brandSub: { ...t.round, fontSize: 10.5, color: c.muted, letterSpacing: 0.8, marginTop: 1 },
    bell: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center' },
    bellDot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, borderWidth: 1.5, borderColor: c.card2 },

    cover: { overflow: 'hidden', paddingTop: 22, paddingHorizontal: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, ...coverLook },
    eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    eyeLine: { width: 22, height: 1, backgroundColor: c.eyebrow, opacity: 0.6 },
    eyeEn: { ...t.num, fontWeight: '500', fontSize: 9.5, letterSpacing: 2, color: c.eyebrow },
    eyeZh: { ...t.round, fontSize: 12, color: c.muted },
    tag: {
      alignSelf: 'flex-start', marginTop: 12, paddingVertical: 5, paddingHorizontal: 16, backgroundColor: c.tagBg,
      borderRadius: t.id === 'minimal' || t.id === 'candy' ? 999 : 2, transform: [{ rotate: t.id === 'minimal' ? '0deg' : '-2deg' }],
    },
    tagText: { ...t.round, fontSize: 13, color: c.tagText },
    coverH1: { ...t.title, marginTop: 12, fontSize: 30, lineHeight: 42, color: c.coverTitle, letterSpacing: 1 },
    heart: { fontFamily: t.num.fontFamily, fontWeight: '400', color: c.heart },
    lead: { ...t.round, marginTop: 8, fontSize: 14.5, lineHeight: 26, color: c.lead },
    cfoot: { ...t.round, marginTop: 12, fontSize: 11.5, color: c.muted },

    job: { padding: 16, overflow: 'hidden' },
    jobFlower: { position: 'absolute', right: 14, top: -12, fontSize: 40, color: 'rgba(245,218,204,0.9)' },

    inv: {
      flexDirection: 'row', flexWrap: 'wrap',
      ...(t.id === 'minimal' ? { gap: 10 } : {
        borderWidth: t.id === 'candy' ? 2 : 1, borderStyle: t.id === 'candy' ? 'solid' : 'dashed', borderColor: t.id === 'candy' ? c.line : c.dash,
        borderRadius: t.id === 'candy' ? 22 : 14, backgroundColor: c.card, overflow: 'hidden',
        boxShadow: t.id === 'candy' ? '0px 5px 0px #F4CDE0' : wc ? '0px 6px 14px rgba(172,127,88,0.16)' : 'none',
      }),
    } as ViewStyle,
    it: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12 },
    itMin: { width: undefined, flexBasis: '45%', flexGrow: 1, backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: t.shadow } as ViewStyle,
    vSep: { position: 'absolute', left: '50%', top: 0, bottom: 0 },
    hSep: { position: 'absolute', top: '50%', left: 0, right: 0 },
    ic: {
      width: 38, height: 38, borderRadius: t.id === 'minimal' ? 12 : 19, alignItems: 'center', justifyContent: 'center',
      ...(wc || t.id === 'starry' ? { borderWidth: 1, borderStyle: 'dashed', borderColor: t.id === 'starry' ? '#4A5590' : '#CDAF95' } : {}),
    } as ViewStyle,
    icText: { ...t.round, fontSize: 18 },
    nm: { ...t.num, fontSize: 23, lineHeight: 27, color: c.statNum },
    lb: { ...t.round, fontSize: 11.5, color: c.muted, marginTop: 2 },

    callout: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, paddingLeft: 14,
      ...(t.id === 'minimal' ? { borderRadius: 18, backgroundColor: c.accentWash }
        : t.id === 'starry' ? { borderRadius: 16, borderWidth: 1, borderColor: '#3C4580', backgroundImage: 'linear-gradient(110deg, #2D2F66, #262C58)' }
          : t.id === 'candy' ? { borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: '#FFD36B', backgroundColor: '#FFF4D6' }
            : { borderRadius: 8, borderWidth: 1, borderColor: c.noteLine, backgroundColor: c.note, boxShadow: '2px 6px 12px rgba(171,121,85,0.14)' }),
    } as ViewStyle,
    doo: { position: 'absolute', top: -18, right: '18%', fontSize: 30, color: t.id === 'starry' ? '#FF9FB0' : '#DCAA9F', transform: [{ rotate: '-14deg' }], fontFamily: t.num.fontFamily },
    faces: { flexDirection: 'row', marginTop: 4 },
    face: { borderWidth: 2.5, borderColor: '#FFFDF8', boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' } as ViewStyle,
    line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    lineIc: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#06C755', alignItems: 'center', justifyContent: 'center' },
    lineIcText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    coTitle: { ...t.title, fontSize: 16, lineHeight: 23, color: c.calloutTitle },
    coSub: { ...t.round, fontSize: 12, lineHeight: 19, color: c.muted, marginTop: 3 },
    coGo: {
      alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed',
      borderColor: t.id === 'starry' ? '#4A5590' : c.dash, backgroundColor: t.id === 'starry' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.6)',
    },
    coGoText: { ...t.round, fontSize: 13.5, color: t.id === 'starry' ? '#FFE2A3' : c.accentDeep },

    ov: { ...t.num, fontWeight: '400', fontSize: 9.5, letterSpacing: 2, color: c.chapOv },
    chapTitle: { ...t.title, fontSize: 24, lineHeight: 32, color: c.chapTitle, transform: [{ rotate: wc || t.id === 'candy' ? '-1.5deg' : '0deg' }], alignSelf: 'flex-start' },
    sbook: {
      paddingTop: 22, paddingHorizontal: 14, paddingBottom: 14,
      ...(t.id === 'minimal' ? { backgroundColor: '#FFFFFF', borderRadius: 18, boxShadow: t.shadow }
        : t.id === 'starry' ? { backgroundColor: '#1C2448', borderWidth: 1, borderColor: '#38427A', borderRadius: 14, boxShadow: '0px 14px 28px rgba(0,0,0,0.35)' }
          : t.id === 'candy' ? { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: c.line, borderRadius: 22, boxShadow: '0px 6px 0px #F4CDE0' }
            : {
              backgroundColor: '#FFF8EB', borderWidth: 1, borderColor: '#EAD6BD', borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: 12, borderBottomRightRadius: 12,
              boxShadow: '0px 12px 24px rgba(130,91,63,0.18), 5px 4px 0px rgba(214,186,160,0.65), 8px 7px 0px rgba(243,229,207,0.8)',
            }),
    } as ViewStyle,
    spine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 8, marginLeft: -4, backgroundImage: 'linear-gradient(90deg, rgba(187,148,115,0), rgba(187,148,115,0.35), rgba(255,252,228,0.5), rgba(187,148,115,0))' } as ViewStyle,
    note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
    noteText: { ...t.round, fontSize: 13.5, color: t.id === 'starry' ? c.ink2 : t.id === 'minimal' ? c.muted : '#896C5F' },

    sheet: {
      paddingTop: 20, paddingHorizontal: 14, paddingBottom: 24, overflow: 'visible',
      ...(t.id === 'minimal' ? { backgroundColor: '#FFFFFF', borderRadius: 20, boxShadow: t.shadow }
        : t.id === 'starry' ? { backgroundColor: '#1A2146', borderWidth: 1, borderColor: '#323C6A', borderRadius: 18 }
          : t.id === 'candy' ? { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: c.line, borderRadius: 24, boxShadow: '0px 6px 0px #F4CDE0' }
            : { backgroundColor: '#FFF9EE', borderWidth: 1, borderColor: '#E5D1B9', borderTopLeftRadius: 7, borderTopRightRadius: 13, borderBottomRightRadius: 10, borderBottomLeftRadius: 8, boxShadow: '0px 10px 24px rgba(152,108,71,0.16)' }),
    } as ViewStyle,
    sheetSub: { ...t.round, marginTop: 8, marginBottom: 16, fontSize: 12.5, color: wc ? '#A0806D' : c.muted },
    wall: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', zIndex: 1 },
    corner: { position: 'absolute', right: -2, bottom: -4, width: 118, height: 64, transform: [{ scaleX: -1 }], opacity: 0.85 },

    endq: { alignItems: 'center', gap: 6, paddingTop: 22, paddingBottom: 8 },
    endText: { ...t.round, textAlign: 'center', fontSize: 15, lineHeight: 26, color: wc ? '#8E685B' : c.muted },
  });
});
