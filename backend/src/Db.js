/**
 * Google Sheets 資料存取。所有儲存格以純文字（@）寫入，避免電話開頭的 0 或日期被自動轉換。
 */

let ssCache_ = null;

function ss_() {
  if (!ssCache_) ssCache_ = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ssCache_;
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('找不到工作表「' + name + '」，請先執行 setup');
  return sh;
}

function header_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

function cellStr_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return fmt_(v, 'yyyy-MM-dd HH:mm:ss');
  return String(v).trim();
}

/** 讀取整張工作表為物件陣列；每個物件帶 _row（試算表列號） */
function readAll_(name) {
  const values = sheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(function (h) {
    return String(h).trim();
  });
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    const o = { _row: i + 1 };
    header.forEach(function (h, j) {
      if (h) o[h] = cellStr_(row[j]);
    });
    out.push(o);
  }
  return out;
}

/** 以 '=' '+' '-' '@' 開頭的字串加上引號前綴，避免被當成公式 */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function writeRow_(sh, row, header, obj) {
  const vals = header.map(function (h) {
    return safeCell_(obj[h]);
  });
  const range = sh.getRange(row, 1, 1, header.length);
  range.setNumberFormat('@');
  range.setValues([vals]);
}

function insert_(name, obj) {
  const sh = sheet_(name);
  const header = header_(sh);
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
  writeRow_(sh, row, header, obj);
  return Object.assign({ _row: row }, obj);
}

function update_(name, obj) {
  const sh = sheet_(name);
  writeRow_(sh, obj._row, header_(sh), obj);
}

/** 由下往上刪除多列 */
function deleteRows_(name, rows) {
  const sh = sheet_(name);
  rows
    .slice()
    .sort(function (a, b) { return b - a; })
    .forEach(function (r) { sh.deleteRow(r); });
}

/** 以全域鎖執行寫入，確保同時送出時不會重複預約 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_('busy', '系統忙碌中，請稍後再試');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function newId_() {
  return Utilities.getUuid();
}

function bool_(v) {
  return ['true', '1', 'yes', 'y', '是', 'v'].indexOf(String(v).trim().toLowerCase()) >= 0;
}

function int_(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

function indexBy_(arr, key) {
  const o = {};
  arr.forEach(function (x) { o[x[key]] = x; });
  return o;
}
