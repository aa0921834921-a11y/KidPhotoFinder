package tw.kidphotofinder.foreground

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.media.ExifInterface
import android.net.Uri
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import kotlin.math.max
import kotlin.math.min

/**
 * 合成通知用的照片：sources 裡的照片一張一張橫著排。
 * boxes：每張照片 4 個數字（孩子的臉在照片裡的相對位置 x, y, 寬, 高，0～1）；沒有臉就填 -1。
 * faceScale：臉大約佔照片高度的 1/faceScale（數字越小，臉越大）。
 */
class ComposeOptions : Record {
  @Field val sources: List<String> = emptyList()
  @Field val boxes: List<Double> = emptyList()
  @Field val width: Int = 720
  @Field val height: Int = 360
  @Field val faceScale: Double = 2.8
  @Field val out: String = ""
}

/** 一則新照片通知 */
class NoticeOptions : Record {
  @Field val id: Int = 1
  @Field val channelName: String = ""
  @Field val channelDescription: String = ""
  @Field val title: String = ""
  @Field val body: String = ""
  @Field val image: String? = null
  @Field val icon: String? = null
  @Field val url: String = ""
  @Field val actionTitles: List<String> = emptyList()
  @Field val actionUrls: List<String> = emptyList()
  @Field val publicTitle: String? = null
  @Field val publicBody: String? = null
}

/** 分享照片：uris 是手機相簿裡照片的 content:// 網址；pkg 有填就直接交給那個 App（例如 LINE） */
class ShareOptions : Record {
  @Field val uris: List<String> = emptyList()
  @Field val pkg: String? = null
  @Field val title: String? = null
}

object Photos {
  const val CHANNEL_ID = "kpf_photos"
  private val ACCENT: Int = Color.parseColor("#C27A7C")

  /** file:// 網址或一般路徑 → 檔案路徑 */
  fun toPath(s: String): String {
    if (s.startsWith("file://")) {
      val p = Uri.parse(s).path
      return if (p != null && p.isNotEmpty()) p else s.removePrefix("file://")
    }
    return s
  }

  private fun open(ctx: Context, src: String): InputStream? {
    val uri = if (src.startsWith("content://") || src.startsWith("file://")) Uri.parse(src) else Uri.fromFile(File(src))
    return ctx.contentResolver.openInputStream(uri)
  }

  /** 只讀照片的大小（讀不到就回傳 null） */
  private fun bounds(ctx: Context, src: String): BitmapFactory.Options? {
    val o = BitmapFactory.Options()
    o.inJustDecodeBounds = true
    try {
      open(ctx, src)?.use { BitmapFactory.decodeStream(it, null, o) }
    } catch (e: Exception) {
      return null
    }
    return if (o.outWidth > 0 && o.outHeight > 0) o else null
  }

