import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

let gas;

beforeEach(() => {
  gas = createGas('2026-11-18T10:00:00+08:00');
  gas.setup(); // 含測試用範例劇本 s-sample-1～3
});

const book = (over = {}) => {
  gas.clearRateLimit();
  return gas.post({
    action: 'book', script_id: 's-sample-1', date: '2026-11-20', start: '14:00',
    name: 'TEST-客人', nickname: '暱稱', phone: '0912345678', email: 'a@example.com', line_id: 'line', ig: '', note: '',
    count: 6, male: 3, female: 3, ...over,
  });
};

const OFFICIAL = ['chutao-lianticun', 'tongliu-hewu', 'yaomo-guiguai', 'zuolao-chaonengzhe', 'diesu', 'half-world-deduction'];

test('setup 不會建立任何劇本', () => {
  const g = createGas('2026-11-18T10:00:00+08:00');
  g.run('setup()');
  assert.equal(g.rows('scripts').length, 0);
});

test('importOfficialScripts：匯入 6 本正式劇本，可重複執行並保留價格與上下架', () => {
  gas.run('importOfficialScripts()');
  assert.deepEqual(gas.rows('scripts').map((r) => r.id).slice(3), OFFICIAL);

  // 前台：男女不限的劇本 male／female 為 null，價格未填為 null
  const pub = gas.get({ action: 'scripts' }).scripts;
  assert.deepEqual(pub.find((s) => s.id === 'half-world-deduction'), {
    id: 'half-world-deduction', name: '1/2世界推理法則', players: 6, duration_min: 420, male: null, female: null, price: null,
  });
  assert.equal(pub.find((s) => s.id === 'zuolao-chaonengzhe').female, 0);

  gas.run(`(function(){ const r = readAll_('scripts').filter(function (x) { return x.id === 'diesu'; })[0]; r.price = '650'; r.active = 'FALSE'; update_('scripts', r); })()`);
  gas.run('importOfficialScripts()');
  const rows = gas.rows('scripts');
  assert.equal(rows.length, 9);
  const d = rows.find((r) => r.id === 'diesu');
  assert.deepEqual([d.price, d.active, d.duration_min], ['650', 'FALSE', '210']);
});

test('removeSampleScripts：刪除範例劇本及使用它們的場次與參與者，其他資料保留', () => {
  gas.run('importOfficialScripts()');
  const a = book(); // 使用範例劇本
  const b = book({ script_id: 'tongliu-hewu', date: '2026-11-21', count: 5, male: 3, female: 2 }); // 正式劇本
  assert.equal(b.ok, true, JSON.stringify(b));

  gas.run('removeSampleScripts()');
  assert.deepEqual(gas.rows('scripts').map((r) => r.id), OFFICIAL);
  assert.deepEqual(gas.rows('sessions').map((s) => s.id), [b.session_id]);
  assert.ok(gas.rows('participants').every((p) => p.session_id === b.session_id));
  assert.ok(!gas.rows('sessions').some((s) => s.id === a.session_id));

  gas.run('removeSampleScripts()'); // 可重複執行
  assert.equal(gas.rows('scripts').length, 6);
});

test('clearAllBookings：清空場次、參與者、關閉時段、通關碼，保留劇本與管理者', () => {
  book();
  gas.run(`insert_('closures', { id: 'c1', start_at: '2026-11-21 09:00', end_at: '2026-11-21 12:00', note: '', created_at: '' })`);
  gas.run(`insert_('passcodes', { code: 'ABCDEFGH', created_at: '', expires_at: '', used_at: '', session_id: '' })`);
  gas.run('clearAllBookings()');
  for (const s of ['sessions', 'participants', 'closures', 'passcodes']) assert.equal(gas.rows(s).length, 0, s);
  assert.equal(gas.rows('scripts').length, 3);
  assert.equal(gas.rows('admins').length, 1);
  assert.equal(book().ok, true);
});
