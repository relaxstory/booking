import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

// 以 2026-11-18 10:00（台北）為「現在」
const NOW = '2026-11-18T10:00:00+08:00';
let gas;
let token;
let seq = 0;

/** 通知信測試使用可寄送的網域（example.com 不會寄出） */
function contact(over = {}) {
  seq++;
  return {
    name: `TEST-客人${seq}`, nickname: `暱稱${seq}`, phone: '0912345678', email: `p${seq}@mail.com`,
    line_id: 'line', ig: '', note: '', count: 6, male: 3, female: 3, ...over,
  };
}

function book(over = {}) {
  gas.clearRateLimit();
  return gas.post({ action: 'book', script_id: 's-sample-1', date: '2026-11-20', start: '14:00', ...contact(), ...over });
}

const admin = (action, body = {}) => gas.post({ action, token, ...body });
/** 取出並清空已寄出的信 */
const take = () => gas.mails.splice(0).map((m) => ({ to: m.to, subject: m.subject, body: m.body }));
const subjects = (mails) => mails.map((m) => `${m.to} ${m.subject.replace(/：.*$/, '')}`);

beforeEach(() => {
  gas = createGas(NOW);
  gas.run('setup()');
  token = gas.post({ action: 'admin_login', id_token: 'mock:owner@example.com' }).token;
  take();
});

test('前台登記：通關碼直接成立才寄「預約成立」，待確認與拼團待確認不寄', () => {
  const pc = admin('admin_passcode_create').code;
  const r = book({ passcode: pc, name: '王小明', email: 'ming@mail.com' });
  assert.equal(r.status, 'confirmed');
  const [m, ...rest] = take();
  assert.equal(rest.length, 0);
  assert.equal(m.to, 'ming@mail.com');
  assert.equal(m.subject, '【Re:LAX Story Lab】預約成立：2026/11/20（五） 14:00 範例劇本・六人本');
  assert.match(m.body, /^王小明 你好：/);
  assert.match(m.body, /時間：2026\/11\/20（五） 14:00–18:00/);
  assert.match(m.body, /劇本：範例劇本・六人本（6 人・4 小時）/);
  assert.match(m.body, /你這組：6 人（男 3・女 3）/);
  assert.match(m.body, /如需修改或取消，請聯繫店家（Instagram @kac_larpgm）。/);

  book({ date: '2026-11-21' }); // 待確認
  book({ date: '2026-11-22', count: 2, male: 1, female: 1 }); // 拼團待確認
  assert.deepEqual(take(), []);
});

test('包場：確認寄給登記者；修改時間與取消寄給該場所有人', () => {
  const p = book({ email: 'host@mail.com' });
  admin('admin_confirm', { session_id: p.session_id });
  assert.deepEqual(subjects(take()), ['host@mail.com 【Re:LAX Story Lab】預約成立']);

  admin('admin_update_session', { session_id: p.session_id, script_id: 's-sample-2', date: '2026-11-21', start: '10:00' });
  const [m] = take();
  assert.equal(m.subject, '【Re:LAX Story Lab】場次異動：2026/11/21（六） 10:00 範例劇本・四人本');
  assert.match(m.body, /時間：2026\/11\/21（六） 10:00–13:00/);
  assert.match(m.body, /原本：2026\/11\/20（五） 14:00–18:00・範例劇本・六人本/);

  admin('admin_cancel', { session_id: p.session_id });
  assert.deepEqual(subjects(take()), ['host@mail.com 【Re:LAX Story Lab】場次已取消']);

  const r = book({ date: '2026-11-23', email: 'x@mail.com' });
  admin('admin_reject', { session_id: r.session_id });
  assert.deepEqual(subjects(take()), ['x@mail.com 【Re:LAX Story Lab】預約未成立']);
});

test('拼場：開放招募寄主揪、申請與核准／拒絕寄申請者、成團與失敗寄所有人', () => {
  const g = book({ count: 2, male: 1, female: 1, email: 'host@mail.com' });
  admin('admin_confirm', { session_id: g.session_id });
  const [opened] = take();
  assert.equal(opened.to, 'host@mail.com');
  assert.match(opened.subject, /拼場開始招募/);
  assert.match(opened.body, /你這組：2 人（男 1・女 1）・主揪/);
  assert.match(opened.body, /目前人數：2\/6 人/);

  const join = (email, over = {}) => {
    gas.clearRateLimit();
    return gas.post({ action: 'join', session_id: g.session_id, ...contact({ email, count: 2, male: 1, female: 1, ...over }) });
  };
  join('a@mail.com');
  join('b@mail.com');
  const applied = take();
  assert.deepEqual(subjects(applied), ['a@mail.com 【Re:LAX Story Lab】已收到加入申請', 'b@mail.com 【Re:LAX Story Lab】已收到加入申請']);
  assert.match(applied[0].body, /目前人數：2\/6 人/); // 申請中不計入

  const pid = (email) => gas.rows('participants').find((p) => p.email === email).id;
  admin('admin_approve_application', { participant_id: pid('a@mail.com') });
  admin('admin_reject_application', { participant_id: pid('b@mail.com') });
  const decided = take();
  assert.deepEqual(subjects(decided), ['a@mail.com 【Re:LAX Story Lab】加入申請已核准', 'b@mail.com 【Re:LAX Story Lab】加入申請未通過']);
  assert.match(decided[0].body, /目前人數：4\/6 人/);
  assert.match(decided[0].body, /成團後會再寄信通知你/);

  // 同一 Email 的多組只寄一封；example.com 不寄
  admin('admin_add_participant', { session_id: g.session_id, contact: contact({ email: 'A@mail.com', count: 1, male: 1, female: 0 }) });
  admin('admin_add_participant', { session_id: g.session_id, contact: contact({ email: 'z@example.com', count: 1, male: 0, female: 1 }) });
  assert.deepEqual(subjects(take()), ['A@mail.com 【Re:LAX Story Lab】你已加入拼場']);

  admin('admin_finalize', { session_id: g.session_id });
  assert.deepEqual(subjects(take()), ['host@mail.com 【Re:LAX Story Lab】拼場成團，預約成立', 'a@mail.com 【Re:LAX Story Lab】拼場成團，預約成立']);

  const g2 = book({ date: '2026-11-22', count: 2, male: 1, female: 1, email: 'h2@mail.com' });
  admin('admin_confirm', { session_id: g2.session_id });
  take();
  admin('admin_cancel', { session_id: g2.session_id });
  assert.deepEqual(subjects(take()), ['h2@mail.com 【Re:LAX Story Lab】拼場未成團，場次取消']);
});

