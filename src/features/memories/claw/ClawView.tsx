/**
 * 時光娃娃機的 3D 畫面（手機）：用 WebView 打開 assets/claw/claw.html（three.js 做的 3D 娃娃機，所有圖都包在檔案裡，不用網路）。
 * App ⇄ 遊戲：遊戲用 window.ReactNativeWebView.postMessage 傳 JSON 過來；App 用 injectJavaScript 呼叫 window.__clawRecv。
 */
import React, { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

export type ClawPage = { html?: string; uri?: string };
/** react-native-webview 的型別（class 預設泛型是 undefined，跟新版 TypeScript 合不來），這裡只用到這兩個方法 */
type WVHandle = { injectJavaScript: (code: string) => void; reload: () => void };
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WVHandle> }>;
export type ClawSend = (msg: object) => void;

/** JSON 放進 JavaScript 字串時，U+2028/U+2029 要另外跳脫 */
const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS = new RegExp(String.fromCharCode(0x2029), 'g');
const js = (v: unknown) => JSON.stringify(v).replace(LS, '\\u2028').replace(PS, '\\u2029');

/** 外面的畫面更新（例如「照片做到第幾張」）不會讓 WebView 重新整理：memo＋固定的 source */
export default memo(function ClawView({ page, onMessage, sendRef, onCrash }: {
  page: ClawPage; onMessage: (msg: any) => void; sendRef: MutableRefObject<ClawSend | null>; onCrash?: () => void;
}) {
  const wv = useRef<WVHandle>(null);
  useEffect(() => {
    sendRef.current = (msg) => wv.current?.injectJavaScript(`window.__clawRecv&&window.__clawRecv(${js(msg)});true;`);
    return () => { sendRef.current = null; };
  }, [sendRef]);
  const source = useMemo(() => ({ html: page.html || '', baseUrl: 'https://localhost/' }), [page.html]);
  return (
    <WebView
      ref={wv}
      source={source}
      originWhitelist={['*']}
      style={s.wv}
      containerStyle={s.wv}
      onMessage={(e: WebViewMessageEvent) => { try { onMessage(JSON.parse(e.nativeEvent.data)); } catch {} }}
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      textZoom={100}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      webviewDebuggingEnabled={__DEV__}
      onRenderProcessGone={() => { onCrash?.(); }}
      onContentProcessDidTerminate={() => { wv.current?.reload(); }}
    />
  );
});

const s = StyleSheet.create({ wv: { flex: 1, backgroundColor: '#070b1d' } });
