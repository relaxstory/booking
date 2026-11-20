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

  Logger.log('setup 完成（劇本請執行 importOfficialScripts 匯入）');
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
  const script = { id: 's-demo', name: '測試劇本', players: 6, duration_min: 240 };
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

/**
 * 正式劇本（與官網 src/content/scripts 一致；id 使用官網網址代號）。
 * male／female 為角色配置的男女人數，用於拼場的男女缺額；角色性別不限時留空。
 * price 為每人價格，留空則前台不顯示；之後可直接在試算表填寫。
 */
const OFFICIAL_SCRIPTS_ = [
  { id: 'chutao-lianticun', name: '出逃連體村', players: 5, duration_min: 270, male: 1, female: 4 },
  { id: 'tongliu-hewu', name: '同流合屋', players: 5, duration_min: 180, male: 3, female: 2 },
  { id: 'yaomo-guiguai', name: '妖魔鬼怪', players: 5, duration_min: 180, male: 3, female: 2 },
  { id: 'zuolao-chaonengzhe', name: '坐牢の超能者殺人日常', players: 5, duration_min: 150, male: 5, female: 0 },
  { id: 'diesu', name: '蝶溯', players: 5, duration_min: 210, male: 2, female: 3 },
  { id: 'half-world-deduction', name: '1/2世界推理法則', players: 6, duration_min: 420, male: '', female: '' },
];

/**
 * 匯入正式劇本（可重複執行）：
 *   - 已存在的劇本（同 id）更新名稱、人數、時長、男女人數，保留價格與上下架狀態
 *   - 不存在的新增為上架
 */
function importOfficialScripts() {
  withLock_(function () {
    const existing = indexBy_(readAll_('scripts'), 'id');
    OFFICIAL_SCRIPTS_.forEach(function (s) {
      const row = existing[s.id];
      if (row) {
        update_('scripts', Object.assign(row, s));
      } else {
        insert_('scripts', Object.assign({ price: '', active: 'TRUE' }, s));
      }
    });
    Logger.log('已匯入 ' + OFFICIAL_SCRIPTS_.length + ' 個正式劇本');
  });
}

/**
 * 從劇本庫刪除早期的範例劇本（id 為 s-sample-*），連同使用這些劇本的場次與其參與者（皆為測試資料）。
 * 可重複執行。
 */
function removeSampleScripts() {
  withLock_(function () {
    const isSample = function (id) { return String(id).indexOf('s-sample-') === 0; };
    const samples = readAll_('scripts').filter(function (r) { return isSample(r.id); });
    const sessions = readAll_('sessions').filter(function (s) { return isSample(s.script_id); });
    const sessionIds = {};
    sessions.forEach(function (s) { sessionIds[s.id] = true; });
    const participants = readAll_('participants').filter(function (p) { return sessionIds[p.session_id]; });
    deleteRows_('participants', participants.map(function (r) { return r._row; }));
    deleteRows_('sessions', sessions.map(function (r) { return r._row; }));
    deleteRows_('scripts', samples.map(function (r) { return r._row; }));
    Logger.log('已刪除 ' + samples.length + ' 個範例劇本、' + sessions.length + ' 個使用範例劇本的場次、' + participants.length + ' 位參與者');
  });
}

/** 上線前使用：清空的工作表（劇本與管理者保留） */
const BOOKING_SHEETS_ = ['sessions', 'participants', 'closures', 'passcodes'];

/**
 * 上線前清空所有場次、參與者、關閉時段、通關碼（保留劇本與管理者），無法復原。
 * 執行後立即刪除、不會再詢問；正式上線後請勿執行。
 */