test('寄信失敗不影響操作', () => {
  gas.run(`MailApp = { sendEmail: function () { throw new Error('quota'); } }`);
  const p = book();
  assert.equal(admin('admin_confirm', { session_id: p.session_id }).ok, true);
  assert.equal(gas.rows('sessions')[0].status, 'confirmed');
});

test('前一日提醒：只寄隔天的已預約場次，每場一次', () => {
  const a = book({ date: '2026-11-19', email: 'a@mail.com' }); // 明天，確認
  admin('admin_confirm', { session_id: a.session_id });
  book({ date: '2026-11-19', start: '18:00', email: 'b@mail.com' }); // 明天，待確認 → 不寄
  const c = book({ date: '2026-11-20', email: 'c@mail.com' }); // 後天
  admin('admin_confirm', { session_id: c.session_id });
  const g = book({ date: '2026-11-19', start: '09:00', count: 2, male: 1, female: 1, email: 'g@mail.com' });
  admin('admin_confirm', { session_id: g.session_id }); // 明天，待拼團（未成團）→ 不寄
  take();

  assert.equal(gas.run('sendReminders_()'), 1);
  const [m, ...rest] = take();
  assert.equal(rest.length, 0);
  assert.equal(m.to, 'a@mail.com');
  assert.equal(m.subject, '【Re:LAX Story Lab】明天見！場次提醒：2026/11/19（四） 14:00 範例劇本・六人本');
  assert.ok(gas.rows('sessions').find((s) => s.id === a.session_id).reminded_at);

  // 同一天再執行不重複寄
  assert.equal(gas.run('sendReminders_()'), 0);
  assert.deepEqual(take(), []);

  gas.setNow('2026-11-19T10:00:00+08:00');
  assert.equal(gas.run('sendReminders_()'), 1);
  assert.deepEqual(take().map((x) => x.to), ['c@mail.com']);
});

test('個資清除：場次結束滿半年的參與者清空個資，保留場次與人數', () => {
  const old = book({ date: '2026-11-20' });
  const keep = book({ date: '2026-11-21' });
  gas.run(`insert_('participants', { id: 'orphan', session_id: 'gone', status: 'joined', is_host: 'TRUE', name: '孤兒', email: 'o@mail.com', count: 1 })`);

  gas.setNow('2027-05-20T10:00:00+08:00'); // 基準日 2026-11-20
  assert.equal(gas.run('purgePersonalData_()'), 2);
  const rows = gas.rows('participants');
  const o = rows.find((p) => p.session_id === old.session_id);
  assert.deepEqual([o.name, o.phone, o.email, o.line_id, o.ig, o.note], ['', '', '', '', '', '']);
  assert.equal(o.count, '6');
  assert.ok(o.nickname);
  assert.equal(o.purged_at, '2027-05-20 10:00:00');
  assert.equal(rows.find((p) => p.id === 'orphan').name, '');
  assert.ok(rows.find((p) => p.session_id === keep.session_id).email);
  assert.equal(gas.rows('sessions').length, 2);

  // 已清除的不重複處理
  assert.equal(gas.run('purgePersonalData_()'), 0);

  // 月底：8/31 往前 6 個月 → 2/28
  gas.setNow('2027-08-31T10:00:00+08:00');
  assert.equal(gas.run('dayStr_(purgeCutoffDay_())'), '2027-02-28');
});

test('installTriggers：安裝兩個每日排程，重複執行不會重複安裝', () => {
  gas.run('installTriggers()');
  gas.run('installTriggers()');
  assert.deepEqual(gas.triggers.map((t) => [t.handler, t.atHour, t.everyDays, t.tz]), [
    ['dailyReminder', 10, 1, 'Asia/Taipei'],
    ['dailyPurge', 3, 1, 'Asia/Taipei'],
  ]);
});

test('sendTestEmails：每種通知各寄一封範例到自己的信箱', () => {
  gas.run(`Session = { getEffectiveUser: function () { return { getEmail: function () { return 'me@mail.com'; } }; } }`);
  gas.run('sendTestEmails()');
  const mails = take();
  assert.equal(mails.length, 12);
  assert.ok(mails.every((m) => m.to === 'me@mail.com'));
  assert.equal(gas.rows('sessions').length, 0);
});
