// Expo 設定。Google 登入需要的 ID 放在 google-config.json（見 SETUP.md）。
const g = require('./google-config.json');
const reversed = (id) => id.split('.').reverse().join('.');
// GitHub Actions 每次打包的編號（讓新版可以直接覆蓋安裝舊版）
const build = Number(process.env.KPF_BUILD_NUMBER) || 1;

module.exports = {
  expo: {
    name: '童年拾光',
    slug: 'kid-photo-finder',
    scheme: 'kidphotofinder',
    version: `1.0.${build}`,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    backgroundColor: '#F7EFE0',
    splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#F7EFE0' },
    ios: {
      bundleIdentifier: 'tw.kidphotofinder.app',
      supportsTablet: false,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: '用來選小孩的參考照片，以及把找到的照片存進「童年拾光」相簿。',
        NSPhotoLibraryAddUsageDescription: '把找到的小孩照片存進你的相簿。',
      },
    },
    android: {
      blockedPermissions: ['android.permission.READ_MEDIA_VIDEO'],
      package: 'tw.kidphotofinder.app',
      versionCode: build,
      adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', backgroundColor: '#F7EFE0' },
      permissions: ['POST_NOTIFICATIONS', 'READ_MEDIA_IMAGES'],
    },
    plugins: [
      'expo-router',
      'expo-sqlite',
      'expo-font',
      'expo-background-task',
      ['expo-notifications', { color: '#C97A7B' }],
      ['expo-media-library', {
        photosPermission: '用來選小孩的參考照片、整理 LINE 下載的照片，以及把找到的照片存進「童年拾光」相簿。',
        savePhotosPermission: '把找到的小孩照片存進你的相簿。',
        isAccessMediaLocationEnabled: false,
      }],
      ['expo-image-picker', { photosPermission: '用來選小孩的參考照片。', cameraPermission: false, microphonePermission: false }],
      ['@react-native-google-signin/google-signin', { iosUrlScheme: reversed(g.iosClientId) }],
      ['expo-build-properties', { ios: { deploymentTarget: '16.4' }, android: { minSdkVersion: 26, enableMinifyInReleaseBuilds: false, buildArchs: ['arm64-v8a'] } }],
      './plugins/withOrtAndroid',
      './plugins/withAndroidRelease',
    ],
    web: { bundler: 'metro', output: 'single', name: '童年拾光（體驗版）' },
    // 網頁體驗版放在 GitHub Pages 的子路徑（例如 /KidPhotoFinderApp）
    experiments: { typedRoutes: false, ...(process.env.EXPO_PUBLIC_BASE_URL ? { baseUrl: process.env.EXPO_PUBLIC_BASE_URL } : {}) },
    extra: { iosClientId: g.iosClientId, webClientId: g.webClientId },
  },
};
