/**
 * 刮刮卡的銀箔（Skia）：
 * - 銀箔是一整張沒有刮過的圖（彩虹亮片銀箔，上面壓印金色的「童年拾光」、月亮和星星）
 * - 手指滑過就沿路擦掉（圓頭的粗線，用 clear 混合模式在同一個圖層裡擦），不是只在按下去的地方挖洞
 * - 刮痕的邊緣：外面一圈半透明（刮薄了），再加上一點一點的缺口，看起來像真的刮開的銀箔
 * - 刮掉多少用格子算（coverage.ts），同一個地方重複刮不會變多
 * 座標都用銀箔圖的單位（832 × 685），畫面大小不同也一樣。
 */
import { Canvas, Group, Image as SkImage, Path, Rect, Skia, useImage, type SkPathBuilder } from '@shopify/react-native-skia';
import React, { memo, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { Coverage, FOIL_H, FOIL_W, replay } from './coverage';

/** 刷頭半徑（銀箔單位）：卡片 300～420dp 寬時大約是 14～20dp */
export const BRUSH = 40;

export type FoilProps = {
  width: number;
  height: number;
  /** 一開始的刮痕（同一天再打開時） */
  strokes: number[][];
  /** 換卡、重刮時換一個數字 */
  version: number;
  disabled: boolean;
  onProgress: (ratio: number) => void;
  onStrokeEnd: (strokes: number[][], ratio: number) => void;
  /** 手指刮到哪裡（這個元件裡的座標，dp）：外面用來撒銀箔碎屑 */
  onScratch?: (x: number, y: number, dx: number, dy: number) => void;
  a11yLabel: string;
  a11yReveal: string;
  onA11yReveal: () => void;
};

const FOIL = require('../../../../assets/memory-ui/foil.webp');

/** 由座標算出來的亂數（同一筆刮痕重新畫的時候，缺口的位置也一樣） */
function rnd(x: number, y: number, i: number): number {
  let h = Math.imul(Math.round(x) | 0, 374761393) ^ Math.imul(Math.round(y) | 0, 668265263) ^ Math.imul(i + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 刮痕邊緣的小缺口（兩側各一排小圓） */
function chips(b: SkPathBuilder, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) { // 只點一下：繞著圓點一圈
    for (let i = 0; i < 9; i++) {
      const a = (i / 9 + rnd(ax, ay, i) * 0.08) * Math.PI * 2;
      const d = BRUSH - 3 + rnd(ax, ay, i + 20) * 10;
      b.addCircle(ax + Math.cos(a) * d, ay + Math.sin(a) * d, 2.2 + rnd(ax, ay, i + 40) * 5);
    }
    return;
  }
  const nx = -dy / len, ny = dx / len;
  const n = Math.max(1, Math.round(len / 8));
  for (let i = 0; i < n; i++) {
    const t = (i + rnd(ax, by, i)) / n;
    const px = ax + dx * t, py = ay + dy * t;
    for (const side of [1, -1]) {
      const d = BRUSH - 4 + rnd(px, py, side + 3) * 11;
      b.addCircle(px + nx * d * side, py + ny * d * side, 1.8 + rnd(py, px, side + 7) * 5.2);
    }
  }
}

function ScratchFoilCanvas(p: FoilProps) {
  const k = p.width / FOIL_W;
  const foil = useImage(FOIL);
  const cov = useRef(new Coverage(8)).current;
  const strokes = useRef<number[][]>([]);
  const line = useRef(Skia.PathBuilder.Make());
  const chip = useRef(Skia.PathBuilder.Make());
  const path = useSharedValue(Skia.Path.Make());
  const chipPath = useSharedValue(Skia.Path.Make());
  const last = useRef<[number, number] | null>(null);
  const lastReport = useRef(-1);
  const lastFlake = useRef(0);
  const cb = useRef(p);
  cb.current = p;

  // 換卡／重新打開：把之前的刮痕畫回去、覆蓋率重新算
  useEffect(() => {
    strokes.current = p.strokes.map((s) => [...s]);
    const b = Skia.PathBuilder.Make(), c = Skia.PathBuilder.Make();
    for (const s of strokes.current) {
      if (s.length < 2) continue;
      b.moveTo(s[0], s[1]);
      chips(c, s[0], s[1], s[0], s[1]);
      if (s.length === 2) b.lineTo(s[0] + 0.1, s[1]);
      for (let i = 2; i + 1 < s.length; i += 2) { b.lineTo(s[i], s[i + 1]); chips(c, s[i - 2], s[i - 1], s[i], s[i + 1]); }
    }
    line.current = b; chip.current = c;
    path.value = b.build(); chipPath.value = c.build();
    replay(cov, strokes.current, BRUSH);
    lastReport.current = cov.ratio();
    cb.current.onProgress(cov.ratio());
  }, [p.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const report = () => {
    const r = cov.ratio();
    if (Math.abs(r - lastReport.current) >= 0.004 || r >= 0.98) { lastReport.current = r; cb.current.onProgress(r); }
  };
  const flake = (u: number, v: number, du: number, dv: number) => {
    const now = Date.now();
    if (now - lastFlake.current < 45) return;
    lastFlake.current = now;
    cb.current.onScratch?.(u * k, v * k, du * k, dv * k);
  };
  const down = (x: number, y: number) => {
    const u = Math.round(x / k), v = Math.round(y / k);
    strokes.current.push([u, v]);
    line.current.moveTo(u, v).lineTo(u + 0.1, v);
    chips(chip.current, u, v, u, v);
    cov.stroke(u, v, u, v, BRUSH);
    last.current = [u, v];
    path.value = line.current.build(); chipPath.value = chip.current.build();
    flake(u, v, 0, 0);
    report();
  };
  const move = (x: number, y: number) => {
    const l = last.current;
    if (!l) { down(x, y); return; }
    const u = Math.round(x / k), v = Math.round(y / k);
    if (Math.hypot(u - l[0], v - l[1]) < 3) return;
    strokes.current[strokes.current.length - 1].push(u, v);
    line.current.lineTo(u, v);
    chips(chip.current, l[0], l[1], u, v);
    cov.stroke(l[0], l[1], u, v, BRUSH);
    last.current = [u, v];
    path.value = line.current.build(); chipPath.value = chip.current.build();
    flake(u, v, u - l[0], v - l[1]);
    report();
  };
  const up = () => {
    if (!last.current) return;
    last.current = null;
    cb.current.onProgress(cov.ratio());
    cb.current.onStrokeEnd(strokes.current.map((s) => [...s]), cov.ratio());
  };

  const pan = usePanGesture({
    runOnJS: true,
    enabled: !p.disabled,
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onBegin: (e) => down(e.x, e.y),
    onUpdate: (e) => move(e.x, e.y),
    onFinalize: () => up(),
  });

  return (
    <GestureDetector gesture={pan} touchAction="none" userSelect="none">
      <View style={{ width: p.width, height: p.height }} collapsable={false} accessible accessibilityRole="adjustable" accessibilityLabel={p.a11yLabel}
        accessibilityActions={[{ name: 'activate', label: p.a11yReveal }]} onAccessibilityAction={() => p.onA11yReveal()}>
        <Canvas style={{ width: p.width, height: p.height }} pointerEvents="none">
          <Group transform={[{ scale: k }]}>
            <Group layer>
              {foil ? <SkImage image={foil} x={0} y={0} width={FOIL_W} height={FOIL_H} fit="fill" /> : <Rect x={0} y={0} width={FOIL_W} height={FOIL_H} color="#CDD2E6" />}
              {/* 刮痕：外圈刮薄（半透明），中間完全刮掉，邊緣再缺幾口 */}
              <Path path={path} style="stroke" strokeWidth={BRUSH * 2 + 16} strokeCap="round" strokeJoin="round" color="rgba(0,0,0,0.38)" blendMode="dstOut" />
              <Path path={path} style="stroke" strokeWidth={BRUSH * 2} strokeCap="round" strokeJoin="round" color="black" blendMode="clear" />
              <Path path={chipPath} color="black" blendMode="clear" />
            </Group>
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

/** 刮的時候外面的畫面會一直更新（進度），銀箔本身不用跟著重畫：只有大小、換卡、能不能刮改變時才重畫 */
export default memo(ScratchFoilCanvas, (a, b) =>
  a.width === b.width && a.height === b.height && a.version === b.version && a.disabled === b.disabled && a.a11yLabel === b.a11yLabel);

export { FOIL_H, FOIL_W };
