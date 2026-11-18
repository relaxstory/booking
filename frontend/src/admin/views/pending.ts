import { h } from '../../dom.ts';
import type { AdminApp } from '../app.ts';
import { adminApi, type AdminData, type AdminParticipant, type AdminSession } from '../api.ts';
import { headcount, whenLabel } from '../format.ts';
import { openSession } from './session.ts';
import { btn, contactInfo, participantHead, section, sessionCard } from './parts.ts';

function applications(d: AdminData): { s: AdminSession; p: AdminParticipant }[] {
  return d.sessions
    .filter((s) => s.status === 'recruiting')
    .flatMap((s) => s.participants.filter((p) => p.status === 'applied').map((p) => ({ s, p })));
}

/** 需要處理的項目數：包場待確認、拼團待確認、加入申請 */
export function pendingCount(d: AdminData): number {
  return d.sessions.filter((s) => s.status === 'pending' || s.status === 'group_pending').length + applications(d).length;
}

export function renderPending(app: AdminApp): HTMLElement {
  const d = app.data!;
  const open = (s: AdminSession) => () => openSession(app, s.id);
  const sessions = (status: AdminSession['status']) => d.sessions.filter((s) => s.status === status);

  const pending = sessions('pending').map((s) =>
    sessionCard(s, {
      onOpen: open(s),
      actions: [
        btn('確認預約', (e) => void app.act(e.currentTarget as HTMLButtonElement, () => adminApi.confirm(s.id), '已確認預約'), 'primary-btn'),
        btn('拒絕', (e) => void app.act(e.currentTarget as HTMLButtonElement, () => adminApi.reject(s.id), '已拒絕',
          `確定拒絕「${s.script_name}」${whenLabel(s)} 的包場登記？\n時段會釋出，並寄信通知登記者。`), 'danger-btn'),
      ],
    }));

  const groupPending = sessions('group_pending').map((s) =>
    sessionCard(s, {
      onOpen: open(s),
      actions: [
        btn('確認，公開招募', (e) => void app.act(e.currentTarget as HTMLButtonElement, () => adminApi.confirm(s.id), '已公開招募'), 'primary-btn', s.conflict),
        btn('改時間', open(s)),
        btn('拒絕', (e) => void app.act(e.currentTarget as HTMLButtonElement, () => adminApi.reject(s.id), '已拒絕',
          `確定拒絕「${s.script_name}」${whenLabel(s)} 的拼團登記？\n會寄信通知主揪。`), 'danger-btn'),
      ],
    }));

  const apps = applications(d).map(({ s, p }) => {
    const remaining = s.players - s.joined.count;
    const over = p.count > remaining;
    return h('article', { class: 'card' },
      h('div', { class: 'card-head' },
        h('p', { class: 'card-when' }, h('strong', null, s.script_name), ' ', whenLabel(s), h('span', { class: 'muted' }, `・${headcount(s)}`)),
        h('button', { class: 'text-btn', type: 'button', onclick: open(s) }, '場次 ›'),
      ),
      participantHead(p),
      contactInfo(p),
      over && h('p', { class: 'warn' }, `⚠ 剩 ${Math.max(0, remaining)} 個名額，人數不足以核准。可先在場次中調整人數。`),
      h('div', { class: 'card-actions' },
        btn('核准加入', (e) => void app.act(e.currentTarget as HTMLButtonElement, () => adminApi.approveApplication(p.id), '已核准加入'), 'primary-btn', over),
        btn('拒絕', (e) => void app.act(e.currentTarget as HTMLButtonElement, () => adminApi.rejectApplication(p.id), '已拒絕申請',
          `確定拒絕「${p.nickname}」的加入申請？會寄信通知申請者。`), 'danger-btn'),
      ),
    );
  });

  const recruiting = sessions('recruiting').map((s) =>
    sessionCard(s, {
      onOpen: open(s),
      actions: [
        btn('成團（改為已預約）', (e) => void app.act(e.currentTarget as HTMLButtonElement, () => adminApi.finalize(s.id), '已成團',
          `確定「${s.script_name}」${whenLabel(s)} 成團？\n目前 ${headcount(s)}，會寄信通知所有參與者。`), 'primary-btn'),
        btn('管理參與者', open(s)),
      ],
    }));

  return h('div', { class: 'pending' },
    section('包場待確認', '時段已先保留。確認後寄出預約成立通知。', pending, '目前沒有待確認的包場。'),
    section('拼團待確認', '尚未佔用時段、前台看不到。確認後公開招募；與其他場次重疊時需先改時間或拒絕。', groupPending, '目前沒有待確認的拼團。'),
    section('加入申請', '核准後計入場次人數。', apps, '目前沒有加入申請。'),
    section('拼團中', '人數湊齊後按「成團」改為已預約；拼團失敗可在詳細頁取消。', recruiting, '目前沒有招募中的拼團。'),
  );
}
