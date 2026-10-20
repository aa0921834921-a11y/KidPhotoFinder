package tw.kidphotofinder.foreground

import android.app.NotificationChannel
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

    /** 通知分類的名字和說明跟著 App 的語言（已經建立的分類也會改名） */
    Function("setChannel") { name: String, desc: String ->
      ScanService.channelName = name
      ScanService.channelDescription = desc
      var ok = false
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(ScanService.CHANNEL_ID) != null) {
          val ch = NotificationChannel(ScanService.CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW)
          ch.description = desc
          ch.setShowBadge(false)
          nm.createNotificationChannel(ch)
        }
        ok = true
      } catch (e: Exception) {
        ok = false
      }
      ok
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

    /** 打開這個 App 的「通知」系統設定（家長在系統裡把通知關掉時用） */
    Function("openNotificationSettings") {
      var ok = false
      try {
        val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
        ok = true
      } catch (e: Exception) {
        ok = false
      }
      ok
    }

    // ---------- 新照片通知 ----------

    /** 合成通知用的照片（以孩子的臉為中心裁切；多張就並排），回傳 JPEG 的檔案路徑 */
    AsyncFunction("compose") { o: ComposeOptions ->
      Photos.compose(context, o)
    }

    /** 「新照片」通知分類（名字跟著 App 的語言） */
    Function("setPhotoChannel") { name: String, desc: String ->
      var ok = false
      try {
        Photos.ensureChannel(context, name, desc)
        ok = true
      } catch (e: Exception) {
        ok = false
      }
      ok
    }

    /** 發出新照片通知（大張照片＋按鈕）。送不出去回傳 false。 */
    Function("notify") { o: NoticeOptions ->
      var ok = false
      try {
        ok = Photos.post(context, o)
      } catch (e: Exception) {
        ok = false
      }
      ok
    }

    /** 收掉一則通知（從通知上的按鈕打開 App 時，系統不會自動收掉） */
    Function("cancelNotice") { id: Int ->
      var ok = false
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(id)
        ok = true
      } catch (e: Exception) {
        ok = false
      }
      ok
    }

    /** 系統有沒有允許這個 App 發通知 */
    Function("canNotify") {
      var ok = false
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ok = nm.areNotificationsEnabled()
      } catch (e: Exception) {
        ok = false
      }
      ok
    }

    /** 「新照片」這個通知分類有沒有被家長在系統設定裡關掉 */
    Function("photoChannelBlocked") {
      var blocked = false
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val ch = nm.getNotificationChannel(Photos.CHANNEL_ID)
        blocked = ch != null && ch.importance == NotificationManager.IMPORTANCE_NONE
      } catch (e: Exception) {
        blocked = false
      }
      blocked
    }

    /** 分享手機相簿裡的照片；pkg 有填就直接交給那個 App（例如 LINE） */
    Function("share") { o: ShareOptions ->
      var ok = false
      try {
        ok = Photos.share(context, appContext.currentActivity, o)
      } catch (e: Exception) {
        ok = false
      }
      ok
    }

    /** 手機有沒有裝某個 App（例如 LINE） */
    Function("isInstalled") { pkg: String ->
      var ok = false
      try {
        ok = context.packageManager.getLaunchIntentForPackage(pkg) != null
      } catch (e: Exception) {
        ok = false
      }
      ok
    }
  }
}
