/** 時光娃娃機（從回憶時光機的「回憶玩法」進來；?demo=1 是示範資料） */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import ClawScreen from '../features/memories/claw/ClawScreen';

export default function MemoryClawPage() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  return <ClawScreen demo={demo === '1'} />;
}
