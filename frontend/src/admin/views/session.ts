import { ApiError } from '../../api.ts';
import { clear, h } from '../../dom.ts';
import { startOptions } from '../../layout.ts';
import { dateLabel, dayNum, dayStr, durationLabel, hmToMin, minToHm, rangeLabel } from '../../time.ts';
import { clearErrors, contactFields, field, input, openDialog, peopleFields, readContact, showError, val } from '../../views/form.ts';
import type { AdminApp } from '../app.ts';
import { adminApi, type AdminParticipant, type AdminSession, type ContactInput, type SessionInput, type SessionType } from '../api.ts';
import { STATUS_LABEL, TYPE_LABEL, headcount, whenLabel } from '../format.ts';
import { btn, contactInfo, participantHead, statusTags } from './parts.ts';

type Act = (b: HTMLButtonElement, task: () => Promise<unknown>, ok: string, confirmText?: string) => void;

/** 場次詳細：狀態操作、參與者管理。操作後自動以最新資料重繪 */
export function openSession(app: AdminApp, id: string): void {
  const { dialog, body, setTitle } = openDialog('場次');

  const draw = () => {
    const s = app.data?.sessions.find((x) => x.id === id);
    if (!s) {
      dialog.close();
      return;
    }
    setTitle(`${TYPE_LABEL[s.type]}・${s.script_name}`);
    clear(body);
    body.append(renderDetail(app, s, act, draw));
  };
  const act: Act = (b, task, ok, confirmText) => {
    void app.act(b, task, ok, confirmText).then((done) => done && draw());
  };
  draw();
}

function renderDetail(app: AdminApp, s: AdminSession, act: Act, redraw: () => void): HTMLElement {
  const click = (task: () => Promise<unknown>, ok: string, confirmText?: string) => (e: MouseEvent) =>
    act(e.currentTarget as HTMLButtonElement, task, ok, confirmText);
  const what = `「${s.script_name}」${whenLabel(s)}`;

  const actions: HTMLElement[] = [];
  if (s.status === 'pending') {
    actions.push(
      btn('確認預約', click(() => adminApi.confirm(s.id), '已確認預約'), 'primary-btn'),
      btn('拒絕', click(() => adminApi.reject(s.id), '已拒絕', `確定拒絕${what}？\n時段會釋出，並寄信通知登記者。`), 'danger-btn'),
    );
  } else if (s.status === 'group_pending') {
    actions.push(
      btn('確認，公開招募', click(() => adminApi.confirm(s.id), '已公開招募'), 'primary-btn', s.conflict),
      btn('拒絕', click(() => adminApi.reject(s.id), '已拒絕', `確定拒絕${what}的拼團登記？\n會寄信通知主揪。`), 'danger-btn'),
    );
  } else if (s.status === 'recruiting') {
    actions.push(
      btn('成團（改為已預約）', click(() => adminApi.finalize(s.id), '已成團', `確定${what}成團？\n目前 ${headcount(s)}，會寄信通知所有參與者。`), 'primary-btn'),
      btn('拼團失敗，取消', click(() => adminApi.cancel(s.id), '已取消（拼團失敗）', `確定取消${what}？\n時段會釋出，並寄「拼團失敗」通知給所有參與者。`), 'danger-btn'),
    );
  } else if (s.status === 'confirmed') {
    actions.push(btn('取消預約', click(() => adminApi.cancel(s.id), '已取消預約', `確定取消${what}？\n時段會釋出，並寄信通知所有參與者。`), 'danger-btn'));
  }
  actions.push(btn('修改時間／劇本', () => openSessionForm(app, { session: s, onDone: redraw })));

  const editable = s.type === 'group';
  const people = s.participants.map((p) => renderParticipant(p, s, editable, click, () => openParticipantForm(app, s, p, redraw)));

  return h('div', { class: 'detail' },
    h('div', { class: 'tags' }, statusTags(s)),
    h('dl', { class: 'summary' },
      h('dt', null, '時間'), h('dd', null, whenLabel(s)),
      h('dt', null, '人數'), h('dd', null, headcount(s)),
      s.passcode && [h('dt', null, '通關碼'), h('dd', { class: 'mono' }, s.passcode)],
      h('dt', null, '登記時間'), h('dd', null, s.created_at.slice(0, 16)),
      s.admin_note && [h('dt', null, '後台備註'), h('dd', null, s.admin_note)],
    ),
    s.conflict && h('p', { class: 'warn' }, '⚠ 此時段已有其他場次或不開放，無法確認；請改時間或拒絕。'),
    s.status === 'group_pending' && h('p', { class: 'hint' }, '拼團待確認不佔用時段，前台看不到。'),
    h('div', { class: 'card-actions' }, actions),
    h('div', { class: 'detail-head' },
      h('h3', null, '參與者'),
      editable && btn('＋ 新增參與者', () => openParticipantForm(app, s, null, redraw)),
    ),
    people.length ? h('div', { class: 'people' }, people) : h('p', { class: 'empty' }, '沒有參與者資料。'),
  );
}

