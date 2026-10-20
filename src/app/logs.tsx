import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { sp, tr, useLang } from '../i18n';
import * as DB from '../services/db';
import { Card, H1, Link, P, Paper, T } from '../ui/kit';

export default function Logs() {
  useLang();
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof DB.lastRuns>>>([]);
  useEffect(() => { DB.lastRuns(50).then(setRuns); }, []);
  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 40 }}>
        <View style={{ alignSelf: 'flex-start' }}><Link title={tr('common.back')} onPress={() => router.back()} /></View>
        <H1>{tr('logs.title')}</H1>
        {!runs.length ? <P muted>{tr('logs.empty')}</P> : null}
        {runs.map((r, i) => (
          <Card key={i} style={{ padding: 14 }}>
            <T>{r.finished.slice(5, 16).replace('-', '/')}{sp()}{r.mode === 'background' ? tr('logs.auto') : tr('logs.manual')}</T>
            <P style={{ fontSize: 13 }}>{tr('logs.line', { scanned: r.scanned, saved: r.saved, review: r.review, errors: r.errors })}</P>
            {r.note ? <P muted style={{ fontSize: 12 }}>{r.note === 'stopped' || r.note === '中途停止' ? tr('logs.stopped') : r.note}</P> : null}
          </Card>
        ))}
      </ScrollView>
    </Paper>
  );
}
