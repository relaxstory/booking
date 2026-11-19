import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

// 以 2026-11-18 10:00（台北）為「現在」
const NOW = '2026-11-18T10:00:00+08:00';
let gas;
let emailSeq = 0;

function person(over = {}) {
  return {
    name: 'TEST-王小明',
    nickname: '小明',
    phone: '0912345678',
    email: `p${++emailSeq}@example.com`,
    line_id: 'xiaoming',
    ig: '',
    note: '',
    count: 6,
    male: 3,
    female: 3,
    ...over,
  };
}

function book(over = {}) {
  return gas.post({ action: 'book', script_id: 's-sample-1', date: '2026-11-20', start: '14:00', ...person(), ...over });
}

function setSessionStatus(id, status) {
  gas.run(`(function(){ const s = readAll_('sessions').filter(function(x){return x.id===${JSON.stringify(id)};})[0]; s.status=${JSON.stringify(status)}; update_('sessions', s); })()`);
}

beforeEach(() => {
  gas = createGas(NOW);
  gas.setup();
});

test('setup 建立工作表與管理者（不建立劇本）', () => {
  const names = gas.ss.getSheets().map((s) => s.getName());
  assert.deepEqual(names.sort(), ['admins', 'closures', 'participants', 'passcodes', 'scripts', 'sessions']);
  assert.equal(gas.rows('admins')[0].email, 'owner@example.com');
  assert.equal(gas.rows('scripts').length, 3);
  gas.run('setup()'); // 可重複執行
  assert.equal(gas.rows('scripts').length, 3);
});

test('ping', () => {
  const r = gas.get({ action: 'ping' });
  assert.equal(r.ok, true);
  assert.equal(r.time, '2026-11-18 10:00:00');
});

test('scripts 只回傳上架劇本與預約規則', () => {
  const r = gas.get({ action: 'scripts' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.scripts.map((s) => s.id), ['s-sample-1', 's-sample-2']);
  assert.deepEqual(r.rules, { min_date: '2026-11-19', max_date: '2027-05-31', earliest_start: '09:00', latest_start: '19:00', slot_minutes: 30 });
});

test('滿人數無通關碼 → 待確認，佔時段，時間表不含個資', () => {
  const r = book();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.status, 'pending');
  assert.equal(r.start_at, '2026-11-20 14:00');
  assert.equal(r.end_at, '2026-11-20 18:00');

  const s = gas.get({ action: 'schedule', from: '2026-11-20', to: '2026-11-20' });
  assert.equal(s.blocks.length, 1);
  assert.deepEqual(s.blocks[0], { kind: 'session', type: 'private', status: 'pending', script_name: '範例劇本・六人本', start_at: '2026-11-20 14:00', end_at: '2026-11-20 18:00' });
  const json = JSON.stringify(s);
  for (const secret of ['0912345678', 'example.com', '王小明', 'xiaoming']) assert.ok(!json.includes(secret), secret);
});

test('電話開頭的 0 與以 + 開頭的值保留為文字', () => {
  book({ phone: '+886912345678' });
  assert.equal(gas.rows('participants')[0].phone, '+886912345678');
});

test('時段衝突：重疊拒絕，緊接著可預約', () => {
  assert.equal(book().ok, true);
  const overlap = book({ start: '17:30' });
  assert.equal(overlap.error, 'conflict');
  const before = book({ start: '10:00' }); // 10:00–14:00，剛好接上
  assert.equal(before.ok, true, JSON.stringify(before));
  const after = book({ start: '18:00' });
  assert.equal(after.ok, true, JSON.stringify(after));
});

test('跨午夜的場次也會檢查隔天衝突', () => {
  // 七人本下架，改用六人本 19:00 開場 → 23:00；再加一個關閉時段 23:00 起
  assert.equal(book({ start: '19:00' }).end_at, '2026-11-20 23:00');
  gas.run(`insert_('closures', { id: 'c1', start_at: '2026-11-20 22:30', end_at: '2026-11-21 10:00', note: '私事', created_at: '' })`);
  const r = book({ date: '2026-11-21', start: '09:30' });
  assert.equal(r.error, 'conflict');
  const s = gas.get({ action: 'schedule', from: '2026-11-21', to: '2026-11-21' });
  assert.deepEqual(s.blocks, [{ kind: 'closure', start_at: '2026-11-20 22:30', end_at: '2026-11-21 10:00' }]);
});

test('日期範圍：不可當天，最晚到本月 + 6 個月月底', () => {
  assert.equal(book({ date: '2026-11-18' }).error, 'date_out_of_range');
  assert.equal(book({ date: '2027-06-01' }).error, 'date_out_of_range');
  assert.equal(book({ date: '2027-05-31' }).ok, true);
  assert.equal(book({ date: '2026-11-19', start: '09:00' }).ok, true);
  assert.equal(book({ date: '2026-02-30' }).error, 'invalid_field');
});

test('開場時間：09:00–19:00 的整點或半點', () => {
  assert.equal(book({ start: '08:30' }).error, 'invalid_start');
  assert.equal(book({ start: '19:30' }).error, 'invalid_start');
  assert.equal(book({ start: '14:15' }).error, 'invalid_start');
  assert.equal(book({ start: '19:00' }).ok, true);
});

test('欄位檢查', () => {
  assert.equal(book({ male: 4, female: 3 }).error, 'gender_mismatch');
  assert.equal(book({ count: 7, male: 4, female: 3 }).error, 'count_exceeds');
  assert.equal(book({ line_id: '', ig: '' }).error, 'contact_required');
  assert.equal(book({ email: 'bad' }).error, 'invalid_field');
  assert.equal(book({ phone: '12' }).error, 'invalid_field');
  assert.equal(book({ nickname: '' }).error, 'missing_field');
  assert.equal(book({ male: '' }).error, 'missing_field');
  assert.equal(book({ script_id: 's-sample-3', count: 7, male: 4, female: 3 }).error, 'script_not_found'); // 下架
  assert.equal(book({ ig: 'xm', line_id: '' }).ok, true);
});

