// onnxruntime-react-native 官方 plugin 只支援 groovy 的 build.gradle；這裡兩種都支援，而且不會重複加。
const { withAppBuildGradle } = require('@expo/config-plugins');
module.exports = function withOrtAndroid(config) {
  return withAppBuildGradle(config, (c) => {
    const src = c.modResults.contents;
    if (src.includes('onnxruntime-react-native')) return c;
    const line = c.modResults.language === 'kt'
      ? '    implementation(project(":onnxruntime-react-native"))'
      : "    implementation project(':onnxruntime-react-native')";
    c.modResults.contents = src.replace(/^dependencies\s*\{\s*$/m, (m) => `${m}\n${line}`);
    return c;
  });
};
