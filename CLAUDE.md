# CLAUDE.md — 預約系統（relaxstory/booking）

Re:LAX Story Lab 劇本殺場次預約網站。規格見 `docs/spec.md`，開發計畫見 `docs/plan.md`。

## 兩個 repo 的關係

| | 預約系統（本 repo） | 官網 |
|---|---|---|
| repo | `relaxstory/booking` | `relaxstory/relaxstory.github.io` |
| 網址 | https://relaxstory.github.io/booking/（後台 `/booking/admin.html`） | https://relaxstory.github.io/ |
| 技術 | Vite + TypeScript 前端；Google Apps Script 後端；Google Sheets 資料 | Astro 靜態網站 |
| 公開 | 公開 repo（GitHub Pages 免費方案需要） | 公開 repo |

- 官網所有「預約」按鈕連到 `/booking/`（官網 `src/data/site.ts` 的 `bookingUrl`）。
- **劇本 id 兩邊共用**：Sheet `scripts` 的 `id` 與官網 `src/content/scripts/<id>.md` 檔名相同（例：`chutao-lianticun`）。新增劇本時兩邊用同一個 id。
- 外觀與官網一致（深藍 `#1b2431`、金色 `#b08e61`、米白底；Cormorant Garamond／Noto Sans TC／Noto Serif TC）。調整配色時兩邊一起看。

## 不要動

- `frontend/vite.config.ts` 的 `base: '/booking/'`（根網址屬於官網）。
- 時間表四種狀態必須一眼可分：已預約、待確認、拼團中、不開放（`--booked-*`、`--pending-*`、`--recruit-*`、`--closure-*` 變數）。
- 手機版面優先；改版面後至少檢查 390px 與 320px（iPhone SE）寬度，不可出現左右捲動。
- repo 是公開的：不得放入個資、密鑰或店家內部資訊（官方聯絡窗口只有 Instagram @kac_larpgm）。

## 在哪裡做什麼

| 工作 | 可在哪裡做 | 部署方式 |
|---|---|---|
| `frontend/`（前台、後台畫面、樣式） | 雲端或本機皆可 | push 到 `main` → GitHub Actions 自動部署 |
| `backend/`（Apps Script） | **只能在店主的電腦**（需 `clasp` 的 Google 授權） | `npx clasp push --force` → `npx clasp update-deployment <部署 ID>`（ID 見 `docs/plan.md`） |
| 編輯器函式（`setup`、`importOfficialScripts`、`importSiteCatalog`、`removeSampleScripts`、`clearAllBookings`、`purgeTestData`、`createPasscode`） | Apps Script 編輯器（需登入店主 Google 帳號） | — |

雲端工作階段若被要求改 `backend/`：可以改程式並跑本機測試，但要明確告知「需要在電腦上 `clasp push` 才會生效」，不要假裝已部署。

## 劇本目錄（官網的資料來源）

- **Sheet `scripts` 是劇本的唯一主資料**：前 8 欄供預約使用；右側欄位（`site_status`、`featured`、`sort_order`、`badge`、`tagline`、`genres`、`gender_advice`、`series`、`adapted`、`difficulty`、`hosts`、`description`）供官網使用，說明在 `backend/src/Scripts.js` 的 catalog 區段。
- 公開 API：`GET ?action=catalog`，官網在 GitHub Actions 建置時讀取。只能回傳公開欄位。
- 試算表選單「Re:LAX → 🔄 更新官網」（`backend/src/Site.js`）觸發官網重新部署；需要指令碼屬性 `GITHUB_TOKEN`（fine-grained，只限 `relaxstory/relaxstory.github.io`、Actions: Read and write）。權杖絕不寫進程式碼。
- Apps Script 所有檔案共用全域範圍：新增函式／常數前確認名稱沒被用過（`backend/test/globals.test.mjs` 會檢查）。

## 協作規則

- 開始前 `git pull`，完成後立刻 commit + push；同一時間只在一個地方改本 repo。
- 跨 repo 的功能拆開做：後端部分在電腦，前端／官網部分在任一處；用交接說明（寫在對話或 `docs/`）串接。

## 樣式位置

- `frontend/src/style.css`：前台；配色、字型、間距集中在開頭的 CSS 變數（含深色模式）。
- `frontend/src/admin/admin.css`：後台，沿用 `style.css` 變數。
- `frontend/index.html`、`frontend/admin.html`：頁面骨架、外部字型連結、favicon。
- `frontend/src/views/shell.ts`：前台頁首頁尾（官網 Logo、回官網連結）。
- `frontend/src/site.ts`：店名、官網網址、聯繫管道（Instagram @kac_larpgm）。
- `frontend/public/`：Logo、favicon（從官網複製）。

## 驗證

```bash
npm --prefix frontend test
npx --prefix frontend tsc --noEmit -p frontend
npm --prefix frontend run build
npm --prefix backend test          # 後端本機測試（不需網路）
```

本機預覽：`npm --prefix frontend run dev`，開 `/booking/?mock` 看前台、`/booking/admin.html?mock` 按「模擬登入」看後台（假資料）。

## 慣例

- 使用者介面與文件用繁體中文（台灣用語）。
- commit 訊息用英文，說明改了什麼與原因。
