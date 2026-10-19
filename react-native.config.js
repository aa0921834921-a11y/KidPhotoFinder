// onnxruntime-react-native 附了一個舊式的 unimodule.json，Expo 的自動連結因此把它當成「和 Expo 模組衝突」而跳過，
// 結果 Android 沒有註冊它的 OnnxruntimePackage，App 一啟動載入辨識模組就閃退。
// 這裡明確告訴自動連結：照一般 React Native 套件註冊它。
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: {
        android: {
          sourceDir: 'android',
          packageName: 'ai.onnxruntime.reactnative',
          packageImportPath: 'import ai.onnxruntime.reactnative.OnnxruntimePackage;',
          packageInstance: 'new OnnxruntimePackage()',
        },
      },
    },
  },
};
