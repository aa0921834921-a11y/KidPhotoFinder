package tw.kidphotofinder.foreground

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** 給 JS 用：開始／更新／結束「整理中」的前景服務，以及電池最佳化的設定。 */
class ForegroundModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("KpfForeground")

    /** 開始前景服務。成功送出回傳 true（系統不允許時回傳 false，整理還是照常進行）。 */
    Function("start") { title: String, text: String ->
      try {
        val intent = Intent(context, ScanService::class.java)
          .putExtra(ScanService.EXTRA_TITLE, title)
          .putExtra(ScanService.EXTRA_TEXT, text)
        context.startForegroundService(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    /** 更新通知列上的進度。max = 0 代表不知道總數（顯示跑馬燈）。 */
    Function("update") { title: String, text: String, progress: Int, max: Int ->
      var ok = false
      if (ScanService.running) {
        try {
          val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
          nm.notify(ScanService.NOTIFICATION_ID, ScanService.buildNotification(context, title, text, progress, max))
          ok = true
        } catch (e: Exception) {
          ok = false
        }
      }
      ok
    }

    /**
     * 等一下再繼續。App 在背景時 React Native 會暫停 setTimeout，
     * 這個在原生的背景執行緒等待，背景時也會準時回來。
     */
    AsyncFunction("sleep") { ms: Int, promise: Promise ->
      // 用主執行緒的計時器（App 在背景時也會照常執行），不佔住 Expo 共用的工作執行緒
      Handler(Looper.getMainLooper()).postDelayed({ promise.resolve() }, ms.coerceIn(0, 60_000).toLong())
    }

    Function("stop") {
      try {
        context.stopService(Intent(context, ScanService::class.java))
      } catch (e: Exception) {
        // 服務已經停了
      }
      ScanService.running = false
      true
    }

    /** App 是不是已經設成「不限制電池用量」（沒設的話，有些手機還是會把背景工作關掉） */
    Function("isIgnoringBatteryOptimizations") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** 打開這個 App 的系統設定頁（家長可以在「電池」裡改成不限制） */
    Function("openAppSettings") {
      try {
        val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
