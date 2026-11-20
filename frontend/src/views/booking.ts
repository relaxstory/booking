import type { App } from '../app.ts';
import { ApiError, api, type BookStatus, type Script } from '../api.ts';
import { clear, h } from '../dom.ts';
import { startOptions } from '../layout.ts';
import { dateLabel, dayNum, dayStr, durationLabel, hmToMin, minToHm, rangeLabel } from '../time.ts';
import { clearErrors, consentField, contactFields, field, honeypot, input, openDialog, peopleCount, peopleFields, readContact, showError, val } from './form.ts';

const RESULT: Record<BookStatus, { title: string; text: string }> = {
  confirmed: { title: '預約成功', text: '通關碼已確認，預約已成立。確認信會寄到你的 Email。' },
  pending: { title: '已送出，待店家確認', text: '時段已先為你保留。店家確認後會寄信通知你。' },
  group_pending: { title: '拼團登記已送出', text: '店家確認後會公開在時間表上招募其他玩家，並寄信通知你。' },
  received: { title: '已送出', text: '店家確認後會寄信通知你。' },
};

function scriptLabel(s: Script): string {
  const gender = s.male !== null && s.female !== null ? `・${s.male}男${s.female}女` : '';
  const price = s.price !== null ? `・$${s.price}/人` : '';
  return `${s.name}（${s.players}人・${durationLabel(s.duration_min)}${gender}${price}）`;
}

