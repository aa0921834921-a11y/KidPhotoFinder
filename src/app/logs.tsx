import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as DB from '../services/db';
import { Card, H1, Link, P, Paper, T } from '../ui/kit';

export default function Logs() {
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof DB.lastRuns>>>([]);
  useEffect(() => { DB.lastRuns(50).then(setRuns); }, []);
  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 40 }}>
        <View style={{ alignSelf: 'flex-start' }}><Link title="‹ 返回" onPress={() => router.back()} /></View>
        <H1>執行紀錄</H1>
        {!runs.length ? <P muted>還沒有紀錄。</P> : null}
        {runs.map((r, i) => (
          <Card key={i} style={{ padding: 14 }}>
            <T>{r.finished.slice(5, 16).replace('-', '/')}　{r.mode === 'background' ? '自動' : '手動'}</T>
            <P style={{ fontSize: 13 }}>看了 {r.scanned} 張，存進相簿 {r.saved} 張，待確認 {r.review} 張{r.errors ? `，${r.errors} 張讀不到` : ''}</P>
            {r.note ? <P muted style={{ fontSize: 12 }}>{r.note}</P> : null}
          </Card>
        ))}
      </ScrollView>
    </Paper>
  );
}
