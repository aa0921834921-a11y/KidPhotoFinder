package tw.kidphotofinder.foreground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * 整理照片時的前景服務。
 * - 通知列常駐一行進度，系統就不會把 App 當成閒置而關掉
 * - 拿著 CPU 喚醒鎖：螢幕關掉時也繼續找臉
 * 真正的工作還是在 JS 那邊做；這個服務只負責「讓 App 活著」和顯示進度。
 */
class ScanService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "童年拾光"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "正在整理照片…"
    val notification = buildNotification(this, title, text, 0, 0)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // 系統不允許（例如 App 不在前景時才啟動）：放棄前景服務，整理還是照常在 App 裡進行
      stopSelf()
      return START_NOT_STICKY
    }
    if (wakeLock == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KidPhotoFinder:scan").apply {
        setReferenceCounted(false)
        acquire(8 * 60 * 60 * 1000L) // 最多 8 小時，避免萬一沒放掉一直耗電
      }
    }
    running = true
    // 被系統關掉後不要自己重新啟動（JS 那邊已經不在了，重啟也沒有工作可做）
    return START_NOT_STICKY
  }

  // Android 15 起，dataSync 類型的前景服務一天最多 6 小時；時間到就先收掉通知，整理會在下次打開 App 時接著做
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  override fun onDestroy() {
    running = false
    try { wakeLock?.let { if (it.isHeld) it.release() } } catch (e: Exception) {}
    wakeLock = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    }
    super.onDestroy()
  }

  companion object {
    const val CHANNEL_ID = "kpf_scan"
    const val NOTIFICATION_ID = 7301
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"

    @Volatile var running = false

    fun ensureChannel(context: Context) {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        val ch = NotificationChannel(CHANNEL_ID, "整理照片的進度", NotificationManager.IMPORTANCE_LOW).apply {
          description = "整理老師的照片時，在通知列顯示進度"
          setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
      }
    }

    fun buildNotification(context: Context, title: String, text: String, progress: Int, max: Int): Notification {
      ensureChannel(context)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      }
      val pending = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      val b = Notification.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle(title)
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(Notification.CATEGORY_PROGRESS)
      if (pending != null) b.setContentIntent(pending)
      if (max > 0) b.setProgress(max, progress.coerceIn(0, max), false) else b.setProgress(0, 0, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
      }
      return b.build()
    }
  }
}
