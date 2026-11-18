// 在 Node 中以記憶體模擬 Apps Script 環境，載入 backend/src 的所有 .js 檔進行測試。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_CLIENT_ID, MockSpreadsheet, makeGlobals } from './gas-env.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** 建立一個全新的模擬環境；now 為 ISO 字串（含時區） */
export function createGas(now) {
  const ss = new MockSpreadsheet();
  let current = new Date(now);
  const { cache, globals } = makeGlobals({ ss, now: () => new Date(current) });
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
