// Apps Script 服務的記憶體模擬（不依賴 Node 模組，Node 測試與前端開發用 mock 共用）。

class MockRange {
  constructor(sheet, row, col, nr, nc) {
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const r = [];
      for (let j = 0; j < this.nc; j++) r.push(this.sheet.get(this.row + i, this.col + j));
      out.push(r);
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((r, i) => r.forEach((v, j) => this.sheet.set(this.row + i, this.col + j, v)));
    return this;
  }
  setNumberFormat() {
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.maxRows = 1000;
  }
  getName() {
    return this.name;
  }
  set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    // 試算表會把引號前綴當成「強制文字」，讀回時不含引號
    row[c - 1] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
  }
  get(r, c) {
    const row = this.data[r - 1];
    return row && row[c - 1] !== undefined ? row[c - 1] : '';
  }
  getLastRow() {
    let n = this.data.length;
    while (n > 0 && this.data[n - 1].every((v) => v === '')) n--;
    return n;
  }
  getLastColumn() {
    let max = 0;
    for (const r of this.data) {
      let n = r.length;
      while (n > 0 && r[n - 1] === '') n--;
      max = Math.max(max, n);
    }
    return max;
  }
  getMaxRows() {
    return this.maxRows;
  }
  insertRowsAfter(_after, n) {
    this.maxRows += n;
  }
  getRange(r, c, nr = 1, nc = 1) {
    if (r + nr - 1 > this.maxRows) throw new Error('Range out of bounds');
    return new MockRange(this, r, c, nr, nc);
  }
  getDataRange() {
    return new MockRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  setFrozenRows() {}
  deleteRow(r) {
    this.data.splice(r - 1, 1);
  }
}

export class MockSpreadsheet {
  constructor() {
    this.sheets = [new MockSheet('工作表1')];
  }
  getSheetByName(n) {
    return this.sheets.find((s) => s.name === n) || null;
  }
  insertSheet(n) {
    const s = new MockSheet(n);
    this.sheets.push(s);
    return s;
  }
  getSheets() {
    return [...this.sheets];
  }
  deleteSheet(s) {
    this.sheets = this.sheets.filter((x) => x !== s);
  }
}

export function formatDate(date, tz, pattern) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return pattern
    .replace('yyyy', parts.year)
    .replace('MM', parts.month)
    .replace('dd', parts.day)
    .replace('HH', parts.hour)
    .replace('mm', parts.minute)
    .replace('ss', parts.second);
}

/** 模擬用的 OAuth 用戶端 ID；模擬的 Google ID token 為 'mock:<email>' */
export const MOCK_CLIENT_ID = 'mock-client-id';

/**
 * 建立 Apps Script 全域服務。
 * state.now()：目前時間；ID token 'mock:<email>' 視為該 Email 的有效登入。
 */
export function makeGlobals(state) {
  const cache = new Map();
  const tokeninfo = (url) => {
    const m = /[?&]id_token=([^&]*)/.exec(url);
    const token = m ? decodeURIComponent(m[1]) : '';
    if (!token.startsWith('mock:')) return { code: 400, body: { error: 'invalid_token' } };
    return {
      code: 200,
      body: {
        iss: 'https://accounts.google.com',
        aud: MOCK_CLIENT_ID,
        email: token.slice(5),
        email_verified: 'true',
        exp: String(Math.floor(state.now().getTime() / 1000) + 3600),
      },
    };
  };
  return {
    cache,
    globals: {
      console,
      SpreadsheetApp: { openById: () => state.ss },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
      CacheService: {
        getScriptCache: () => ({
          get: (k) => (cache.has(k) ? cache.get(k) : null),
          put: (k, v) => cache.set(k, String(v)),
          remove: (k) => cache.delete(k),
        }),
      },
      UrlFetchApp: {
        fetch(url) {
          const r = tokeninfo(url);
          return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) };
        },
      },
      Utilities: { formatDate, getUuid: () => globalThis.crypto.randomUUID() },
      Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
      Logger: { log() {} },
      ContentService: {
        createTextOutput(s) {
          return {
            s,
            setMimeType() {
              return this;
            },
            getContent() {
              return this.s;
            },
          };
        },
        MimeType: { JSON: 'json' },
      },
    },
  };
}

/**
 * 不使用 node:vm 載入後端原始碼（瀏覽器用）。回傳可在後端作用域內執行程式碼的函式。
 * 後端的 now_、googleClientId_ 會被替換。
 */
export function loadBackend(sources, globals, nowFn) {
  const names = Object.keys(globals);
  const body = `${sources.join('\n;\n')}
;now_ = function () { return __now(); };
googleClientId_ = function () { return ${JSON.stringify(MOCK_CLIENT_ID)}; };
return function (__code) { return eval(__code); };`;
  // eslint-disable-next-line no-new-func
  return new Function(...names, '__now', body)(...names.map((n) => globals[n]), nowFn);
}
