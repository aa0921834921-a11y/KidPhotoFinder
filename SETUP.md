# iPhone 版打包步驟（Expo EAS）

> Android 版請看 README.md，用 GitHub 自動打包，不需要這份文件。

不需要 Mac，全部在電腦的瀏覽器 + 命令提示字元完成。程式在雲端（Expo EAS）打包。

## 0. 先準備
- 電腦裝 Node.js 20 以上（https://nodejs.org，選 LTS）
- 註冊 Expo 帳號（免費）：https://expo.dev/signup
- iPhone 需要 Apple Developer 帳號（年費 US$99，已說明過申請方式）；Android 不需要

## 1. 解壓縮、安裝套件
在解壓縮後的 `KidPhotoFinderApp` 資料夾打開命令提示字元：
```
npm install --legacy-peer-deps
npx eas-cli login
npx eas-cli init        （會在 expo.dev 建立專案，問題都按 Enter）
```

## 3. Google Cloud 設定（讓 App 可以讀雲端硬碟）
1. 到 https://console.cloud.google.com 建立新專案（名稱隨意，例如 kidphoto）
2. 「API 和服務 → 程式庫」搜尋 **Google Drive API** → 啟用
3. 「OAuth 同意畫面」：使用者類型選「外部」，App 名稱填「幼稚園照片小幫手」，填自己的 Email；範圍加入 `.../auth/drive.readonly`
4. **發布狀態按「發布應用程式」改成「正式版」**（不用送審，登入時會看到「Google 尚未驗證」→ 按「進階 → 前往」即可）。
   ⚠ 如果停在「測試中」，登入每 7 天會失效，每天自動掃描就會停。
5. 「憑證 → 建立憑證 → OAuth 用戶端 ID」建立三個：
   - **iOS**：軟體包 ID 填 `tw.kidphotofinder.app`
   - **Android**：（GitHub 打包的 Android 版，SHA-1 看 GitHub Release 頁面）
   - **網頁應用程式**：名稱隨意，其他不用填
6. 把 iOS 和「網頁應用程式」的用戶端 ID 貼進 `google-config.json`

## 4. 打包
iPhone（會要你登入 Apple 帳號，自動處理憑證）：
```
npx eas-cli build -p ios --profile ios
npx eas-cli submit -p ios --latest
```
送出後到 https://appstoreconnect.apple.com → 你的 App → TestFlight，把自己加為內部測試員，iPhone 安裝 **TestFlight** App 就能安裝。（不用上架審核）

## 5. 第一次打開
App 會帶你做 5 步：下載辨識模型（約 174MB，請連 Wi-Fi）→ Google 登入 → 選老師資料夾 → 挑 5～15 張孩子照片 → 允許存相簿與通知。

## 小提醒
- **自動找新照片**：Android 大約每 15／30／60 分鐘（「設定 → 新照片通知」裡選）在背景看一次老師的資料夾；把電池設成「不限制」會比較準時。iPhone 由系統決定什麼時候跑，請確認「設定 → 一般 → 背景 App 重新整理」有開，而且不要從多工畫面把 App 滑掉。
- **新照片通知**：晚上（預設 21:00～7:00）找到的照片不會吵你，早上一次通知；「設定 → 新照片通知」可以改時段、隱藏鎖定畫面上的照片、傳一則範例通知看看。
- 第一次照片很多時，建議打開 App 按「立即找新照片」，放著充電讓它跑完；可以切到別的 App。
- App 只會「新增」照片到相簿，不會刪除手機裡任何照片。
- 改了程式要更新：重新執行第 4 步的打包指令即可，資料會保留。
