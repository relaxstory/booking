import { ApiError } from '../../api.ts';
import { h } from '../../dom.ts';
import { dayNum, dayStr, minToHm } from '../../time.ts';
import { clearErrors, field, input, openDialog, showError, val } from '../../views/form.ts';
import type { AdminApp } from '../app.ts';
import { adminApi, type AdminClosure } from '../api.ts';
import { whenLabel } from '../format.ts';

/** 關閉時段詳細：備註與刪除 */
export function openClosure(app: AdminApp, c: AdminClosure): void {
  const { dialog, body } = openDialog('關閉時段');
  const del = h('button', { class: 'danger-btn', type: 'button' }, '刪除此關閉時段');
  del.addEventListener('click', async () => {
    if (await app.act(del, () => adminApi.deleteClosure(c.id), '已刪除關閉時段', `確定刪除 ${whenLabel(c)} 的關閉時段？此時段會重新開放預約。`)) dialog.close();
  });
  body.append(
    h('dl', { class: 'summary' },
      h('dt', null, '時間'), h('dd', null, whenLabel(c)),
      h('dt', null, '備註'), h('dd', null, c.note || '（無）'),
    ),
    h('p', { class: 'hint' }, '前台只顯示「不開放」，不會顯示備註。'),
    h('div', { class: 'card-actions' }, del),
  );
}

/** 新增關閉時段 */
export function openClosureForm(app: AdminApp, prefill: { day: number; start?: number }): void {
  const { dialog, body } = openDialog('新增關閉時段');
  const start = prefill.start ?? 9 * 60;
  const endAbs = prefill.start === undefined ? prefill.day * 1440 + 23 * 60 : prefill.day * 1440 + start + 120;
  const timeIn = (value: string) => input({ type: 'time', step: 1800, value });
  const submit = h('button', { class: 'primary-btn wide', type: 'submit' }, '新增');
  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'form-error', role: 'alert' }),
    h('div', { class: 'row-2' },
      field('start_date', '開始日期', input({ type: 'date', value: dayStr(prefill.day) }), { required: true }),
      field('start_time', '開始時間', timeIn(minToHm(start)), { required: true }),
    ),
    h('div', { class: 'row-2' },
      field('end_date', '結束日期', input({ type: 'date', value: dayStr(Math.floor(endAbs / 1440)) }), { required: true }),
      field('end_time', '結束時間', timeIn(minToHm(endAbs % 1440)), { required: true }),
    ),
    field('note', '備註', h('textarea', { rows: 2, maxlength: 500 }), { hint: '僅後台可見；前台只顯示「不開放」' }),
    h('p', { class: 'hint' }, '不可與既有場次重疊。'),
    submit,
  );
  body.append(form);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors(form);
    const [sd, st, ed, et] = ['start_date', 'start_time', 'end_date', 'end_time'].map((k) => val(form, k));
    if (!sd || !st) return showError(form, '請填寫開始時間', !sd ? 'start_date' : 'start_time');
    if (!ed || !et) return showError(form, '請填寫結束時間', !ed ? 'end_date' : 'end_time');
    if (`${ed} ${et}` <= `${sd} ${st}`) return showError(form, '結束時間需晚於開始時間', 'end_time');
    if (dayNum(sd) < app.today) return showError(form, '不可早於今天', 'start_date');
    submit.disabled = true;
    submit.textContent = '處理中…';
    try {
      await adminApi.createClosure(`${sd} ${st}`, `${ed} ${et}`, val(form, 'note'));
      app.toast('已新增關閉時段');
      await app.reload();
      dialog.close();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('unknown', '發生錯誤，請稍後再試');
      showError(form, err.message, err.field === 'start_at' ? 'start_time' : err.field === 'end_at' ? 'end_time' : undefined);
      submit.disabled = false;
      submit.textContent = '新增';
    }
  });
}