  private fun orientation(ctx: Context, src: String): Int {
    var r = ExifInterface.ORIENTATION_NORMAL
    try {
      val s = open(ctx, src)
      if (s != null) {
        s.use { r = ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
      }
    } catch (e: Exception) {
      r = ExifInterface.ORIENTATION_NORMAL
    }
    return r
  }

  /** 讀照片（套用相機記錄的旋轉方向），長邊大約縮到 maxSide 左右 */
  private fun load(ctx: Context, src: String, maxSide: Int): Bitmap? {
    val b = bounds(ctx, src) ?: return null
    var sample = 1
    while (max(b.outWidth, b.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val o = BitmapFactory.Options()
    o.inSampleSize = sample
    var decoded: Bitmap? = null
    try {
      decoded = open(ctx, src)?.use { BitmapFactory.decodeStream(it, null, o) }
    } catch (e: Throwable) {
      decoded = null
    }
    val raw: Bitmap = decoded ?: return null
    val m = Matrix()
    // 比需要的大很多就順便縮小，記憶體用少一點
    val longSide = max(raw.width, raw.height)
    if (longSide > maxSide * 1.25f) {
      val s = maxSide.toFloat() / longSide
      m.postScale(s, s)
    }
    when (orientation(ctx, src)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        m.postRotate(90f)
        m.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        m.postRotate(270f)
        m.postScale(-1f, 1f)
      }
      else -> {
        // 方向正常，不用轉
      }
    }
    if (m.isIdentity) return raw
    var turned: Bitmap? = null
    try {
      turned = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
    } catch (e: Throwable) {
      turned = null
    }
    val result = turned
    if (result == null) {
      raw.recycle()
      return null
    }
    if (result != raw) raw.recycle()
    return result
  }

  private fun boxAt(boxes: List<Double>, i: Int): FloatArray? {
    if (boxes.size < i * 4 + 4) return null
    val x = boxes[i * 4].toFloat()
    val y = boxes[i * 4 + 1].toFloat()
    val w = boxes[i * 4 + 2].toFloat()
    val h = boxes[i * 4 + 3].toFloat()
    if (x < 0f || y < 0f || w <= 0f || h <= 0f) return null
    return floatArrayOf(x, y, w, h)
  }

  /** 要裁的範圍：以孩子的臉為中心，比例是 aspect（寬 / 高）。沒有臉就裁正中間。 */
  private fun cropRect(bw: Int, bh: Int, box: FloatArray?, aspect: Float, faceScale: Float): Rect {
    var cw: Float
    var ch: Float
    if (box != null) {
      // 臉太小（大合照）時不要放太大，不然會很糊：最少保留照片高度的 22%
      ch = max(box[3] * bh * faceScale, bh * 0.22f)
      cw = ch * aspect
    } else {
      cw = bw.toFloat()
      ch = cw / aspect
    }
    if (cw > bw) {
      cw = bw.toFloat()
      ch = cw / aspect
    }
    if (ch > bh) {
      ch = bh.toFloat()
      cw = ch * aspect
    }
    val cx = if (box != null) (box[0] + box[2] / 2f) * bw else bw / 2f
    // 中心放在臉的稍下方，肩膀和衣服也拍得到
    val cy = if (box != null) (box[1] + box[3] * 0.6f) * bh else bh / 2f
    val left = (cx - cw / 2f).coerceIn(0f, max(0f, bw - cw))
    val top = (cy - ch / 2f).coerceIn(0f, max(0f, bh - ch))
    val right = min(bw, (left + cw).toInt())
    val bottom = min(bh, (top + ch).toInt())
    return Rect(left.toInt(), top.toInt(), max(left.toInt() + 1, right), max(top.toInt() + 1, bottom))
  }

  /** 合成一張 JPEG，回傳檔案路徑 */
  fun compose(ctx: Context, o: ComposeOptions): String {
    val w = o.width.coerceIn(64, 2048)
    val h = o.height.coerceIn(64, 2048)
    // 先挑出讀得到的照片（壞掉或手機不支援的格式就跳過）
    val ok = ArrayList<Int>()
    for (i in o.sources.indices) {
      if (bounds(ctx, o.sources[i]) != null) ok.add(i)
    }
    if (ok.isEmpty()) throw IllegalStateException("No readable photo")
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(Color.WHITE)
    val n = ok.size
    val gap = if (n > 1) max(2, w / 180) else 0
    val tileW = (w - gap * (n - 1)).toFloat() / n
    val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    val scale = o.faceScale.toFloat().coerceIn(1.2f, 6f)
    var drawn = 0
    for (k in 0 until n) {
      val i = ok[k]
      val box = boxAt(o.boxes, i)
      val frac = if (box != null) min(1f, max(box[3] * scale, 0.22f)) else 1f
      val maxSide = (h / frac * 1.6f).toInt().coerceIn(480, 2048)
      val bmp = load(ctx, o.sources[i], maxSide) ?: continue
      val src = cropRect(bmp.width, bmp.height, box, tileW / h, scale)
      val left = k * (tileW + gap)
      canvas.drawBitmap(bmp, src, RectF(left, 0f, left + tileW, h.toFloat()), paint)
      bmp.recycle()
      drawn++
    }
    if (drawn == 0) {
      out.recycle()
      throw IllegalStateException("No readable photo")
    }
    val file = File(toPath(o.out))
    file.parentFile?.mkdirs()
    FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.JPEG, 90, it) }
    out.recycle()
    return file.absolutePath
  }

