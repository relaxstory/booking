import type { Contact } from '../api.ts';
import { h } from '../dom.ts';

let uid = 0;
const nextId = (name: string) => `f-${name}-${++uid}`;

/** 以 <dialog> 開啟的表單面板；手機上為底部滑出的全寬面板 */
export function openDialog(title: string): { dialog: HTMLDialogElement; body: HTMLElement; setTitle(t: string): void } {
  const titleId = nextId('title');
  const heading = h('h2', { id: titleId }, title);
  const body = h('div', { class: 'sheet-body' });
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-head' },
      heading,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '關閉', onclick: () => dialog.close() }, '✕'),
    ),
    body,
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, setTitle: (t) => (heading.textContent = t) };
}

export function field(name: string, label: string, control: HTMLElement, opts: { hint?: string; required?: boolean } = {}): HTMLElement {
  const id = control.id || nextId(name);
  control.id = id;
  control.setAttribute('name', name);
  const err = h('p', { class: 'field-error', id: `${id}-err`, 'aria-live': 'polite' });
  control.setAttribute('aria-describedby', `${id}-err`);
  return h('div', { class: 'field', 'data-field': name },
    h('label', { for: id }, label, opts.required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
    control,
    opts.hint && h('p', { class: 'hint' }, opts.hint),
    err,
  );
}

export function input(attrs: Record<string, unknown>): HTMLInputElement {
  return h('input', { type: 'text', autocomplete: 'off', ...attrs });
}

export function numberInput(min: number, max: number, value: number): HTMLInputElement {
  return h('input', { type: 'number', inputmode: 'numeric', min, max, step: 1, value, class: 'num' });
}

export function val(form: HTMLElement, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  return el ? el.value.trim() : '';
}

export function num(form: HTMLElement, name: string): number {
  const v = val(form, name);
  return v === '' ? NaN : Number(v);
}

export function clearErrors(form: HTMLElement): void {
  form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  const box = form.querySelector('.form-error');
  if (box) box.textContent = '';
}

/** 標示欄位錯誤；找不到欄位時顯示在表單頂端 */
export function showError(form: HTMLElement, message: string, fieldName?: string): void {
  const wrap = fieldName ? form.querySelector<HTMLElement>(`[data-field="${fieldName}"]`) : null;
  if (wrap) {
    wrap.classList.add('has-error');
    wrap.querySelector('.field-error')!.textContent = message;
    wrap.querySelector<HTMLElement>('input, select, textarea')?.focus();
  } else {
    const box = form.querySelector<HTMLElement>('.form-error');
    if (box) {
      box.textContent = message;
      box.scrollIntoView({ block: 'nearest' });
    }
  }
}

/** 聯絡資料欄位 */
export function contactFields(nicknameHint = '登記拼團時，會以主揪身分公開顯示在時間表上'): HTMLElement {
  return h('fieldset', { class: 'group' },
    h('legend', null, '聯絡資料'),
    field('name', '姓名', input({ autocomplete: 'name', maxlength: 50, required: true }), { required: true, hint: '不公開，僅店家可見' }),
    field('nickname', '暱稱', input({ autocomplete: 'nickname', maxlength: 30, required: true }), { required: true, hint: nicknameHint }),
    field('phone', '電話', input({ type: 'tel', autocomplete: 'tel', maxlength: 20, required: true }), { required: true }),
    field('email', 'Email', input({ type: 'email', autocomplete: 'email', maxlength: 100, required: true }), { required: true, hint: '預約確認與通知會寄到這裡' }),
    h('div', { class: 'row-2' },
      field('line_id', 'LINE ID', input({ maxlength: 50 })),
      field('ig', 'IG 帳號', input({ maxlength: 50 })),
    ),
    h('p', { class: 'hint' }, 'LINE ID 與 IG 帳號請至少填寫一項。'),
    field('note', '備註', h('textarea', { rows: 2, maxlength: 500 })),
  );
}

/** 人數欄位（總人數、男、女） */
export function peopleFields(max: number, initial: number): HTMLElement {
  return h('div', { class: 'row-3' },
    field('count', '人數', numberInput(1, max, initial), { required: true }),
    field('male', '男', numberInput(0, max, 0), { required: true }),
    field('female', '女', numberInput(0, max, 0), { required: true }),
  );
}

export function consentField(): HTMLElement {
  return h('div', { class: 'field consent', 'data-field': 'consent' },
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', name: 'consent' }),
      ' 我已閱讀並同意',
      h('a', { href: '#/privacy', target: '_blank' }, '隱私權聲明'),
    ),
    h('p', { class: 'field-error', 'aria-live': 'polite' }),
  );
}

/** 陷阱欄位：畫面上看不到，機器人會填 */
export function honeypot(): HTMLElement {
  return h('div', { class: 'hp', 'aria-hidden': 'true' },
    h('label', null, 'Website', h('input', { type: 'text', name: 'website', tabindex: -1, autocomplete: 'off' })),
  );
}

/** 讀取並檢查聯絡資料與人數（與後端規則一致）；有錯回傳 null 並標示 */
export function readContact(form: HTMLElement, opts: { consent?: boolean } = {}): Contact | null {
  const c: Contact = {
    name: val(form, 'name'),
    nickname: val(form, 'nickname'),
    phone: val(form, 'phone'),
    email: val(form, 'email'),
    line_id: val(form, 'line_id'),
    ig: val(form, 'ig'),
    note: val(form, 'note'),
    count: num(form, 'count'),
    male: num(form, 'male'),
    female: num(form, 'female'),
    website: val(form, 'website'),
  };
  const errors: [string, string][] = [];
  if (!Number.isInteger(c.count) || c.count < 1) errors.push(['count', '請填寫人數']);
  if (!Number.isInteger(c.male) || c.male < 0) errors.push(['male', '請填寫男性人數']);
  if (!Number.isInteger(c.female) || c.female < 0) errors.push(['female', '請填寫女性人數']);
  if (!errors.length && c.male + c.female !== c.count) errors.push(['male', '男女人數加總需等於總人數']);
  if (!c.name) errors.push(['name', '請填寫姓名']);
  if (!c.nickname) errors.push(['nickname', '請填寫暱稱']);
  if (!/^[0-9+\-() ]{8,20}$/.test(c.phone)) errors.push(['phone', c.phone ? '電話格式錯誤' : '請填寫電話']);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push(['email', c.email ? 'Email 格式錯誤' : '請填寫 Email']);
  if (!c.line_id && !c.ig) errors.push(['line_id', 'LINE ID 與 IG 帳號請至少填寫一項']);
  if (opts.consent !== false && !form.querySelector<HTMLInputElement>('[name="consent"]')?.checked) errors.push(['consent', '請勾選同意隱私權聲明']);
  // 由下往上標示，最後聚焦在第一個錯誤
  for (const [f, m] of errors.reverse()) showError(form, m, f);
  return errors.length ? null : c;
}
