// Apps Script 的所有 .js 檔共用同一個全域範圍：同名函式／常數會互相覆蓋且不會報錯。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

test('backend/src 沒有重複的全域函式或常數名稱', () => {
  const seen = new Map();
  const dups = [];
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const m of src.matchAll(/^(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) {
      if (seen.has(m[1])) dups.push(`${m[1]}（${seen.get(m[1])}、${f}）`);
      else seen.set(m[1], f);
    }
  }
  assert.deepEqual(dups, []);
});
