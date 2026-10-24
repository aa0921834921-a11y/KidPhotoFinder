/** 回憶星空（從回憶時光機的「回憶玩法」進來；?demo=1 是示範資料） */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import SkyScreen from '../features/memories/sky/SkyScreen';

export default function MemorySkyPage() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  return <SkyScreen demo={demo === '1'} />;
}