function renderParticipant(
  p: AdminParticipant,
  s: AdminSession,
  editable: boolean,
  click: (task: () => Promise<unknown>, ok: string, confirmText?: string) => (e: MouseEvent) => void,
  edit: () => void,
): HTMLElement {
  const actions: HTMLElement[] = [];
  const who = `「${p.nickname}」`;
  if (p.status === 'applied') {
    const over = p.count > s.players - s.joined.count;
    actions.push(
      btn('核准加入', click(() => adminApi.approveApplication(p.id), '已核准加入'), 'primary-btn', over),
      btn('拒絕', click(() => adminApi.rejectApplication(p.id), '已拒絕申請', `確定拒絕${who}的加入申請？會寄信通知申請者。`), 'danger-btn'),
    );
  }
  if (p.status !== 'rejected') actions.push(btn('編輯／調整人數', edit));
  if (editable && p.status === 'joined' && !p.is_host) actions.push(btn('設為主揪', click(() => adminApi.setHost(p.id), `已將${who}設為主揪`)));
  if (editable && p.status !== 'applied') {
    actions.push(btn('移除', click(() => adminApi.removeParticipant(p.id), `已移除${who}`, `確定把${who}從這個場次移除？資料會刪除，且不會寄信通知。`), 'danger-btn'));
  }
  return h('article', { class: `card person${p.status === 'rejected' ? ' is-muted' : ''}` },
    participantHead(p),
    contactInfo(p),
    actions.length > 0 && h('div', { class: 'card-actions' }, actions),
  );
}

/* ───────── 場次表單（新增／修改） ───────── */

function scriptOption(s: { id: string; name: string; players: number; duration_min: number; active: boolean }, selected: boolean): HTMLOptionElement {
  return h('option', { value: s.id, selected }, `${s.name}（${s.players}人・${durationLabel(s.duration_min)}）${s.active ? '' : '（下架）'}`);
}

/**
 * 新增場次（session 為空）或修改既有場次的時間、劇本與後台備註。
 * prefill：從時間表點選的日期與時間。
 */
