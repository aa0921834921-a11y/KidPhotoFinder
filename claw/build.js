/**
 * 時光娃娃機：把遊戲做成 App 用的單一 HTML（assets/claw/claw.html）。
 *
 * App 的 WebView 直接讀這一個檔案：three.js、遊戲程式、所有美術圖都包在裡面，不用網路。
 * 改了 claw/ 裡的 game.js、shell.html 或 art/ 的圖之後，在專案資料夾執行：
 *
 *   node claw/build.js
 *
 * 會重新產生 assets/claw/claw.html（這個檔案要一起放上 GitHub）。
 */
const fs = require('fs');
const path = require('path');

const D = __dirname;
const OUT = path.join(D, '..', 'assets', 'claw', 'claw.html');

const shell = fs.readFileSync(path.join(D, 'shell.html'), 'utf8');
const game = fs.readFileSync(path.join(D, 'game.js'), 'utf8');
const three = fs.readFileSync(path.join(D, 'three.min.js'), 'utf8');

// 所有美術圖 → data URL（遊戲用 art('a/xxx.webp') 拿）
const art = {};
for (const f of fs.readdirSync(path.join(D, 'art')).sort()) {
  if (!f.endsWith('.webp')) continue;
  art[`a/${f}`] = `data:image/webp;base64,${fs.readFileSync(path.join(D, 'art', f)).toString('base64')}`;
}

// shell.html 前面是 <title>、<style>，後面是畫面
const cut = shell.indexOf('</style>') + '</style>'.length;
const head = shell.slice(0, cut).replace(/<meta name="claude:[^>]*>\s*/g, '');
let body = shell.slice(cut);
body = body.replace(/src="(a\/[a-z0-9_]+\.webp)"/g, (m, p) => {
  if (!art[p]) throw new Error(`找不到圖：${p}`);
  return `src="${art[p]}"`;
});
if (!body.includes('<script src="__THREE__"></script>') || !body.includes('__GAME__')) throw new Error('shell.html 少了 __THREE__ / __GAME__');
body = body.replace('<script src="__THREE__"></script>', () => `<script>${three}</script>`);
body = body.replace('__GAME__', () => `window.__ART=${JSON.stringify(art)};\n(function(){\n${game}\n})();`);

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>html,body{margin:0;height:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`assets/claw/claw.html ${(html.length / 1024 / 1024).toFixed(2)} MB，圖 ${Object.keys(art).length} 張`);
