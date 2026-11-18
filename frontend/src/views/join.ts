import type { App } from '../app.ts';
import { ApiError, api, type SessionBlock } from '../api.ts';
import { clear, h } from '../dom.ts';
import { absOf, dateLabel, rangeLabel } from '../time.ts';
import { clearErrors, consentField, contactFields, honeypot, openDialog, peopleFields, readContact, showError } from './form.ts';

export function openJoin(app: App, b: SessionBlock): void {
  const { dialog, body, setTitle } = openDialog('申請加入拼場');
  const startAbs = absOf(b.start_at);
  const endAbs = absOf(b.end_at);
  const players = b.players ?? 0;
  const joined = b.joined ?? 0;
  const remaining = Math.max(0, players - joined);
  const missing = [b.missing_male ? `男 ${b.missing_male}` : '', b.missing_female ? `女 ${b.missing_female}` : ''].filter(Boolean).join('、');

  const summary = h('dl', { class: 'summary' },
    h('dt', null, '劇本'), h('dd', null, b.script_name),
    h('dt', null, '時間'), h('dd', null, `${dateLabel(Math.floor(startAbs / 1440))} ${rangeLabel(startAbs, endAbs)}`),
    h('dt', null, '目前人數'), h('dd', null, `${joined} / ${players} 人`, missing && `（缺 ${missing}）`),
    b.host_nickname && [h('dt', null, '主揪'), h('dd', null, b.host_nickname)],
  );

  if (Math.floor(startAbs / 1440) < app.minDay) {
    body.append(summary, h('p', { class: 'error-box' }, '申請加入需於場次前一天以前送出，請直接聯繫店家。'));
    return;
  }
  if (remaining === 0) {
    body.append(summary, h('p', { class: 'error-box' }, '此場次已滿。'));
    return;
  }

  const submit = h('button', { class: 'primary-btn wide', type: 'submit' }, '送出申請');
  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'form-error', role: 'alert' }),
    h('fieldset', { class: 'group' },
      h('legend', null, '人數'),
      peopleFields(remaining, 1),
      h('p', { class: 'hint' }, `最多 ${remaining} 人。可以和朋友一起申請。缺額僅供參考，由店家決定是否核准。`),
    ),
    contactFields('不公開，方便店家與主揪稱呼你'),
    consentField(),
    honeypot(),
    submit,
  );
  body.append(summary, h('p', { class: 'hint intro' }, '送出後為「申請中」，不會立即計入人數；店家核准後會寄信通知你。'), form);

  form.addEventListener('input', (ev) => (ev.target as HTMLElement).closest('.field')?.classList.remove('has-error'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors(form);
    const contact = readContact(form);
    if (contact && contact.count > remaining) showError(form, `人數超過剩餘名額（剩 ${remaining} 人）`, 'count');
    if (!contact || contact.count > remaining) return;
    submit.disabled = true;
    submit.textContent = '送出中…';
    try {
      await api.join(b.id!, contact);
      app.invalidate();
      app.refresh();
      setTitle('已送出申請');
      clear(body);
      body.append(
        h('div', { class: 'result' },
          h('p', { class: 'result-text' }, '你的加入申請已送出，店家核准或拒絕後會寄信通知你。'),
          summary,
          h('button', { class: 'primary-btn wide', type: 'button', onclick: () => dialog.close() }, '回到時間表'),
        ),
      );
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('unknown', '發生錯誤，請稍後再試');
      showError(form, err.message, err.field);
      submit.disabled = false;
      submit.textContent = '送出申請';
    }
  });
}
