# 幼稚園照片小幫手（手機版）

從老師分享的 Google 雲端硬碟資料夾裡，自動找出自己孩子的照片，存進手機相簿。
辨識全部在手機裡完成；每天自動檢查，有新照片會通知。

- `src/` 程式（Expo / React Native，iPhone 和 Android 共用）
- `.github/workflows/android.yml` 推上 GitHub 後自動打包 Android 安裝檔
- `google-config.json` Google 登入用的用戶端 ID
- `SETUP.md` iPhone 版的打包方式（Expo EAS + TestFlight）

**主題**：「設定 → 主題」可以換成水彩手帳、簡約清爽、星空晚安、糖果泡泡、翻頁故事書，App 會記住。
翻頁故事書換分頁時會真的翻頁，在頁面上左右滑也可以翻。
主題的顏色在 `src/ui/theme.ts`，裝飾插畫在 `src/ui/art.tsx`。

**網頁體驗版**：推上 GitHub 後也會自動做成網頁（GitHub Pages），iPhone、Android 用瀏覽器打開
`https://你的帳號.github.io/KidPhotoFinderApp/` 就能操作整個 App（用示範照片，不會登入、不會存照片）。
第一次要到 repo 的 Settings → Pages，把 Source 選成「GitHub Actions」。免費帳號的 repo 要設成 Public 才能用 Pages。

---

## Android：用 GitHub 自動打包

### 1. 放上 GitHub（只要做一次）

1. 到 https://github.com/new 建一個新的 repo，名稱例如 `kid-photo-app`
   - 公開（Public）或私人（Private）都可以。程式裡沒有你的照片或個人資料。
   - **不要**勾「Add a README」（保持空的）
2. 電腦裝 Git：https://git-scm.com/download/win （一路下一步）
3. 在解壓縮出來的 `KidPhotoFinderApp` 資料夾，網址列輸入 `cmd` 按 Enter，貼上（把 `你的帳號` 換掉）：

```
git remote add origin https://github.com/你的帳號/kid-photo-app.git
git push -u origin main
```

第一次會跳出視窗要你登入 GitHub，登入後就上傳完成。
（這個資料夾已經是準備好的 git 專案，不用再 `git init`。）

### 2. 等它自動打包（約 15～25 分鐘）

上傳後到 repo 的 **Actions** 分頁，會看到「打包 Android APK」正在跑。
綠色勾勾＝完成，紅色叉叉＝失敗（點進去，把紅色那一步的畫面截圖給 Claude）。

### 3. 下載安裝

到 repo 右邊的 **Releases** → 最新那一版 → 點 `KidPhotoFinder-1.0.x.apk` 下載。
- 用 Android 手機直接開這一頁下載最方便（私人 repo 要先在手機瀏覽器登入 GitHub）。
- 第一次安裝會問「允許安裝不明來源的應用程式」，允許就可以。
- Release 頁面也會顯示 **SHA-1 簽章指紋**，下一步會用到。

### 4. Google 登入設定（只要做一次）

在 https://console.cloud.google.com ：
1. 建專案 → 「API 和服務 → 程式庫」啟用 **Google Drive API**
2. 「OAuth 同意畫面」：外部、App 名稱「幼稚園照片小幫手」、範圍加 `.../auth/drive.readonly`，
   然後按 **「發布應用程式」改成正式版**（不然登入 7 天就失效，每天自動掃描會停）
3. 「憑證 → 建立憑證 → OAuth 用戶端 ID」：
   - **Android**：套件名稱 `tw.kidphotofinder.app`，SHA-1 貼 Release 頁面上的那串
   - **網頁應用程式**：名稱隨意，其他不用填
4. 回 GitHub，打開 `google-config.json` → 右上角鉛筆 ✏️ → 把網頁應用程式的用戶端 ID 貼到 `webClientId` → Commit。
   （會自動再打包一次；Android 登入主要靠第 3 步的 Android 用戶端，這步是讓設定完整。）

Google 設定改完要等幾分鐘才生效。登入時看到「Google 尚未驗證這個應用程式」→ 按「進階 → 前往」即可（這是你自己的 App）。

### 之後要更新

改了程式就 `git add . && git commit -m "更新" && git push`，或直接在 GitHub 網頁上改檔案。
每次都會自動打包新版，下載安裝就會覆蓋更新，App 裡的資料會保留。
也可以在 Actions 分頁選「打包 Android APK」→「Run workflow」手動重新打包。

---

## 進階（可以略過）：用自己的簽章

預設用 Expo 範本附的固定簽章，自己安裝使用沒問題。想換成自己的簽章：

```
keytool -genkeypair -v -keystore my.keystore -alias kidphoto -keyalg RSA -keysize 2048 -validity 10000
```

把 `my.keystore` 轉成 base64（PowerShell：`[Convert]::ToBase64String([IO.File]::ReadAllBytes("my.keystore")) | Set-Clipboard`），
到 repo 的 Settings → Secrets and variables → Actions 新增：
`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`（kidphoto）、`ANDROID_KEY_PASSWORD`。

⚠ 換簽章後，新版**不能**覆蓋舊版，要先解除安裝（資料會清掉），Google Cloud 的 SHA-1 也要換。
`my.keystore` 和密碼要自己保管好，**不要**放進 repo。

## 注意

- 只會讀取老師的雲端硬碟，不會改動；只會新增照片到相簿，不會刪除手機裡的照片。
- Android 安裝檔只包含 64 位元（arm64），近幾年的 Android 手機都可以用。
