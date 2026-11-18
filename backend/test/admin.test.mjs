import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

// 以 2026-11-18 10:00（台北）為「現在」
const NOW = '2026-11-18T10:00:00+08:00';
let gas;
let token;
let seq = 0;

function contact(over = {}) {
  return {
    name: 'TEST-客人', nickname: `暱稱${++seq}`, phone: '0912345678', email: `a${seq}@example.com`,
    line_id: 'line', ig: '', note: '', count: 6, male: 3, female: 3, ...over,
  };
}

function book(over = {}) {
  gas.clearRateLimit();
  return gas.post({ action: 'book', script_id: 's-sample-1', date: '2026-11-20', start: '14:00', ...contact(), ...over });
}

const admin = (action, body = {}) => gas.post({ action, token, ...body });
const load = (from = '2026-11-16', to = '2026-11-22') => admin('admin_load', { from, to });
const session = (id) => gas.rows('sessions').find((s) => s.id === id);
/** 後台操作觸發的通知事件（略過前台的 booking_submitted、join_applied） */
const events = () => JSON.parse(gas.run('JSON.stringify(__events)')).filter((x) => !['booking_submitted', 'join_applied'].includes(x.e));

beforeEach(() => {
  gas = createGas(NOW);
  gas.run('setup()');
  gas.run(`globalThis.__events = []; notify_ = function (e, d) { __events.push({ e: e, n: d.participants.length, p: d.participant ? d.participant.nickname : null }); }`);
  const r = gas.post({ action: 'admin_login', id_token: 'mock:owner@example.com' });
  assert.equal(r.ok, true, JSON.stringify(r));
  token = r.token;
});

test('登入：驗證 ID token 並比對 admins 名單', () => {
  assert.equal(gas.post({ action: 'admin_login', id_token: 'forged' }).error, 'unauthorized');
  assert.equal(gas.post({ action: 'admin_login', id_token: '' }).error, 'unauthorized');
  const stranger = gas.post({ action: 'admin_login', id_token: 'mock:someone@example.com' });
  assert.equal(stranger.error, 'forbidden');

  // Email 大小寫不影響
  const r = gas.post({ action: 'admin_login', id_token: 'mock:Owner@Example.com' });
  assert.equal(r.ok, true);
  assert.equal(r.name, '店主');
  assert.match(r.token, /^[0-9a-f]{64}$/);

  // 新增第二位管理者
  gas.run(`insert_('admins', { email: 'staff@example.com', name: '店員', active: 'TRUE' })`);
  assert.equal(gas.post({ action: 'admin_login', id_token: 'mock:staff@example.com' }).ok, true);
});

test('後台操作需要有效的登入憑證；停用或登出後失效', () => {
  assert.equal(gas.post({ action: 'admin_load', from: '2026-11-16', to: '2026-11-22' }).error, 'unauthorized');
  assert.equal(gas.post({ action: 'admin_load', token: 'nope', from: '2026-11-16', to: '2026-11-22' }).error, 'unauthorized');
  assert.equal(load().ok, true);
  assert.equal(admin('admin_nope').error, 'unknown_action');

  // 停用管理者 → 立即失去權限
  gas.run(`(function(){ const a = readAll_('admins')[0]; a.active = 'FALSE'; update_('admins', a); })()`);
  assert.equal(load().error, 'forbidden');
  gas.run(`(function(){ const a = readAll_('admins')[0]; a.active = 'TRUE'; update_('admins', a); })()`);
  assert.equal(load().ok, true);

  assert.equal(admin('admin_logout').ok, true);
  assert.equal(load().error, 'unauthorized');
});

test('未設定用戶端 ID 時無法登入', () => {
  gas.run(`googleClientId_ = function () { return ''; }`);
  assert.equal(gas.post({ action: 'admin_login', id_token: 'mock:owner@example.com' }).error, 'not_configured');
});

