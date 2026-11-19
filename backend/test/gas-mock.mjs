// 在 Node 中以記憶體模擬 Apps Script 環境，載入 backend/src 的所有 .js 檔進行測試。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_CLIENT_ID, MockSpreadsheet, makeGlobals } from './gas-env.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** 測試用劇本（正式資料不含這些劇本） */
export const SAMPLE_SCRIPTS = [
  { id: 's-sample-1', name: '範例劇本・六人本', players: 6, duration_min: 240, male: 3, female: 3, price: 600, active: 'TRUE' },
  { id: 's-sample-2', name: '範例劇本・四人本', players: 4, duration_min: 180, male: 2, female: 2, price: 500, active: 'TRUE' },
  { id: 's-sample-3', name: '範例劇本・七人本（下架）', players: 7, duration_min: 300, male: 4, female: 3, price: 700, active: 'FALSE' },
];

/** 建立一個全新的模擬環境；now 為 ISO 字串（含時區） */
export function createGas(now) {
  const ss = new MockSpreadsheet();
  let current = new Date(now);
  const { cache, mails, triggers, globals } = makeGlobals({ ss, now: () => new Date(current) });
  const ctx = { ...globals };
  vm.createContext(ctx);
  const src = fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8'))
    .join('\n;\n');
  vm.runInContext(src, ctx);
  ctx.now_ = () => new Date(current);
  ctx.googleClientId_ = () => MOCK_CLIENT_ID;

  return {
    ss,
    /** 寄出的信 */
    mails,
    triggers,
    /** 執行 setup() 並加入測試用劇本 */
    setup() {
      vm.runInContext('setup()', ctx);
      vm.runInContext(`${JSON.stringify(SAMPLE_SCRIPTS)}.forEach(function (s) { insert_('scripts', s); })`, ctx);
    },
    setNow(iso) {
      current = new Date(iso);
    },
    clearRateLimit() {
      for (const k of [...cache.keys()]) if (k.startsWith('rl:')) cache.delete(k);
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