export function openBooking(app: App, prefill: { date?: number; start?: number } = {}): void {
  const { dialog, body, setTitle } = openDialog('登記預約');
  if (!app.scripts.length) {
    body.append(h('p', null, '目前沒有開放預約的劇本。'));
    return;
  }

  const scriptSel = h('select', { required: true }, app.scripts.map((s) => h('option', { value: s.id }, scriptLabel(s))));
  const dateIn = input({ type: 'date', min: app.rules.min_date, max: app.rules.max_date, required: true, value: dayStr(prefill.date ?? app.minDay) });
  const startSel = h('select', { required: true });
  const timeInfo = h('p', { class: 'hint', 'aria-live': 'polite' });
  const modeInfo = h('p', { class: 'mode-info', 'aria-live': 'polite' });
  const passcodeField = field('passcode', '通關碼', input({ maxlength: 20, autocomplete: 'off', class: 'mono' }), {
    hint: '店家提供的通關碼（7 天內有效）。有通關碼可直接成立預約；沒有則送出後待店家確認。',
  });
  const submit = h('button', { class: 'primary-btn wide', type: 'submit' }, '送出登記');

  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'form-error', role: 'alert' }),
    h('fieldset', { class: 'group' },
      h('legend', null, '場次'),
      field('script_id', '劇本', scriptSel, { required: true }),
      h('div', { class: 'row-2' },
        field('date', '日期', dateIn, { required: true }),
        field('start', '開場時間', startSel, { required: true }),
      ),
      timeInfo,
    ),
    h('fieldset', { class: 'group' },
      h('legend', null, '人數'),
      peopleFields(99, { showTotal: false }),
      modeInfo,
      passcodeField,
    ),
    contactFields(),
    consentField(),
    honeypot(),
    submit,
  );
  body.append(form);

  const script = () => app.scripts.find((s) => s.id === scriptSel.value)!;
  let wantedStart = prefill.start ?? null;
  let loadToken = 0;

  /** 依劇本時長與當日已佔用時段，更新可選的開場時間 */
  async function updateStarts() {
    const s = script();
    const dateStr = dateIn.value;
    const token = ++loadToken;
    if (wantedStart === null && startSel.value) wantedStart = hmToMin(startSel.value);
    clear(startSel);
    startSel.disabled = true;
    startSel.append(h('option', { value: '' }, '載入中…'));
    timeInfo.textContent = '';
    if (!dateStr || dayNum(dateStr) < app.minDay || dayNum(dateStr) > app.maxDay) {
      clear(startSel);
      startSel.append(h('option', { value: '' }, '請先選擇日期'));
      timeInfo.textContent = `可預約日期：${app.rules.min_date} 至 ${app.rules.max_date}`;
      return;
    }
    const day = dayNum(dateStr);
    let blocks;
    try {
      blocks = await app.blocks(day - 1, day + 1);
    } catch (e) {
      if (token !== loadToken) return;
      clear(startSel);
      startSel.append(h('option', { value: '' }, '無法載入'));
      timeInfo.textContent = (e as Error).message;
      return;
    }
    if (token !== loadToken) return;
    const opts = startOptions(day, s.duration_min, blocks, hmToMin(app.rules.earliest_start), hmToMin(app.rules.latest_start), app.rules.slot_minutes);
    const previous = wantedStart;
    clear(startSel);
    startSel.disabled = false;
    for (const o of opts) {
      const startAbs = day * 1440 + o.start;
      startSel.append(h('option', { value: minToHm(o.start), disabled: !o.available },
        `${rangeLabel(startAbs, startAbs + s.duration_min)}${o.available ? '' : '（已佔用）'}`));
    }
    const available = opts.filter((o) => o.available);
    const pick = available.find((o) => o.start === previous) ?? available.find((o) => previous !== null && o.start > previous) ?? available[0];
    let notice = '';
    if (pick) {
      startSel.value = minToHm(pick.start);
      if (previous !== null && pick.start !== previous) notice = `${minToHm(previous)} 開場會與其他場次重疊，已改選其他可用時間。`;
    } else {
      startSel.prepend(h('option', { value: '', selected: true }, '此日沒有可預約的時段'));
    }
    wantedStart = null;
    updateTimeInfo(notice);
  }

  function updateTimeInfo(notice = '') {
    timeInfo.textContent = notice;
    if (!startSel.value || !dateIn.value) return;
    const s = script();
    const startAbs = dayNum(dateIn.value) * 1440 + hmToMin(startSel.value);
    timeInfo.append(notice ? ' ' : '', `${dateLabel(dayNum(dateIn.value))} ${rangeLabel(startAbs, startAbs + s.duration_min)}（${durationLabel(s.duration_min)}）`);
  }

  /** 依男女人數加總，顯示包場／拼團說明與通關碼欄位 */
  function updateMode() {
    const s = script();
    const count = peopleCount(form);
    passcodeField.hidden = true;
    modeInfo.className = 'mode-info';
    if (count < 1) {
      modeInfo.textContent = `此劇本為 ${s.players} 人本，請填寫男女人數。`;
    } else if (count > s.players) {
      modeInfo.textContent = `共 ${count} 人，超過劇本人數（${s.players} 人）。`;
      modeInfo.classList.add('is-error');
    } else if (count === s.players) {
      modeInfo.textContent = `包場：共 ${count} 人，人數已滿 ${s.players} 人。`;
      modeInfo.classList.add('is-private');
      passcodeField.hidden = false;
    } else {
      modeInfo.textContent = `拼團：共 ${count} 人，還差 ${s.players - count} 人。送出後由店家確認，確認後才會公開招募；此時段在確認前不會保留。`;
      modeInfo.classList.add('is-group');
    }
    submit.textContent = count === s.players ? '送出包場登記' : count >= 1 && count < s.players ? '送出拼團登記' : '送出登記';
  }

  scriptSel.addEventListener('change', () => {
    updateMode();
    void updateStarts();
  });
  dateIn.addEventListener('change', () => void updateStarts());
  startSel.addEventListener('change', () => updateTimeInfo());
  form.addEventListener('input', (ev) => {
    const name = (ev.target as HTMLElement).getAttribute('name');
    if (name === 'male' || name === 'female') updateMode();
    (ev.target as HTMLElement).closest('.field')?.classList.remove('has-error');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors(form);
    const s = script();
    const contact = readContact(form);
    if (!startSel.value) showError(form, '請選擇可預約的開場時間', 'start');
    if (contact && contact.count > s.players) showError(form, `人數不可超過劇本人數（${s.players} 人）`, 'male');
    if (!contact || !startSel.value || contact.count > s.players) return;

    const full = contact.count === s.players;
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = '送出中…';
    try {
      const r = await api.book({
        ...contact,
        script_id: s.id,
        date: dateIn.value,
        start: startSel.value,
        passcode: full ? val(form, 'passcode') : '',
      });
      app.invalidate();
      app.refresh();
      const startAbs = dayNum(dateIn.value) * 1440 + hmToMin(startSel.value);
      showResult(r.status, s, startAbs, contact.count);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('unknown', '發生錯誤，請稍後再試');
      showError(form, err.message, err.field);
      if (err.code === 'conflict') {
        app.invalidate();
        app.refresh();
        void updateStarts();
      }
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  function showResult(status: BookStatus, s: Script, startAbs: number, count: number) {
    const r = RESULT[status];
    setTitle(r.title);
    clear(body);
    body.append(
      h('div', { class: `result result-${status}` },
        h('p', { class: 'result-text' }, r.text),
        h('dl', { class: 'summary' },
          h('dt', null, '劇本'), h('dd', null, s.name),
          h('dt', null, '時間'), h('dd', null, `${dateLabel(Math.floor(startAbs / 1440))} ${rangeLabel(startAbs, startAbs + s.duration_min)}`),
          h('dt', null, '人數'), h('dd', null, `${count} / ${s.players} 人`),
        ),
        h('p', { class: 'hint' }, '如需取消或修改，請直接聯繫店家。'),
        h('button', { class: 'primary-btn wide', type: 'button', onclick: () => dialog.close() }, '回到時間表'),
      ),
    );
  }

  updateMode();
  void updateStarts();
}