test('後台資料：含聯絡資料、關閉時段備註、範圍外的待處理場次與衝突標示', () => {
  const g = book({ count: 2, male: 1, female: 1, start: '15:00' }); // 拼團待確認（不佔時段）
  const p = book(); // 11/20 14:00–18:00 待確認，與上面重疊
  const far = book({ count: 2, male: 1, female: 1, date: '2027-01-10' }); // 範圍外
  gas.run(`insert_('closures', { id: 'c1', start_at: '2026-11-21 09:00', end_at: '2026-11-21 12:00', note: '私事', created_at: '' })`);

  const r = load();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.today, '2026-11-18');
  assert.deepEqual(r.me, { email: 'owner@example.com', name: '店主' });
  assert.deepEqual(r.scripts.map((s) => [s.id, s.active]), [['s-sample-1', true], ['s-sample-2', true], ['s-sample-3', false]]);
  assert.deepEqual(r.sessions.map((s) => s.id).sort(), [p.session_id, g.session_id, far.session_id].sort());

  const ps = r.sessions.find((s) => s.id === p.session_id);
  assert.equal(ps.status, 'pending');
  assert.equal(ps.participants[0].phone, '0912345678');
  assert.equal(ps.participants[0].is_host, true);
  assert.deepEqual(ps.joined, { count: 6, male: 3, female: 3 });
  assert.equal(ps.conflict, false);
  assert.equal(r.sessions.find((s) => s.id === g.session_id).conflict, true);
  assert.equal(r.sessions.find((s) => s.id === far.session_id).conflict, false);
  assert.deepEqual(r.closures, [{ id: 'c1', start_at: '2026-11-21 09:00', end_at: '2026-11-21 12:00', note: '私事' }]);

  // 已結束的待確認場次不再出現
  gas.setNow('2026-11-20T19:30:00+08:00'); // g 為 15:00–19:00
  assert.ok(!load().sessions.some((s) => s.id === g.session_id));
});

test('確認與拒絕：包場待確認、拼團待確認（有衝突不可確認）', () => {
  const g = book({ count: 2, male: 1, female: 1, start: '16:00' });
  const p = book(); // 與 g 重疊
  const g2 = book({ count: 2, male: 1, female: 1, date: '2026-11-21' });

  assert.equal(admin('admin_confirm', { session_id: p.session_id }).ok, true);
  assert.equal(session(p.session_id).status, 'confirmed');
  assert.equal(admin('admin_confirm', { session_id: p.session_id }).error, 'invalid_status');

  assert.equal(admin('admin_confirm', { session_id: g.session_id }).error, 'conflict');
  assert.equal(admin('admin_reject', { session_id: g.session_id }).ok, true);
  assert.equal(session(g.session_id).status, 'rejected');

  assert.equal(admin('admin_confirm', { session_id: g2.session_id }).ok, true);
  assert.equal(session(g2.session_id).status, 'recruiting');
  const pub = gas.get({ action: 'schedule', from: '2026-11-21', to: '2026-11-21' }).blocks;
  assert.equal(pub[0].status, 'recruiting');

  assert.deepEqual(events().map((x) => x.e), ['booking_confirmed', 'booking_rejected', 'group_opened']);
  assert.equal(admin('admin_confirm', { session_id: 'nope' }).error, 'not_found');
});

test('取消與成團：取消釋出時段；待拼團取消為拼團失敗', () => {
  const p = book();
  assert.equal(admin('admin_cancel', { session_id: p.session_id }).ok, true);
  assert.equal(session(p.session_id).status, 'cancelled');
  assert.equal(book().ok, true); // 時段已釋出

  const g = book({ count: 2, male: 1, female: 1, date: '2026-11-21' });
  assert.equal(admin('admin_finalize', { session_id: g.session_id }).error, 'invalid_status');
  admin('admin_confirm', { session_id: g.session_id });
  assert.equal(admin('admin_finalize', { session_id: g.session_id }).ok, true);
  assert.equal(session(g.session_id).status, 'confirmed');

  const g2 = book({ count: 2, male: 1, female: 1, date: '2026-11-22' });
  admin('admin_confirm', { session_id: g2.session_id });
  admin('admin_cancel', { session_id: g2.session_id });
  assert.deepEqual(events().map((x) => x.e), ['booking_cancelled', 'group_opened', 'group_formed', 'group_opened', 'group_failed']);
});

