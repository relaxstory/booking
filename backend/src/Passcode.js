/** 一次性通關碼（產生後 7 天內有效） */

const PASSCODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆的 0 O 1 I
const PASSCODE_LENGTH = 8;

function normalizePasscode_(v) {
  return String(v || '').replace(/[\s-]/g, '').toUpperCase();
}

function generatePasscode_() {
  return withLock_(function () {
    const existing = {};
    readAll_('passcodes').forEach(function (r) { existing[r.code] = true; });
    let code;
    do {
      code = '';
      for (let i = 0; i < PASSCODE_LENGTH; i++) {
        code += PASSCODE_ALPHABET.charAt(Math.floor(Math.random() * PASSCODE_ALPHABET.length));
      }
    } while (existing[code]);
    const created = now_();
    const expires = new Date(created.getTime() + RULES.passcodeDays * 86400000);
    const row = {
      code: code,
      created_at: fmt_(created, 'yyyy-MM-dd HH:mm:ss'),
      expires_at: fmt_(expires, 'yyyy-MM-dd HH:mm:ss'),
      used_at: '',
      session_id: '',
    };
    insert_('passcodes', row);
    return { code: code, expires_at: row.expires_at };
  });
}

/** 找出可使用的通關碼；無效、已使用或已過期則丟出錯誤（須在鎖內呼叫） */
function findUsablePasscode_(code) {
  const row = readAll_('passcodes').filter(function (r) { return r.code === code; })[0];
  if (!row || row.used_at || row.expires_at <= nowStr_()) {
    fail_('passcode_invalid', '通關碼無效、已使用或已過期', { field: 'passcode' });
  }
  return row;
}

function consumePasscode_(row, sessionId) {
  row.used_at = nowStr_();
  row.session_id = sessionId;
  update_('passcodes', row);
}

/** 於 Apps Script 編輯器手動執行：產生一組通關碼（後台完成前使用） */
function createPasscode() {
  const r = generatePasscode_();
  Logger.log('通關碼：' + r.code + '（有效至 ' + r.expires_at + '）');
  return r;
}
