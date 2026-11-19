# Re:LAX Story Lab schedule — 開發計畫

> 依據：[spec.md](spec.md)　最後更新：2026-11-18

## 1. 技術選擇

| 部分 | 選擇 | 說明 |
|------|------|------|
| 前端 | Vite + TypeScript（不使用大型框架） | 頁面少、時間表為自訂繪製，保持輕量 |
| 前端部署 | GitHub Actions → GitHub Pages | push 到 main 自動建置與部署 |
| 後端 | Google Apps Script（網頁應用程式） | 以 clasp 於本機開發並納入 git；以擁有者身分執行，前端無法直接碰觸 Sheet |
| 資料 | Google Sheets | 工作表：scripts、sessions、participants、closures、passcodes、admins |
| 後台登入 | Google Identity Services | 前端取得 ID token → 後端驗證 token 並比對 admins 名單 |
| 通知 | Apps Script `MailApp` + 時間觸發器 | 前一日提醒、半年個資清除 |
| 時區 | Asia/Taipei | 前後端一律以台北時間計算 |

帳號：
- GitHub：`relaxstory`
- Google（Sheet、Apps Script、通知信寄件人）：`kaclarpgm`

## 2. 專案結構（預定）

```
relax-story-lab-schedule/
├── docs/          規格、計畫
├── frontend/      Vite 專案（前台 + 後台頁面）
├── backend/       Apps Script 原始碼（clasp）
└── .github/workflows/deploy.yml
```

開發開始時移除早期的占位檔 `schedule.md`、`data/schedule.csv`，並更新 README。

## 3. 階段

### 階段 0：環境建置 ✅（2026-11-18 完成）

- Google Sheet：https://drive.google.com/open?id=1YApuRxavmAeYQuqVdBzMhsZwEjTBzAMJg1BuVnwKuQk
- Apps Script：https://script.google.com/d/1Ja6cF19jMy0IdD_gIAvHGdtQrd-zAhBA1W8PQjdBnHgecNMYSVpAqBJ4/edit
- 網頁應用程式部署 ID：`AKfycbyy32l2fuZzhnNkTf6Fn8Xz0shdCUTGDxpIsEinp0Q2gsn9zvRJS9Vsm1H3F_mcwIdpNw`（更新後端時沿用此部署，網址不變）

- `git init`、設定 repo 層級的 user.name／email（GitHub noreply 信箱）。
- 在 GitHub 建立公開 repo `relaxstory/relaxstory.github.io`，設定 Pages 由 Actions 部署。
- 建立 Google Sheet 與綁定的 Apps Script 專案，clasp 連結到 `backend/`。
- 前端空白頁部署成功，確認網址可開啟。

**完成標準**：push 後網站自動更新；`clasp push` 可更新後端。

### 階段 1：後端核心 ✅（2026-11-18 完成）

- 本機測試：`cd backend; npm test`（以記憶體模擬 Apps Script，18 項）
- 正式環境冒煙測試：`npm run smoke`（寫入 TEST- 資料，之後於編輯器執行 `purgeTestData`）
- 更新後端：`npx clasp push --force`，再 `npx clasp update-deployment <部署 ID>`（網址不變）

- 初始化工作表與欄位（一次性 setup 函式）。
- 公開 API：取得上架劇本、取得某期間時間表（僅公開欄位）。
- 包場／拼團登記：欄位與男女人數檢查、日期範圍（明天～本月+6 個月月底）、開場時間 09:00–19:00 半點、衝突檢查（LockService）、通關碼驗證（一次性、7 天）。
- 申請加入拼場。
- 防灌單：honeypot、同 Email 頻率限制。

**完成標準**：以測試資料呼叫 API，各種合法與錯誤情境結果正確。

### 階段 2：前台 ✅（2026-11-18 完成）

- 本機測試：`cd frontend; npm test`（時間軸切分、可選時段、文字格式，8 項）
- 本機預覽：`npm run dev`，網址加 `?mock` 使用假資料（不會打包進正式網站）
- 店家資訊（聯繫管道、隱私權聯絡窗口）在 `frontend/src/site.ts`，上線前替換

- 時間表（日／週切換、區塊長度依時長、各狀態樣式、拼場人數與男女缺額）。
- 包場／拼團登記表單（即時檢查）與結果頁。
- 申請加入拼場表單。
- 隱私權聲明頁。
- 手機版面優先。