test('後台建立場次：包場為已預約、拼場為待拼團；檢查衝突與日期', () => {
  const base = { script_id: 's-sample-2', date: '2026-11-18', start: '13:00' };
  const priv = admin('admin_create_session', { type: 'private', ...base, host: contact({ count: 4, male: 2, female: 2 }), admin_note: '電話預約' });
  assert.equal(priv.ok, true, JSON.stringify(priv)); // 後台可安排今天
  const s = gas.rows('sessions')[0];
  assert.deepEqual([s.status, s.start_at, s.end_at, s.admin_note], ['confirmed', '2026-11-18 13:00', '2026-11-18 16:00', '電話預約']);

  assert.equal(admin('admin_create_session', { type: 'group', ...base, start: '15:30', host: contact({ count: 1, male: 1, female: 0 }) }).error, 'conflict');
  assert.equal(admin('admin_create_session', { type: 'group', ...base, date: '2026-11-17', host: contact({ count: 1, male: 1, female: 0 }) }).error, 'date_out_of_range');
  assert.equal(admin('admin_create_session', { type: 'group', ...base, start: '19:30', host: contact({ count: 1, male: 1, female: 0 }) }).error, 'invalid_start');
  assert.equal(admin('admin_create_session', { type: 'group', ...base, start: '16:00', host: contact({ count: 5, male: 3, female: 2 }) }).error, 'count_exceeds');
  assert.equal(admin('admin_create_session', { type: 'group', ...base, start: '16:00', host: contact({ male: 0 }) }).error, 'gender_mismatch');
  assert.equal(admin('admin_create_session', { type: 'x', ...base, host: contact() }).error, 'invalid_field');

  const grp = admin('admin_create_session', { type: 'group', ...base, start: '16:00', host: contact({ count: 1, male: 1, female: 0, nickname: '主揪' }) });
  assert.equal(grp.ok, true, JSON.stringify(grp));
  const block = gas.get({ action: 'schedule', from: '2026-11-18', to: '2026-11-18' }).blocks.find((b) => b.status === 'recruiting');
  assert.equal(block.host_nickname, '主揪');
  // 下架劇本仍可由後台安排
  admin('admin_script_toggle', { script_id: 's-sample-2', active: false });
  assert.equal(admin('admin_create_session', { type: 'private', ...base, date: '2026-11-19', host: contact({ count: 4, male: 2, female: 2 }) }).ok, true);
});

test('修改時間與劇本：排除自己檢查衝突，依劇本時長重算結束時間', () => {
  const a = book(); // 14:00–18:00
  const b = book({ start: '10:00' }); // 10:00–14:00
  assert.equal(admin('admin_update_session', { session_id: a.session_id, script_id: 's-sample-1', date: '2026-11-20', start: '13:30' }).error, 'conflict');
  // 往後延 1 小時：與自己原本的時段重疊沒關係
  assert.equal(admin('admin_update_session', { session_id: a.session_id, script_id: 's-sample-1', date: '2026-11-20', start: '15:00' }).ok, true);
  assert.equal(session(a.session_id).end_at, '2026-11-20 19:00');
  // 換成 3 小時的四人本
  assert.equal(admin('admin_update_session', { session_id: b.session_id, script_id: 's-sample-2', date: '2026-11-20', start: '11:00', admin_note: '改四人本' }).ok, true);
  const s = session(b.session_id);
  assert.deepEqual([s.script_id, s.start_at, s.end_at, s.admin_note], ['s-sample-2', '2026-11-20 11:00', '2026-11-20 14:00', '改四人本']);
  // 只改備註不寄信
  admin('admin_update_session', { session_id: b.session_id, script_id: 's-sample-2', date: '2026-11-20', start: '11:00', admin_note: 'x' });
  assert.deepEqual(events().map((x) => x.e), ['session_changed', 'session_changed']);
  admin('admin_cancel', { session_id: b.session_id });
  assert.equal(admin('admin_update_session', { session_id: b.session_id, script_id: 's-sample-2', date: '2026-11-20', start: '11:00' }).error, 'invalid_status');
});

