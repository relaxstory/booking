/**
 * 試算表選單「Re:LAX」→「🔄 更新官網」：
 * 請 GitHub 重新建置官網（relaxstory/relaxstory.github.io），官網會重新讀取劇本目錄。
 * 官網另外每天自動更新一次，忘了按也沒關係。
 *
 * 需要的設定（只做一次）：
 *   Apps Script 編輯器 → 專案設定 → 指令碼屬性 → 新增 GITHUB_TOKEN
 *   值為 GitHub fine-grained token：只限 repo relaxstory/relaxstory.github.io、權限 Actions：Read and write。
 *   權杖只存在指令碼屬性，不可寫進程式碼（本 repo 是公開的）。
 */

const SITE_REPO_ = 'relaxstory/relaxstory.github.io';
const SITE_WORKFLOW_ = 'deploy.yml';

/** 開啟試算表時加入選單（簡單觸發器） */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Re:LAX')
    .addItem('🔄 更新官網', 'publishSite')
    .addToUi();
}

/** 觸發官網重新部署 */
function publishSite() {
  const ui = SpreadsheetApp.getUi();
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    ui.alert('尚未設定 GITHUB_TOKEN', '請到 Apps Script 編輯器 → 專案設定 → 指令碼屬性，新增 GITHUB_TOKEN（說明見 Site.js 開頭）。', ui.ButtonSet.OK);
    return;
  }
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + SITE_REPO_ + '/actions/workflows/' + SITE_WORKFLOW_ + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 204) {
    SpreadsheetApp.getActive().toast('官網將在 1–3 分鐘內更新。', '已送出更新', 8);
  } else {
    ui.alert('更新失敗（HTTP ' + code + '）', '請確認 GITHUB_TOKEN 是否有效、權限是否包含 Actions：Read and write。\n\n' + res.getContentText().slice(0, 300), ui.ButtonSet.OK);
  }
}
