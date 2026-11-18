// 對正式部署的後端做冒煙測試（會寫入 TEST- 開頭的測試資料，結束後請在編輯器執行 purgeTestData）。
// 用法：node tools/smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', '.env');
const API = /VITE_API_URL=(\S+)/.exec(fs.readFileSync(envFile, 'utf8'))[1];

const get = async (params) => (await fetch(`${API}?${new URLSearchParams(params)}`)).json();
const post = async (body) =>
  (await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })).json();

let failed = 0;
function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  if (!cond) failed++;
}

const person = (n, over = {}) => ({
  name: `TEST-smoke-${n}`, nickname: `測試${n}`, phone: '0900000000', email: `smoke${n}-${Date.now()}@example.com`,
  line_id: 'smoke', ig: '', note: '', count: 6, male: 3, female: 3, ...over,
});

const ping = await get({ action: 'ping' });
check('ping', ping.ok, ping);

const scripts = await get({ action: 'scripts' });
check('scripts', scripts.ok && scripts.scripts.length >= 1, scripts);
const rules = scripts.rules;
const script = scripts.scripts.find((s) => s.players === 6) || scripts.scripts[0];
const full = { count: script.players, male: script.players, female: 0 };

// 用可預約範圍最後一天，避免和真實預約衝突
const date = rules.max_date;
const range = { action: 'schedule', from: date, to: date };
const before = await get(range);
check('schedule', before.ok, before);
const free = before.ok && before.blocks.length === 0;

const bad = await post({ action: 'book', script_id: script.id, date, start: '09:00', ...person(1, { ...full, male: 0, female: 0 }) });
check('gender_mismatch 被拒', bad.error === 'gender_mismatch', bad);

const bot = await post({ action: 'book', script_id: script.id, date, start: '09:00', website: 'x', ...person(2, full) });
check('honeypot 回傳 received', bot.status === 'received', bot);

if (free) {
  const p = await post({ action: 'book', script_id: script.id, date, start: '09:00', ...person(3, full) });
  check('包場 → pending', p.status === 'pending', p);
  const c = await post({ action: 'book', script_id: script.id, date, start: '09:30', ...person(4, full) });
  check('重疊 → conflict', c.error === 'conflict', c);
  const g = await post({ action: 'book', script_id: script.id, date, start: '19:00', ...person(5, { count: 1, male: 1, female: 0 }) });
  check('人數不足 → group_pending', g.status === 'group_pending', g);
  const after = await get(range);
  const mine = after.blocks.filter((b) => b.start_at === `${date} 09:00`);
  check('時間表顯示待確認、不含個資', mine.length === 1 && mine[0].status === 'pending' && !JSON.stringify(after).includes('TEST-smoke'), after);
} else {
  console.log(`SKIP  ${date} 已有資料，略過寫入測試`);
}

console.log(failed ? `\n${failed} 項失敗` : '\n全部通過');
process.exit(failed ? 1 : 0);
