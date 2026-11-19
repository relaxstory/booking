import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

let gas;

beforeEach(() => {
  gas = createGas('2026-11-18T10:00:00+08:00');
  gas.run('setup()');
});

const book = (over = {}) => {
  gas.clearRateLimit();
  return gas.post({
    action: 'book', script_id: 's-sample-1', date: '2026-11-20', start: '14:00',
    name: 'TEST-客人', nickname: '暱稱', phone: '0912345678', email: 'a@example.com', line_id: 'line', ig: '', note: '',
    count: 6, male: 3, female: 3, ...over,
  });
};

test('importOfficialScripts：匯入 6 本正式劇本，移除未使用的範例劇本，可重複執行', () => {
  book(); // s-sample-1 有場次使用
  gas.run('importOfficialScripts()');
  let rows = gas.rows('scripts');
  assert.deepEqual(rows.map((r) => [r.id, r.active]), [
    ['s-sample-1', 'FALSE'],
    ['chutao-lianticun', 'TRUE'],
    ['tongliu-hewu', 'TRUE'],
    ['yaomo-guiguai', 'TRUE'],
    ['zuolao-chaonengzhe', 'TRUE'],
    ['diesu', 'TRUE'],
    ['half-world-deduction', 'TRUE'],
  ]);

  // 前台：男女不限的劇本 male／female 為 null，價格未填為 null
  const pub = gas.get({ action: 'scripts' }).scripts;
  assert.equal(pub.length, 6);
  assert.deepEqual(pub.find((s) => s.id === 'half-world-deduction'), {
    id: 'half-world-deduction', name: '1/2世界推理法則', players: 6, duration_min: 420, male: null, female: null, price: null,
  });
  assert.deepEqual(pub.find((s) => s.id === 'zuolao-chaonengzhe').female, 0);

  // 在試算表填的價格與下架狀態，重新匯入後保留
  gas.run(`(function(){ const r = readAll_('scripts').filter(function (x) { return x.id === 'diesu'; })[0]; r.price = '650'; r.active = 'FALSE'; update_('scripts', r); })()`);
  gas.run('importOfficialScripts()');
  rows = gas.rows('scripts');
  assert.equal(rows.length, 7);
  const d = rows.find((r) => r.id === 'diesu');
  assert.deepEqual([d.price, d.active, d.duration_min], ['650', 'FALSE', '210']);
});

test('clearAllBookings：清空場次、參與者、關閉時段、通關碼，保留劇本與管理者', () => {
  book();
  gas.run(`insert_('closures', { id: 'c1', start_at: '2026-11-21 09:00', end_at: '2026-11-21 12:00', note: '', created_at: '' })`);
  gas.run(`insert_('passcodes', { code: 'ABCDEFGH', created_at: '', expires_at: '', used_at: '', session_id: '' })`);
  gas.run('clearAllBookings()');
  for (const s of ['sessions', 'participants', 'closures', 'passcodes']) assert.equal(gas.rows(s).length, 0, s);
  assert.equal(gas.rows('scripts').length, 3);
  assert.equal(gas.rows('admins').length, 1);
  // 清空後仍可正常登記
  assert.equal(book().ok, true);
});
