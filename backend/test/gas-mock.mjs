// 在 Node 中以記憶體模擬 Apps Script 環境，載入 backend/src 的所有 .js 檔進行測試。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

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

class MockSpreadsheet {
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

function formatDate(date, tz, pattern) {
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

/** 建立一個全新的模擬環境；now 為 ISO 字串（含時區） */
export function createGas(now) {
  const ss = new MockSpreadsheet();
  const cache = new Map();
  let current = new Date(now);
  const ctx = {
    console,
    SpreadsheetApp: { openById: () => ss },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, String(v)),
      }),
    },
    Utilities: { formatDate, getUuid: () => crypto.randomUUID() },
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
  };
  vm.createContext(ctx);
  const src = fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8'))
    .join('\n;\n');
  vm.runInContext(src, ctx);
  ctx.now_ = () => new Date(current);

  return {
    ss,
    setNow(iso) {
      current = new Date(iso);
    },
    clearRateLimit() {
      cache.clear();
    },
    /** 在模擬環境內執行程式碼（可使用所有後端函式） */
    run(code) {
      return vm.runInContext(code, ctx);
    },
    get(params) {
      return JSON.parse(ctx.doGet({ parameter: params }).getContent());
    },
    post(body) {
      return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
    },
    rows(sheet) {
      return JSON.parse(vm.runInContext(`JSON.stringify(readAll_(${JSON.stringify(sheet)}))`, ctx));
    },
  };
}
