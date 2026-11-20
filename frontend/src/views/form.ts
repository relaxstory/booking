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
    field('nickname', '暱稱', input({ autocomplete: 'nickname', maxlength: 30, required: true }), { required: true, hint: nicknameHint }),
    field('email', 'Email', input({ type: 'email', autocomplete: 'email', maxlength: 100, required: true }), { required: true, hint: '用於寄送預約確認信與後續通知（不公開）' }),
    h('p', { class: 'hint contact-note' }, h('strong', null, 'LINE 或 IG 是我們主要的聯繫方式'), '，請至少填寫一項（不公開）。'),
    h('div', { class: 'row-2' },
      field('line_id', 'LINE ID', input({ maxlength: 50 })),
      field('ig', 'IG 帳號', input({ maxlength: 50 })),
    ),
    field('note', '備註', h('textarea', { rows: 2, maxlength: 500 })),
  );
}

/** 人數欄位：只填男、女人數，總人數自動加總顯示（showTotal: false 時由呼叫端自行顯示，例如登記表單的包場／拼團說明） */
export function peopleFields(max: number, opts: { showTotal?: boolean } = {}): HTMLElement {
  const total = h('p', { class: 'people-total', 'aria-live': 'polite', hidden: opts.showTotal === false });
  const wrap = h('div', { class: 'people' },
    h('div', { class: 'row-2' },
      field('male', '男', numberInput(0, max, 0), { required: true }),
      field('female', '女', numberInput(0, max, 0), { required: true }),
    ),
    total,
  );
  const update = () => {
    const n = peopleCount(wrap);
    total.textContent = n > 0 ? `共 ${n} 人` : '請填寫男女人數';
  };
  wrap.addEventListener('input', update);
  update();
  return wrap;
}

/** 目前填寫的總人數（男 + 女；未填視為 0） */
export function peopleCount(form: HTMLElement): number {
  const m = num(form, 'male');
  const f = num(form, 'female');
  return (Number.isInteger(m) && m > 0 ? m : 0) + (Number.isInteger(f) && f > 0 ? f : 0);
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
  const male = num(form, 'male');
  const female = num(form, 'female');
  const c: Contact = {
    nickname: val(form, 'nickname'),
    email: val(form, 'email'),
    line_id: val(form, 'line_id'),
    ig: val(form, 'ig'),
    note: val(form, 'note'),
    count: (Number.isInteger(male) ? male : 0) + (Number.isInteger(female) ? female : 0),
    male,
    female,
    website: val(form, 'website'),
  };
  const errors: [string, string][] = [];
  if (!Number.isInteger(c.male) || c.male < 0) errors.push(['male', '請填寫男性人數']);
  if (!Number.isInteger(c.female) || c.female < 0) errors.push(['female', '請填寫女性人數']);
  if (!errors.length && c.count < 1) errors.push(['male', '請填寫男女人數（至少 1 人）']);
  if (!c.nickname) errors.push(['nickname', '請填寫暱稱']);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push(['email', c.email ? 'Email 格式錯誤' : '請填寫 Email']);
  if (!c.line_id && !c.ig) errors.push(['line_id', 'LINE 或 IG 是主要聯繫方式，請至少填寫一項']);
  if (opts.consent !== false && !form.querySelector<HTMLInputElement>('[name="consent"]')?.checked) errors.push(['consent', '請勾選同意隱私權聲明']);
  // 由下往上標示，最後聚焦在第一個錯誤
  for (const [f, m] of errors.reverse()) showError(form, m, f);
  return errors.length ? null : c;
}