test('通關碼：一次性、7 天有效、僅限滿人數', () => {
  const pc = gas.run('generatePasscode_()');
  assert.match(pc.code, /^[A-HJ-NP-Z2-9]{8}$/);

  const partial = book({ count: 4, male: 2, female: 2, passcode: pc.code });
  assert.equal(partial.error, 'passcode_requires_full');

  const ok = book({ passcode: pc.code.toLowerCase() });
  assert.equal(ok.status, 'confirmed', JSON.stringify(ok));
  const used = gas.rows('passcodes')[0];
  assert.equal(used.session_id, ok.session_id);

  assert.equal(book({ date: '2026-11-21', passcode: pc.code }).error, 'passcode_invalid');
  assert.equal(book({ date: '2026-11-21', passcode: 'ZZZZZZZZ' }).error, 'passcode_invalid');

  const pc2 = gas.run('generatePasscode_()');
  gas.setNow('2026-11-25T10:00:01+08:00'); // 超過 7 天
  assert.equal(book({ date: '2026-11-28', passcode: pc2.code }).error, 'passcode_invalid');

  const s = gas.get({ action: 'schedule', from: '2026-11-20', to: '2026-11-20' });
  assert.equal(s.blocks[0].status, 'booked');
});

test('人數不足 → 拼團待確認：不佔時段、前台不顯示', () => {
  const g = book({ count: 2, male: 1, female: 1 });
  assert.equal(g.status, 'group_pending');
  assert.deepEqual(gas.get({ action: 'schedule', from: '2026-11-20', to: '2026-11-20' }).blocks, []);
  const other = book(); // 同時段仍可預約
  assert.equal(other.ok, true);
  // 已被佔用的時段不可再登記拼團
  assert.equal(book({ count: 2, male: 1, female: 1 }).error, 'conflict');
});

test('待拼團：前台顯示人數與男女缺額，申請加入不計入人數', () => {
  const g = book({ count: 2, male: 2, female: 0, nickname: '主揪阿明' });
  setSessionStatus(g.session_id, 'recruiting');

  let block = gas.get({ action: 'schedule', from: '2026-11-20', to: '2026-11-20' }).blocks[0];
  assert.deepEqual(block, {
    kind: 'session', type: 'group', status: 'recruiting', script_name: '範例劇本・六人本',
    start_at: '2026-11-20 14:00', end_at: '2026-11-20 18:00',
    id: g.session_id, players: 6, joined: 2, missing_male: 1, missing_female: 3, host_nickname: '主揪阿明',
  });

  assert.equal(gas.post({ action: 'join', session_id: g.session_id, ...person({ count: 5, male: 2, female: 3 }) }).error, 'exceeds_remaining');
  const j = gas.post({ action: 'join', session_id: g.session_id, ...person({ count: 4, male: 2, female: 2 }) });
  assert.deepEqual(j, { ok: true, status: 'applied' });

  block = gas.get({ action: 'schedule', from: '2026-11-20', to: '2026-11-20' }).blocks[0];
  assert.equal(block.joined, 2);
  assert.equal(gas.rows('participants').filter((p) => p.status === 'applied').length, 1);
});

test('申請加入：場次須為待拼團，且需於前一天以前', () => {
  const g = book({ count: 2, male: 1, female: 1 });
  assert.equal(gas.post({ action: 'join', session_id: g.session_id, ...person({ count: 1, male: 1, female: 0 }) }).error, 'not_recruiting');
  setSessionStatus(g.session_id, 'recruiting');
  gas.setNow('2026-11-20T08:00:00+08:00');
  assert.equal(gas.post({ action: 'join', session_id: g.session_id, ...person({ count: 1, male: 1, female: 0 }) }).error, 'join_closed');
  assert.equal(gas.post({ action: 'join', session_id: 'nope', ...person({ count: 1, male: 1, female: 0 }) }).error, 'not_recruiting');
});

test('陷阱欄位：假裝成功但不寫入', () => {
  const r = book({ website: 'http://spam' });
  assert.deepEqual(r, { ok: true, status: 'received' });
  assert.equal(gas.rows('sessions').length, 0);
});

test('同一 Email 送出次數限制', () => {
  const email = 'same@example.com';
  for (let i = 0; i < 5; i++) book({ email, start: '08:00' }); // 欄位錯誤不計次
  for (let i = 0; i < 5; i++) book({ email, date: `2026-12-0${i + 1}` });
  assert.equal(book({ email, date: '2026-12-08' }).error, 'rate_limited');
  gas.clearRateLimit();
  assert.equal(book({ email, date: '2026-12-08' }).ok, true);
});

test('時間表查詢範圍檢查與錯誤格式', () => {
  assert.equal(gas.get({ action: 'schedule', from: '2026-11-20', to: '2026-11-19' }).error, 'invalid_range');
  assert.equal(gas.get({ action: 'schedule', from: '2026-11-01', to: '2027-01-15' }).error, 'invalid_range');
  assert.equal(gas.get({ action: 'nope' }).error, 'unknown_action');
  assert.equal(JSON.parse(gas.run(`doPost({ postData: { contents: 'not json' } }).getContent()`)).error, 'bad_request');
});

test('purgeTestData 只刪除 TEST- 場次', () => {
  book();
  book({ name: '真實客人', date: '2026-11-21' });
  gas.run('purgeTestData()');
  assert.equal(gas.rows('sessions').length, 1);
  assert.deepEqual(gas.rows('participants').map((p) => p.name), ['真實客人']);
});
