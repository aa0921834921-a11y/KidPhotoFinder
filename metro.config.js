const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('onnx');
// 時光娃娃機的 3D 畫面（assets/claw/claw.html，由 claw/build.js 產生）當成檔案打包
config.resolver.assetExts.push('html');

// 網頁體驗版（KPF_DEMO=1）：把會用到手機功能的部分換成 demo/mocks 裡的示範資料
if (process.env.KPF_DEMO === '1') {
  const MOCK = /(?:^|\/)services\/(db|drive|scanner|background|recognizer|localClean|notices)$/;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const m = moduleName.match(MOCK);
    if (m && !context.originModulePath.includes(`${path.sep}mocks${path.sep}`)) {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'demo', 'mocks', m[1] + '.ts') };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}
module.exports = config;
