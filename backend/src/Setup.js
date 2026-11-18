/**
 * 於 Apps Script 編輯器手動執行的維護函式。
 */

/** 建立／補齊工作表與欄位；第一次執行時會要求授權。可重複執行。 */
function setup() {
  const ss = ss_();
  Object.keys(SHEETS).forEach(function (name) {
    const cols = SHEETS[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const header = header_(sh);
    const missing = cols.filter(function (c) { return header.indexOf(c) < 0; });
    if (missing.length) {
      sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), header.length + missing.length).setNumberFormat('@');
  });

  // 移除建立試算表時的預設空白工作表
  ss.getSheets().forEach(function (sh) {
    if (!SHEETS[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  if (readAll_('admins').length === 0) {
    const me = Session.getEffectiveUser().getEmail();
    if (me) insert_('admins', { email: me, name: '店主', active: 'TRUE' });
  }

  if (readAll_('scripts').length === 0) {
    [
      { id: 's-sample-1', name: '範例劇本・六人本', players: 6, duration_min: 240, male: 3, female: 3, price: 600, active: 'TRUE' },
      { id: 's-sample-2', name: '範例劇本・四人本', players: 4, duration_min: 180, male: 2, female: 2, price: 500, active: 'TRUE' },
      { id: 's-sample-3', name: '範例劇本・七人本（下架）', players: 7, duration_min: 300, male: 4, female: 3, price: 700, active: 'FALSE' },
    ].forEach(function (s) { insert_('scripts', s); });
  }

  Logger.log('setup 完成');
}

/**
 * 新增權限後於編輯器執行一次，完成授權（後台登入需要「連線至外部服務」以向 Google 驗證登入）。
 */
function authorize() {
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', { muteHttpExceptions: true });
  Logger.log('授權完成');
}

/** 刪除測試資料：主揪姓名以「TEST-」開頭的場次及其所有參與者 */
function purgeTestData() {
  withLock_(function () {
    const participants = readAll_('participants');
    const testSessions = {};
    participants.forEach(function (p) {
      if (bool_(p.is_host) && p.name.indexOf('TEST-') === 0) testSessions[p.session_id] = true;
    });
    deleteRows_('participants', participants
      .filter(function (p) { return testSessions[p.session_id] || p.name.indexOf('TEST-') === 0; })
      .map(function (p) { return p._row; }));
    deleteRows_('sessions', readAll_('sessions')
      .filter(function (s) { return testSessions[s.id]; })
      .map(function (s) { return s._row; }));
    Logger.log('已刪除 ' + Object.keys(testSessions).length + ' 個測試場次');
  });
}
