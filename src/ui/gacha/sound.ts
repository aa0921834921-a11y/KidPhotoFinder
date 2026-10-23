/**
 * 扭蛋機的聲音和震動：旋鈕「喀喀」、扭蛋落地「咚」、揭曉時的小鈴聲。
 * 聲音都很小聲，跟著手機的媒體音量；手機開靜音或震動就不會響，也不會打斷正在播的音樂。播不出來就安靜略過。
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { SND } from './images';

type Player = { play(): void; seekTo(s: number): unknown; volume: number; remove(): void };
type AudioMod = {
  createAudioPlayer(src: number): Player;
  setAudioModeAsync(m: { playsInSilentMode?: boolean; interruptionMode?: 'mixWithOthers' }): Promise<void>;
};

let mod: AudioMod | null | undefined;
function audio(): AudioMod | null {
  if (mod === undefined) {
    try {
      mod = require('expo-audio') as AudioMod;
      // 手機開靜音（或震動）就不出聲；不打斷正在播的音樂
      mod.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    } catch { mod = null; }
  }
  return mod;
}

export type SoundKey = keyof typeof SND;

export function makeSounds() {
  const a = audio();
  const players: Partial<Record<SoundKey, Player>> = {};
  for (const k of Object.keys(SND) as SoundKey[]) {
    try { if (a) players[k] = a.createAudioPlayer(SND[k]); } catch {}
  }
  return {
    play(k: SoundKey, volume = 1) {
      const p = players[k];
      if (!p) return;
      try { p.volume = volume; p.seekTo(0); p.play(); } catch {}
    },
    tap(kind: 'light' | 'soft' | 'success') {
      if (Platform.OS === 'web') return;
      const run = kind === 'success'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(kind === 'soft' ? Haptics.ImpactFeedbackStyle.Soft : Haptics.ImpactFeedbackStyle.Light);
      run.catch(() => {});
    },
    release() {
      for (const p of Object.values(players)) { try { p?.remove(); } catch {} }
    },
  };
}