function clearAllBookings() {
  withLock_(function () {
    const counts = BOOKING_SHEETS_.map(function (name) {
      const rows = readAll_(name).map(function (r) { return r._row; });
      deleteRows_(name, rows);
      return name + ' ' + rows.length;
    });
    Logger.log('已清空：' + counts.join('、'));
  });
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

/**
 * 官網劇本目錄欄位的初始資料（2026-11-20 從官網搬入試算表）。
 * 之後以試算表為準，官網會從 GET ?action=catalog 讀取。
 */
const SITE_CATALOG_ = [
  { id: 'chutao-lianticun', site_status: '上架中', featured: 'TRUE', sort_order: '1', badge: '新上架', tagline: '沒想到在推理本有戀陪吧', genres: '推理/還原/戀陪', gender_advice: '1女1男', series: '', adapted: 'TRUE', hosts: 'kaike' },
  { id: 'tongliu-hewu', site_status: '上架中', featured: 'FALSE', sort_order: '2', badge: '新上架', tagline: '玩完之後有東西回不去了', genres: '還原/歡樂/吃瓜', gender_advice: '不限', series: '牛鬼蛇神系列', adapted: 'TRUE', hosts: 'kaike' },
  { id: 'yaomo-guiguai', site_status: '上架中', featured: 'FALSE', sort_order: '3', badge: '新上架', tagline: '丹丹好吃', genres: '還原/歡樂/吃瓜', gender_advice: '不限', series: '牛鬼蛇神系列', adapted: 'TRUE', hosts: 'kaike' },
  { id: 'zuolao-chaonengzhe', site_status: '上架中', featured: 'FALSE', sort_order: '4', badge: '', tagline: '超能力當然是用來殺人呀', genres: '推理/歡樂/中二', gender_advice: '不限', series: '超能宇宙系列', adapted: 'FALSE', hosts: 'kaike' },
  {
    id: 'diesu', site_status: '上架中', featured: 'TRUE', sort_order: '5', badge: '', tagline: '交錯的人生，但只愛你一人', genres: '推理/還原/沉浸', gender_advice: '3女2男', series: '', adapted: 'FALSE', hosts: 'kaike',
    crossplay: 'TRUE', author: '小游《請將我深埋》', features: '強設定推理/平行時空', suits: '喜歡設定推理/還原時間線', experience: '新手可', reading_load: '6000字／共同資訊多',
    description: [
      '如何殺死一個死亡回溯者？',
      '死後可以復活，還能在平行時空裡穿梭，「不是我喜歡的世界，那創造下一個。」',
      '百年一遇的日全食突然出現，在那之後，世界似乎變得有些奇怪。',
      '我的愛人把我當陌生人？\n這裡有長得一模一樣的人？\n我看見了已死之人？',
      '故事要從一場「血色婚禮」說起：新郎與新娘剛剛舉辦完婚禮，新娘就被人謀殺……',
      '在無窮無盡的人生分支裡，總有一個你，一生幸福。',
    ].join('\n\n'),
    curator_note: '平行時空的設定雖然已經在許多故事中被使用了，但這種命運的交錯感依然讓人難忘呢……',
  },
  { id: 'half-world-deduction', site_status: '上架中', featured: 'TRUE', sort_order: '6', badge: '熱門', tagline: '有瓜吃瓜，邊推邊吃', genres: '推理/建築/城限', gender_advice: '不限', series: '', adapted: 'FALSE', hosts: 'kaike' },
];

/**
 * 把官網的劇本資料填入試算表的官網欄位（可重複執行）。
 * 只填「空白」的儲存格，已經在試算表改過的內容不會被覆蓋。
 * 執行前請先執行 setup() 補齊欄位。
 */
function importSiteCatalog() {
  withLock_(function () {
    const existing = indexBy_(readAll_('scripts'), 'id');
    let filled = 0;
    const missing = [];
    SITE_CATALOG_.forEach(function (c) {
      const row = existing[c.id];
      if (!row) { missing.push(c.id); return; }
      let changed = false;
      Object.keys(c).forEach(function (k) {
        if (k === 'id') return;
        if (String(row[k] === undefined || row[k] === null ? '' : row[k]).trim() === '' && c[k] !== '') {
          row[k] = c[k];
          changed = true;
        }
      });
      if (changed) { update_('scripts', row); filled++; }
    });
    Logger.log('已填入 ' + filled + ' 個劇本的官網欄位' + (missing.length ? '；試算表找不到：' + missing.join(', ') + '（請先執行 importOfficialScripts）' : ''));
  });
}
