# Re:LAX Story Lab schedule

Re:LAX Story Lab 劇本殺場次預約網站。

- 網站：https://relaxstory.github.io/
- 規格：[docs/spec.md](docs/spec.md)
- 開發計畫：[docs/plan.md](docs/plan.md)

## 結構

```
├── docs/                      規格、計畫
├── frontend/                  前台 + 後台網頁（Vite + TypeScript）→ GitHub Pages
├── backend/                   後端（Google Apps Script，以 clasp 管理）
└── .github/workflows/         自動部署
```

## 開發

前端：

```bash
cd frontend
npm install
npm run dev      # 本機預覽
npm run build    # 建置到 frontend/dist
```

後端：

```bash
cd backend
npm install
npm test         # 本機測試（不需網路）
npx clasp login  # 第一次使用時，以 Google 帳號授權
npx clasp push --force                               # 上傳 backend/src 到 Apps Script
npx clasp update-deployment <部署 ID>                # 更新正式網址指向的版本（ID 見 docs/plan.md）
npm run smoke    # 對正式後端做冒煙測試（之後於編輯器執行 purgeTestData）
```

編輯器可手動執行的函式：`setup`（建立／補齊工作表）、`createPasscode`（產生通關碼）、`purgeTestData`（刪除 TEST- 測試資料）。

## 部署

- 前端：push 到 `main` 後，GitHub Actions 自動建置並部署到 GitHub Pages。
- 後端：`npx clasp push` 後，於 Apps Script 編輯器更新網頁應用程式部署版本。
