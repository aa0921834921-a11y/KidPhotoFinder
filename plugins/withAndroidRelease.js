// Android 正式版打包設定（GitHub Actions 用）：
// 1. 有設定自己的簽章（環境變數 KPF_KEYSTORE…）就用它簽，沒有就用 Expo 範本附的固定簽章
// 2. Gradle 專案名稱改成英文（避免中文名稱在少數工具出問題）
// 3. 給 Gradle 多一點記憶體
const { withAppBuildGradle, withSettingsGradle, withGradleProperties } = require('@expo/config-plugins');

const RELEASE_SIGNING = `        release {
            if (System.getenv("KPF_KEYSTORE")) {
                storeFile file(System.getenv("KPF_KEYSTORE"))
                storePassword System.getenv("KPF_KEYSTORE_PASSWORD")
                keyAlias System.getenv("KPF_KEY_ALIAS")
                keyPassword(System.getenv("KPF_KEY_PASSWORD") ?: System.getenv("KPF_KEYSTORE_PASSWORD"))
            }
        }`;

module.exports = function withAndroidRelease(config) {
  config = withAppBuildGradle(config, (c) => {
    let src = c.modResults.contents;
    if (c.modResults.language !== 'groovy' || src.includes('KPF_KEYSTORE')) return c;
    src = src.replace(/^(\s*signingConfigs\s*\{\s*)$/m, (m) => `${m}\n${RELEASE_SIGNING}`);
    src = src.replace(
      /(\n\s*release\s*\{(?:\s*\/\/[^\n]*)*\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig(System.getenv("KPF_KEYSTORE") ? signingConfigs.release : signingConfigs.debug)',
    );
    if (!src.includes('signingConfigs.release')) throw new Error('withAndroidRelease：找不到 release 簽章設定，Expo 範本可能改了');
    c.modResults.contents = src;
    return c;
  });
  config = withSettingsGradle(config, (c) => {
    c.modResults.contents = c.modResults.contents.replace(/rootProject\.name\s*=\s*['"][^'"]*['"]/, "rootProject.name = 'KidPhotoFinder'");
    return c;
  });
  config = withGradleProperties(config, (c) => {
    const items = c.modResults.filter((x) => !(x.type === 'property' && x.key === 'org.gradle.jvmargs'));
    items.push({ type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8' });
    c.modResults = items;
    return c;
  });
  return config;
};
