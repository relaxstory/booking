/**
 * 於 Apps Script 編輯器手動執行的維護函式。
 */

/**
 * 確認專案需要的所有權限都已授權；授權畫面可逐項勾選，少勾時這裡會中止並要求重新授權（請勾選「全選」）。
 */
function requireAllScopes_() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
}

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
  requireAllScopes_();
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', { muteHttpExceptions: true });
  Logger.log('授權完成');
}

/**
 * 把每一種通知信各寄一封範例到自己的信箱（使用假資料，不寫入試算表），用來確認信件內容。
 * 會使用 12 封的每日寄信額度。
 */
function sendTestEmails() {
  requireAllScopes_();
  const me = Session.getEffectiveUser().getEmail();
  const script = { id: 's-demo', name: '範例劇本・六人本', players: 6, duration_min: 240 };
  const host = { name: '測試主揪', nickname: '主揪', email: me, is_host: 'TRUE', status: 'joined', count: 2, male: 1, female: 1 };
  const guest = { name: '測試玩家', nickname: '玩家', email: me, is_host: 'FALSE', status: 'joined', count: 2, male: 1, female: 1 };
  const day = dayNum_(todayStr_()) + 1;
  const at = function (d, hm) { return dayStr_(d) + ' ' + hm; };
  const privateSession = { type: 'private', status: 'confirmed', start_at: at(day, '14:00'), end_at: at(day, '18:00') };
  const groupSession = { type: 'group', status: 'recruiting', start_at: at(day + 2, '19:00'), end_at: at(day + 2, '23:00') };
  const full = Object.assign({}, host, { count: 6, male: 3, female: 3 });
  const cases = [
    ['booking_confirmed', { session: privateSession, participants: [full] }],
    ['booking_rejected', { session: Object.assign({}, privateSession, { status: 'rejected' }), participants: [full] }],
    ['session_changed', { session: privateSession, participants: [full], previous: { start_at: at(day, '13:00'), end_at: at(day, '17:00') } }],
    ['booking_cancelled', { session: Object.assign({}, privateSession, { status: 'cancelled' }), participants: [full] }],
    ['reminder', { session: privateSession, participants: [full] }],
    ['group_opened', { session: groupSession, participants: [host] }],
    ['join_applied', { session: groupSession, participants: [host], participant: Object.assign({}, guest, { status: 'applied' }) }],
    ['application_approved', { session: groupSession, participants: [host, guest], participant: guest }],
    ['application_rejected', { session: groupSession, participants: [host], participant: Object.assign({}, guest, { status: 'rejected' }) }],
    ['participant_added', { session: groupSession, participants: [host, guest], participant: guest }],
    ['group_formed', { session: Object.assign({}, groupSession, { status: 'confirmed' }), participants: [host] }],
    ['group_failed', { session: Object.assign({}, groupSession, { status: 'cancelled' }), participants: [host] }],
  ];
  let sent = 0;
  cases.forEach(function (c) {
    const data = Object.assign({ script: script }, c[1]);
    const mail = buildMail_(c[0], data, data.participant || data.participants[0]);
    if (sendMail_(me, { subject: '[範例 ' + c[0] + '] ' + mail.subject, body: mail.body })) sent++;
  });
  Logger.log('已寄出 ' + sent + ' 封範例信到 ' + me);
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
