import { h } from '../../dom.ts';
import type { AdminParticipant, AdminSession } from '../api.ts';
import { PARTICIPANT_LABEL, STATUS_LABEL, TYPE_LABEL, headcount, peopleLabel, whenLabel } from '../format.ts';

export function tag(text: string, cls = ''): HTMLElement {
  return h('span', { class: `tag ${cls}` }, text);
}

export function statusTags(s: AdminSession): HTMLElement[] {
  return [tag(TYPE_LABEL[s.type], `type-${s.type}`), tag(STATUS_LABEL[s.status], `st-${s.status}`)];
}

/** 參與者的聯絡資料（電話、Email 可直接點選） */
export function contactInfo(p: AdminParticipant): HTMLElement {
  const row = (label: string, value: Node | string | false) => value && [h('dt', null, label), h('dd', null, value)];
  return h('dl', { class: 'contact' },
    row('姓名', p.name),
    row('電話', p.phone && h('a', { href: `tel:${p.phone.replace(/[^0-9+]/g, '')}` }, p.phone)),
    row('Email', p.email && h('a', { href: `mailto:${p.email}` }, p.email)),
    row('LINE', p.line_id),
    row('IG', p.ig),
    row('人數', peopleLabel(p)),
    row('備註', p.note),
  );
}

export function participantHead(p: AdminParticipant): HTMLElement {
  return h('div', { class: 'person-head' },
    h('strong', null, p.nickname || p.name || '（已清除）'),
    p.is_host && tag('主揪', 'host'),
    p.status !== 'joined' && tag(PARTICIPANT_LABEL[p.status], `pt-${p.status}`),
  );
}

/** 場次摘要卡片 */
export function sessionCard(s: AdminSession, opts: { onOpen: () => void; actions?: HTMLElement[]; body?: Node[] }): HTMLElement {
  const host = s.participants.find((p) => p.is_host) ?? s.participants[0];
  return h('article', { class: `card${s.conflict ? ' has-conflict' : ''}` },
    h('div', { class: 'card-head' },
      h('div', { class: 'tags' }, statusTags(s)),
      h('button', { class: 'text-btn', type: 'button', onclick: opts.onOpen }, '詳細 ›'),
    ),
    h('h3', { class: 'card-title' }, s.script_name),
    h('p', { class: 'card-when' }, whenLabel(s), h('span', { class: 'muted' }, `・${headcount(s)}`)),
    s.conflict && h('p', { class: 'warn' }, '⚠ 此時段已有其他場次或不開放，無法確認；請改時間或拒絕。'),
    opts.body ?? (host && [participantHead(host), contactInfo(host)]),
    s.admin_note && h('p', { class: 'admin-note' }, '後台備註：', s.admin_note),
    opts.actions && opts.actions.length > 0 && h('div', { class: 'card-actions' }, opts.actions),
  );
}

export function btn(label: string, onClick: (ev: MouseEvent) => void, cls = 'secondary-btn', disabled = false): HTMLButtonElement {
  return h('button', { class: cls, type: 'button', disabled, onclick: onClick }, label);
}

export function section(title: string, hint: string, items: HTMLElement[], empty: string): HTMLElement {
  return h('section', { class: 'admin-section' },
    h('h2', null, title, items.length > 0 && h('span', { class: 'count' }, items.length)),
    hint && h('p', { class: 'hint' }, hint),
    items.length ? h('div', { class: 'cards' }, items) : h('p', { class: 'empty' }, empty),
  );
}