export function openSessionForm(app: AdminApp, opts: { session?: AdminSession; prefill?: { day: number; start?: number }; onDone?: () => void }): void {
  const d = app.data!;
  const s = opts.session;
  const { dialog, body } = openDialog(s ? '修改時間／劇本' : '新增場次');
  const scripts = d.scripts;
  if (!scripts.length) {
    body.append(h('p', null, '試算表中沒有可用的劇本。'));
    return;
  }

  const today = dayNum(d.today);
  const initDay = s ? dayNum(s.start_at.slice(0, 10)) : Math.max(today, opts.prefill?.day ?? today);
  const typeSel = h('select', null, h('option', { value: 'private' }, '包場（直接成立為已預約）'), h('option', { value: 'group' }, '拼場（直接公開招募）'));
  const scriptSel = h('select', null, scripts.map((x) => scriptOption(x, x.id === (s?.script_id ?? scripts[0].id))));
  const dateIn = input({ type: 'date', min: d.today, value: dayStr(initDay) });
  const startSel = h('select');
  const timeInfo = h('p', { class: 'hint', 'aria-live': 'polite' });
  const note = h('textarea', { rows: 2, maxlength: 500 }, s?.admin_note ?? '');
  const submit = h('button', { class: 'primary-btn wide', type: 'submit' }, s ? '儲存變更' : '建立場次');

  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'form-error', role: 'alert' }),
    s && h('p', { class: 'hint' }, `目前：${whenLabel(s)}・${s.script_name}・${STATUS_LABEL[s.status]}。修改時間或劇本會寄信通知該場所有人。`),
    h('fieldset', { class: 'group' },
      h('legend', null, '場次'),
      !s && field('type', '類型', typeSel, { required: true }),
      field('script_id', '劇本', scriptSel, { required: true }),
      h('div', { class: 'row-2' },
        field('date', '日期', dateIn, { required: true }),
        field('start', '開場時間', startSel, { required: true }),
      ),
      timeInfo,
      field('admin_note', '後台備註', note, { hint: '僅後台可見' }),
    ),
    !s && [
      h('fieldset', { class: 'group' }, h('legend', null, '人數'), peopleFields(99)),
      contactFields('拼場時會公開顯示為主揪暱稱'),
    ],
    submit,
  );
  body.append(form);

  const script = () => scripts.find((x) => x.id === scriptSel.value) ?? scripts[0];
  let wanted: number | null = s ? hmToMin(s.start_at.slice(11, 16)) : opts.prefill?.start ?? null;
  let token = 0;

  async function updateStarts() {
    const sc = script();
    const t = ++token;
    if (wanted === null && startSel.value) wanted = hmToMin(startSel.value);
    clear(startSel);
    startSel.disabled = true;
    startSel.append(h('option', { value: '' }, '載入中…'));
    timeInfo.textContent = '';
    if (!dateIn.value || dayNum(dateIn.value) < today) {
      clear(startSel);
      startSel.append(h('option', { value: '' }, '請選擇今天以後的日期'));
      return;
    }
    const day = dayNum(dateIn.value);
    let blocks;
    try {
      blocks = await app.blocksAround(day, s?.id);
    } catch (e) {
      if (t !== token) return;
      clear(startSel);
      startSel.append(h('option', { value: '' }, '無法載入'));
      timeInfo.textContent = (e as Error).message;
      return;
    }
    if (t !== token) return;
    const r = d.rules;
    // 拼團待確認不佔時段，不需避開
    const occupying = !s || s.status !== 'group_pending';
    const opts2 = startOptions(day, sc.duration_min, occupying ? blocks : [], hmToMin(r.earliest_start), hmToMin(r.latest_start), r.slot_minutes);
    clear(startSel);
    startSel.disabled = false;
    for (const o of opts2) {
      const a = day * 1440 + o.start;
      startSel.append(h('option', { value: minToHm(o.start), disabled: !o.available }, `${rangeLabel(a, a + sc.duration_min)}${o.available ? '' : '（已佔用）'}`));
    }
    const avail = opts2.filter((o) => o.available);
    const prev = wanted;
    const pick = avail.find((o) => o.start === prev) ?? avail.find((o) => prev !== null && o.start > prev) ?? avail[0];
    let notice = '';
    if (pick) {
      startSel.value = minToHm(pick.start);
      if (prev !== null && pick.start !== prev) notice = `${minToHm(prev)} 開場會與其他場次重疊，已改選其他時間。`;
    } else {
      startSel.prepend(h('option', { value: '', selected: true }, '此日沒有可用的時段'));
    }
    wanted = null;
    updateInfo(notice);
  }

  function updateInfo(notice = '') {
    timeInfo.textContent = notice;
    if (!startSel.value || !dateIn.value) return;
    const a = dayNum(dateIn.value) * 1440 + hmToMin(startSel.value);
    timeInfo.append(notice ? ' ' : '', `${dateLabel(dayNum(dateIn.value))} ${rangeLabel(a, a + script().duration_min)}（${durationLabel(script().duration_min)}）`);
  }

  scriptSel.addEventListener('change', () => void updateStarts());
  dateIn.addEventListener('change', () => void updateStarts());
  startSel.addEventListener('change', () => updateInfo());
  form.addEventListener('input', (ev) => (ev.target as HTMLElement).closest('.field')?.classList.remove('has-error'));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors(form);
    if (!startSel.value) {
      showError(form, '請選擇可用的開場時間', 'start');
      return;
    }
    const fields: SessionInput = { script_id: scriptSel.value, date: dateIn.value, start: startSel.value, admin_note: val(form, 'admin_note') };
    let host: ContactInput | null = null;
    if (!s) {
      const c = readContact(form, { consent: false });
      if (!c) return;
      if (c.count > script().players) {
        showError(form, `人數不可超過劇本人數（${script().players} 人）`, 'male');
        return;
      }
      const { website: _w, ...rest } = c;
      host = rest;
    }
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = '處理中…';
    try {
      if (s) await adminApi.updateSession(s.id, fields);
      else await adminApi.createSession(typeSel.value as SessionType, fields, host!);
      app.toast(s ? '已更新場次' : '已建立場次');
      await app.reload();
      dialog.close();
      opts.onDone?.();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('unknown', '發生錯誤，請稍後再試');
      showError(form, err.message, err.field);
      if (err.code === 'conflict') void updateStarts();
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  void updateStarts();
}

