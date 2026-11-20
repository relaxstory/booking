// 登記表單欄位：姓名、電話已移除；人數 = 男 + 女；LINE／IG 至少一項
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

let gas;
beforeEach(() => {
  gas = createGas('2026-11-18T10:00:00+08:00');
  gas.setup(); // s-sample-1 為 6 人本（男 3 女 3）
});

const book = (over = {}) => {
  gas.clearRateLimit();
  const body = {
    action: 'book', script_id: 's-sample-1', date: '2026-11-20', start: '14:00',
    nickname: '小明', email: 'a@example.com', line_id: 'line', ig: '', note: '',
    male: 3, female: 3, ...over,
  };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return gas.post(body);
};

test('不填姓名、電話、總人數也能登記；人數由男女加總', () => {
  const r = book();
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = gas.rows('participants')[0];
  assert.deepEqual([p.name, p.phone, p.count, p.male, p.female], ['', '', '6', '3', '3']);
});

test('男女加總少於劇本人數 → 拼團待確認', () => {
  const r = book({ male: 1, female: 2 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.status, 'group_pending');
  assert.equal(gas.rows('participants')[0].count, '3');
});

test('男女加總超過劇本人數 → 錯誤', () => {
  const r = book({ male: 4, female: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'count_exceeds');
});

test('男女都是 0 → 錯誤，標在男性人數欄', () => {
  const r = book({ male: 0, female: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.field, 'male');
});

test('仍有傳 count 時，必須等於男女加總（舊版前端相容）', () => {
  assert.equal(book({ count: 6 }).ok, true);
  const r = book({ count: 5, date: '2026-11-21' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'gender_mismatch');
});

test('LINE 與 IG 都沒填 → 錯誤；只填 IG 可以', () => {
  const r = book({ line_id: '' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'contact_required');
  assert.match(r.message, /LINE 或 IG/);
  assert.equal(book({ line_id: '', ig: 'my_ig' }).ok, true);
});

test('Email 仍為必填', () => {
  const r = book({ email: '' });
  assert.equal(r.ok, false);
  assert.equal(r.field, 'email');
});

test('有填電話時仍檢查格式（後台舊資料相容）', () => {
  const r = book({ phone: 'abc' });
  assert.equal(r.ok, false);
  assert.equal(r.field, 'phone');
});

test('後台編輯舊參與者（未傳姓名、電話）時保留原本的姓名與電話', () => {
  assert.equal(book({ name: '王小明', phone: '0912345678' }).ok, true);
  const before = gas.rows('participants')[0];
  assert.deepEqual([before.name, before.phone], ['王小明', '0912345678']);
  gas.run(`adminUpdateParticipant_({ participant_id: ${JSON.stringify(before.id)}, contact: { nickname: '新暱稱', email: 'b@example.com', line_id: 'line', ig: '', note: '', male: 3, female: 3 } })`);
  const after = gas.rows('participants')[0];
  assert.deepEqual([after.name, after.phone, after.nickname, after.email], ['王小明', '0912345678', '新暱稱', 'b@example.com']);
});
