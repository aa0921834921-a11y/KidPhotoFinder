/** 刮刮樂：去年的今天（從回憶時光機的「回憶玩法」進來；?demo=1 是示範資料） */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import ScratchScreen from '../features/memories/scratch/ScratchScreen';

export default function MemoryScratchPage() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  return <ScratchScreen demo={demo === '1'} />;
}
