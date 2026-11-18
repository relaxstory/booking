import { h } from '../../dom.ts';
import { durationLabel } from '../../time.ts';
import type { AdminApp } from '../app.ts';
import { adminApi, type AdminPasscode } from '../api.ts';
import { btn, tag } from './parts.ts';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1YApuRxavmAeYQuqVdBzMhsZwEjTBzAMJg1BuVnwKuQk/edit';

const PASSCODE_STATE: Record<AdminPasscode['state'], [string, string]> = {
  active: ['可使用', 'st-confirmed'],
  used: ['已使用', ''],
  expired: ['已過期', 'is-muted'],
};

export function renderSettings(app: AdminApp): HTMLElement {
  const d = app.data!;

  // 通關碼
  const fresh = app.lastPasscode;
  const copy = (code: string) => (e: MouseEvent) => {
    const b = e.currentTarget as HTMLButtonElement;
    navigator.clipboard?.writeText(code).then(
      () => (b.textContent = '已複製'),
      () => app.toast('無法複製，請手動選取', true),
    );
  };
  const gen = btn('產生通關碼', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    await app.act(b, async () => {
      app.lastPasscode = await adminApi.createPasscode();
    }, '已產生通關碼');
  }, 'primary-btn');

  const passcodes = h('section', { class: 'admin-section' },
    h('h2', null, '通關碼'),
    h('p', { class: 'hint' }, '一次性代碼，產生後 7 天內有效，不綁定日期。玩家登記滿人數包場時填入，可直接成立預約。'),
    h('div', { class: 'card-actions' }, gen),
    fresh && h('div', { class: 'passcode-new' },
      h('span', { class: 'mono passcode-code' }, fresh.code),
      h('span', { class: 'hint' }, `有效至 ${fresh.expires_at.slice(0, 16)}`),
      btn('複製', copy(fresh.code)),
    ),
    d.passcodes.length
      ? h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, '代碼'), h('th', null, '建立'), h('th', null, '到期'), h('th', null, '狀態'))),
          h('tbody', null, d.passcodes.map((p) => {
            const [label, cls] = PASSCODE_STATE[p.state];
            return h('tr', { class: p.state === 'active' ? '' : 'is-muted' },
              h('td', { class: 'mono' }, p.code),
              h('td', null, p.created_at.slice(5, 16)),
              h('td', null, p.expires_at.slice(5, 16)),
              h('td', null, tag(p.state === 'used' ? `已使用 ${p.used_at.slice(5, 16)}` : label, cls)),
            );
          })),
        )
      : h('p', { class: 'empty' }, '尚未產生過通關碼。'),
  );

  // 劇本上下架
  const scripts = h('section', { class: 'admin-section' },
    h('h2', null, '劇本上下架'),
    h('p', { class: 'hint' }, '劇本名稱、人數、時長、價格請在 ', h('a', { href: SHEET_URL, target: '_blank', rel: 'noopener' }, 'Google Sheet'),
      ' 的 scripts 工作表編輯。下架的劇本不會出現在前台選單，已存在的場次不受影響；後台仍可安排。'),
    h('div', { class: 'script-list' },
      d.scripts.map((s) => {
        const toggle = h('input', { type: 'checkbox', role: 'switch', checked: s.active, 'aria-label': `${s.name} 上架` });
        toggle.addEventListener('change', async () => {
          toggle.disabled = true;
          const ok = await app.act(null, () => adminApi.toggleScript(s.id, toggle.checked), toggle.checked ? `已上架「${s.name}」` : `已下架「${s.name}」`);
          if (!ok) {
            toggle.checked = !toggle.checked;
            toggle.disabled = false;
          }
        });
        const gender = s.male !== null && s.female !== null ? `・${s.male}男${s.female}女` : '';
        const price = s.price !== null ? `・$${s.price}/人` : '';
        return h('label', { class: `script-row${s.active ? '' : ' is-off'}` },
          h('span', { class: 'script-info' },
            h('strong', null, s.name),
            h('span', { class: 'hint' }, `${s.players}人・${durationLabel(s.duration_min)}${gender}${price}`),
          ),
          h('span', { class: 'switch' }, toggle, h('span', { class: 'switch-label' }, s.active ? '上架' : '下架')),
        );
      }),
    ),
  );

  const admins = h('section', { class: 'admin-section' },
    h('h2', null, '管理者'),
    h('p', { class: 'hint' }, '可登入後台的 Google 帳號請在 ', h('a', { href: SHEET_URL, target: '_blank', rel: 'noopener' }, 'Google Sheet'),
      ' 的 admins 工作表新增（email、名稱、active 填 TRUE）。停用請把 active 改為 FALSE，會立即失去權限。'),
  );

  return h('div', { class: 'settings' }, passcodes, scripts, admins);
}