test('拼場參與者：核准／拒絕申請、直接加入、調整人數、設主揪、移除', () => {
  const g = book({ count: 2, male: 2, female: 0, nickname: '主揪' });
  admin('admin_confirm', { session_id: g.session_id });
  gas.clearRateLimit();
  const join = (n, over) => gas.post({ action: 'join', session_id: g.session_id, ...contact({ nickname: n, ...over }) });
  join('甲', { count: 3, male: 1, female: 2 });
  join('乙', { count: 2, male: 0, female: 2 });
  const parts = () => gas.rows('participants');
  const pid = (n) => parts().find((p) => p.nickname === n).id;

  assert.equal(admin('admin_approve_application', { participant_id: pid('甲') }).ok, true);
  // 2 + 3 = 5，乙 2 人會超過 6 人
  assert.equal(admin('admin_approve_application', { participant_id: pid('乙') }).error, 'exceeds_remaining');
  assert.equal(admin('admin_reject_application', { participant_id: pid('乙') }).ok, true);
  assert.equal(admin('admin_reject_application', { participant_id: pid('乙') }).error, 'invalid_status');

  // 直接加入
  assert.equal(admin('admin_add_participant', { session_id: g.session_id, contact: contact({ nickname: '丙', count: 2, male: 1, female: 1 }) }).error, 'exceeds_remaining');
  assert.equal(admin('admin_add_participant', { session_id: g.session_id, contact: contact({ nickname: '丙', count: 1, male: 0, female: 1 }) }).ok, true);

  // 調整人數：甲改 4 人會超過；改 2 人可以
  const edit = (n, over) => admin('admin_update_participant', { participant_id: pid(n), contact: contact({ nickname: n, ...over }) });
  assert.equal(edit('甲', { count: 4, male: 2, female: 2 }).error, 'exceeds_remaining');
  assert.equal(edit('甲', { count: 2, male: 1, female: 1, phone: '0987654321' }).ok, true);
  assert.equal(parts().find((p) => p.nickname === '甲').phone, '0987654321');

  // 設主揪：同一場只有一位
  assert.equal(admin('admin_set_host', { participant_id: pid('丙') }).ok, true);
  assert.deepEqual(parts().filter((p) => p.is_host === 'TRUE').map((p) => p.nickname), ['丙']);
  assert.equal(admin('admin_set_host', { participant_id: pid('乙') }).error, 'invalid_status'); // 已拒絕

  assert.equal(admin('admin_remove_participant', { participant_id: pid('甲') }).ok, true);
  assert.ok(!parts().some((p) => p.nickname === '甲'));

  const block = gas.get({ action: 'schedule', from: '2026-11-20', to: '2026-11-20' }).blocks[0];
  assert.deepEqual([block.joined, block.missing_male, block.missing_female, block.host_nickname], [3, 1, 2, '丙']);

  assert.deepEqual(events().map((x) => [x.e, x.p]), [
    ['group_opened', null],
    ['application_approved', '甲'],
    ['application_rejected', '乙'],
    ['participant_added', '丙'],
  ]);

  // 包場不可調整參與者
  const p = book({ date: '2026-11-21' });
  assert.equal(admin('admin_add_participant', { session_id: p.session_id, contact: contact({ count: 1, male: 1, female: 0 }) }).error, 'invalid_status');
  const host = parts().find((x) => x.session_id === p.session_id);
  assert.equal(admin('admin_remove_participant', { participant_id: host.id }).error, 'invalid_status');
  assert.equal(admin('admin_update_participant', { participant_id: host.id, contact: contact({ count: 7, male: 4, female: 3 }) }).error, 'count_exceeds');
});

test('關閉時段：不可與既有場次重疊，前台不顯示備註', () => {
  book(); // 11/20 14:00–18:00
  const mk = (start_at, end_at, note = '') => admin('admin_closure_create', { start_at, end_at, note });
  assert.equal(mk('2026-11-20 17:00', '2026-11-20 20:00').error, 'conflict');
  assert.equal(mk('2026-11-20 19:00', '2026-11-20 18:00').error, 'invalid_field');
  assert.equal(mk('bad', '2026-11-20 18:00').error, 'invalid_field');
  assert.equal(mk('2026-11-20 18:00', '2026-11-21 12:00', '員工旅遊').ok, true);
  assert.equal(book({ date: '2026-11-21', start: '09:00' }).error, 'conflict');

  const pub = gas.get({ action: 'schedule', from: '2026-11-21', to: '2026-11-21' });
  assert.ok(!JSON.stringify(pub).includes('員工旅遊'));
  const c = load().closures[0];
  assert.equal(c.note, '員工旅遊');
  assert.equal(admin('admin_closure_delete', { closure_id: c.id }).ok, true);
  assert.equal(admin('admin_closure_delete', { closure_id: c.id }).error, 'not_found');
  assert.equal(book({ date: '2026-11-21', start: '09:00' }).ok, true);
});

test('通關碼產生與劇本上下架', () => {
  const pc = admin('admin_passcode_create');
  assert.match(pc.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(pc.expires_at, '2026-11-25 10:00:00');
  assert.deepEqual(load().passcodes.map((x) => [x.code, x.state]), [[pc.code, 'active']]);
  book({ passcode: pc.code });
  assert.equal(load().passcodes[0].state, 'used');

  assert.equal(admin('admin_script_toggle', { script_id: 's-sample-1', active: false }).ok, true);
  assert.deepEqual(gas.get({ action: 'scripts' }).scripts.map((s) => s.id), ['s-sample-2']);
  assert.equal(admin('admin_script_toggle', { script_id: 's-sample-3', active: true }).ok, true);
  assert.deepEqual(gas.get({ action: 'scripts' }).scripts.map((s) => s.id), ['s-sample-2', 's-sample-3']);
  assert.equal(admin('admin_script_toggle', { script_id: 'nope', active: true }).error, 'not_found');
});