**完成標準**：玩家可在手機上完成瀏覽、登記、申請加入。

### 階段 3：後台 ✅（2026-11-19 完成）

- 網址：`https://relaxstory.github.io/booking/admin.html`（獨立頁面，前台不含後台程式碼）
- 登入：Google Identity Services 取得 ID token → 後端以 tokeninfo 驗證（aud、iss、email_verified、exp）並比對 admins → 發給 6 小時有效的後台憑證（CacheService）
- 本機測試：`cd backend; npm test`（新增後台 11 項，共 29 項）
- 本機預覽：`npm run dev` 後開 `/admin.html?mock`——瀏覽器內直接執行 `backend/src` 的後端程式碼與模擬試算表，按「模擬登入」即可操作（重新整理會重設資料）
- OAuth 用戶端 ID 在 `backend/src/Config.js` 的 `GOOGLE_CLIENT_ID` 與 `frontend/.env` 的 `VITE_GOOGLE_CLIENT_ID`（兩者需相同）；新增「連線至外部服務」權限後需於編輯器執行一次 `authorize`
- OAuth 同意畫面維持「測試中」：新增管理員時，除了寫入 admins 工作表，也要加到 Google Cloud Console 的「測試使用者」

- Google 登入、admins 名單驗證。
- 時間表檢視（週／月）。
- 待確認清單（含拼團待確認的衝突標示）：確認／拒絕。
- 預約管理：新增、修改時間或劇本、取消。
- 拼場管理：參與者新增／移除、核准／拒絕申請、調整人數、成團或拼團失敗。
- 關閉時段、通關碼產生、劇本上下架開關。

**完成標準**：spec 第 6 節所有功能可操作。

### 階段 4：通知與排程（開發完成，待於編輯器安裝排程並確認範例信）

- 信件範本與收件者：`backend/src/Notify.js`；排程：`backend/src/Jobs.js`
- 店家資訊（信件署名、聯繫管道）在 `backend/src/Config.js` 的 `SHOP`；`contact` 留空時信中請玩家直接回覆此信
- 本機測試：`cd backend; npm test`（新增通知與排程 8 項，共 37 項）
- 編輯器一次性操作：執行 `installTriggers`（授權寄信與觸發器權限、補齊 `reminded_at` 欄位、安裝每天 10:00 提醒與 03:00 個資清除）；執行 `sendTestEmails` 把 12 種通知的範例信寄到自己信箱
- 提醒只寄「已預約」的場次；隔天開場但仍在招募中的拼場不寄
- example.com、.test 等測試用網域不會實際寄出（冒煙測試不耗用寄信額度）

- 各狀態變更的 Email 範本（spec 第 7 節）。
- 前一日提醒觸發器。
- 半年個資清除觸發器。

**完成標準**：每種通知實際寄到測試信箱；清除程序以測試資料驗證。

### 階段 5：測試與上線
- 匯入正式劇本資料、填入店家資訊。
- 手機／電腦實測完整流程。
- 清除測試資料，正式公開網址。

### 之後（非本次範圍）
- LINE 官方帳號圖文選單連結至網站。
- 視需要以 LIFF 取得 LINE 身分、改用 LINE 通知。

## 4. 需要使用者處理的事項

| 時機 | 事項 |
|------|------|
| 階段 0 | 第一次 push 時於瀏覽器登入 GitHub 授權；`clasp login` 以 Google 帳號授權 |
| 階段 3 前 | 於 Google Cloud Console 建立 OAuth 用戶端 ID ✅ |
| 階段 5 前 | 劇本清單、店名、官方聯繫管道、隱私權聯絡窗口 |

## 5. 網址

- GitHub repo：`relaxstory/booking`（2026-11-19 由 `relaxstory/relaxstory.github.io` 改名）
- 網站網址：`https://relaxstory.github.io/booking/`（Vite `base` 設為 `/booking/`）
- 根網址 `https://relaxstory.github.io/` 為官網（repo `relaxstory/relaxstory.github.io`），兩者同網域，Google 登入的「已授權的 JavaScript 來源」不需變更。
- 本機資料夾仍為 meta repo 下的 `relax-story-lab-schedule/`（資料夾名稱與 repo 名稱不同不影響運作）。
