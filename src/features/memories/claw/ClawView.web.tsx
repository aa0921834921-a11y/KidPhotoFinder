/**
 * 時光娃娃機的 3D 畫面（網頁體驗版）：用 iframe 打開同一個 claw.html。
 * App ⇄ 遊戲用 postMessage（{ claw: 訊息 }）。網址後面加 #app，遊戲才知道是被 App 打開的。
 */
import React, { useEffect, useRef, type MutableRefObject } from 'react';

export type ClawPage = { html?: string; uri?: string };
export type ClawSend = (msg: object) => void;

export default function ClawView({ page, onMessage, sendRef }: {
  page: ClawPage; onMessage: (msg: any) => void; sendRef: MutableRefObject<ClawSend | null>; onCrash?: () => void;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.source && e.source === ref.current?.contentWindow && e.data && e.data.claw) onMessage(e.data.claw);
    };
    window.addEventListener('message', h);
    sendRef.current = (msg) => ref.current?.contentWindow?.postMessage({ claw: msg }, '*');
    return () => { window.removeEventListener('message', h); sendRef.current = null; };
  }, [onMessage, sendRef]);
  return React.createElement('iframe', {
    ref, src: `${page.uri || ''}#app`, title: 'claw', allow: 'autoplay',
    style: { border: 0, width: '100%', height: '100%', display: 'block', background: '#070b1d' },
  });
}