  /** 點通知或按鈕時：用 kidphotofinder:// 網址打開 App 裡對應的頁面 */
  private fun pending(ctx: Context, url: String, code: Int): PendingIntent? {
    if (url.isEmpty()) return null
    return try {
      val i = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      i.setPackage(ctx.packageName)
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    } catch (e: Exception) {
      null
    }
  }

  /** 新照片的通知分類：重要程度「高」，正在用別的 App 時也會從上面跳出來 */
  fun ensureChannel(ctx: Context, name: String, description: String) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val ch = NotificationChannel(CHANNEL_ID, if (name.isEmpty()) "New photos" else name, NotificationManager.IMPORTANCE_HIGH)
    if (description.isNotEmpty()) ch.description = description
    nm.createNotificationChannel(ch)
  }

  private fun decode(path: String?): Bitmap? {
    if (path == null || path.isEmpty()) return null
    return try {
      // RGB_565：記憶體只要一半，通知才不會因為圖片太大送不出去
      val o = BitmapFactory.Options()
      o.inPreferredConfig = Bitmap.Config.RGB_565
      BitmapFactory.decodeFile(toPath(path), o)
    } catch (e: Exception) {
      null
    }
  }

  /** 發出新照片通知。家長關掉通知時回傳 false。 */
  fun post(ctx: Context, o: NoticeOptions): Boolean {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!nm.areNotificationsEnabled()) return false
    ensureChannel(ctx, o.channelName, o.channelDescription)
    val big = decode(o.image)
    val icon = decode(o.icon)
    val b = Notification.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(R.drawable.kpf_notify_icon)
      .setColor(ACCENT)
      .setContentTitle(o.title)
      .setContentText(o.body)
      .setAutoCancel(true)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
    val tap = pending(ctx, o.url, o.id * 8)
    if (tap != null) b.setContentIntent(tap)
    if (icon != null) b.setLargeIcon(icon)
    if (big != null) {
      val style = Notification.BigPictureStyle().bigPicture(big).setSummaryText(o.body)
      // 展開時只顯示大照片（右邊的小頭像收起來）
      if (icon != null) style.bigLargeIcon(null as Icon?)
      b.setStyle(style)
    } else {
      b.setStyle(Notification.BigTextStyle().bigText(o.body))
    }
    val n = min(o.actionTitles.size, o.actionUrls.size)
    for (i in 0 until n) {
      val pi = pending(ctx, o.actionUrls[i], o.id * 8 + i + 1) ?: continue
      b.addAction(Notification.Action.Builder(null as Icon?, o.actionTitles[i], pi).build())
    }
    val pubTitle = o.publicTitle
    if (pubTitle != null && pubTitle.isNotEmpty()) {
      // 手機上鎖時只顯示這個（沒有照片）
      val pub = Notification.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.kpf_notify_icon)
        .setColor(ACCENT)
        .setContentTitle(pubTitle)
        .setContentText(o.publicBody ?: "")
        .build()
      b.setVisibility(Notification.VISIBILITY_PRIVATE)
      b.setPublicVersion(pub)
    } else {
      b.setVisibility(Notification.VISIBILITY_PUBLIC)
    }
    nm.notify(o.id, b.build())
    return true
  }

  /** 分享手機相簿裡的照片（一張或多張） */
  fun share(ctx: Context, activity: Activity?, o: ShareOptions): Boolean {
    val uris = ArrayList<Uri>()
    for (s in o.uris) {
      if (s.isNotEmpty()) uris.add(Uri.parse(s))
    }
    if (uris.isEmpty()) return false
    val send: Intent
    if (uris.size == 1) {
      send = Intent(Intent.ACTION_SEND)
      send.putExtra(Intent.EXTRA_STREAM, uris[0])
    } else {
      send = Intent(Intent.ACTION_SEND_MULTIPLE)
      send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
    }
    send.type = "image/*"
    // 讓收到的 App（例如 LINE）有權限讀這些照片
    val clip = ClipData.newRawUri("", uris[0])
    for (k in 1 until uris.size) clip.addItem(ClipData.Item(uris[k]))
    send.clipData = clip
    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    val pkg = o.pkg
    val intent: Intent
    if (pkg != null && pkg.isNotEmpty()) {
      send.setPackage(pkg)
      intent = send
    } else {
      intent = Intent.createChooser(send, o.title ?: "")
    }
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
    }
    return true
  }
}