/* ───────── 參與者表單 ───────── */

const CONTACT_KEYS = ['nickname', 'email', 'line_id', 'ig', 'note', 'male', 'female'] as const;

/** 新增（p 為空）或編輯參與者資料與人數 */
export function openParticipantForm(app: AdminApp, s: AdminSession, p: AdminParticipant | null, onDone: () => void): void {
  const { dialog, body } = openDialog(p ? `編輯：${p.nickname}` : '新增參與者');
  const remaining = s.players - s.joined.count + (p && p.status === 'joined' ? p.count : 0);
  const submit = h('button', { class: 'primary-btn wide', type: 'submit' }, p ? '儲存' : '加入此場次');
  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'form-error', role: 'alert' }),
    h('p', { class: 'hint' }, `${s.script_name}・${whenLabel(s)}・目前 ${headcount(s)}`),
    h('fieldset', { class: 'group' },
      h('legend', null, '人數'),
      peopleFields(99),
      h('p', { class: 'hint' }, p?.status === 'applied' ? '申請中的人數在核准後才會計入。' : `此場最多還可加入 ${Math.max(0, remaining)} 人。`),
    ),
    contactFields('拼場的主揪暱稱會公開顯示'),
    !p && h('p', { class: 'hint' }, '直接加入的參與者狀態為「已加入」，並會寄信通知。'),
    submit,
  );
  body.append(form);
  if (p) {
    for (const k of CONTACT_KEYS) {
      const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${k}"]`);
      if (el) el.value = String(p[k] ?? '');
    }
    form.querySelector('.people')?.dispatchEvent(new Event('input')); // 更新「共 N 人」
  }
  form.addEventListener('input', (ev) => (ev.target as HTMLElement).closest('.field')?.classList.remove('has-error'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors(form);
    const c = readContact(form, { consent: false });
    if (!c) return;
    const { website: _w, ...contact } = c;
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = '處理中…';
    try {
      if (p) await adminApi.updateParticipant(p.id, contact);
      else await adminApi.addParticipant(s.id, contact);
      app.toast(p ? '已更新參與者' : '已加入參與者');
      await app.reload();
      dialog.close();
      onDone();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('unknown', '發生錯誤，請稍後再試');
      showError(form, err.message, err.field);
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}
