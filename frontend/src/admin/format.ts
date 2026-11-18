import type { AdminParticipant, AdminSession, ParticipantStatus, SessionStatus, SessionType } from './api.ts';
import { absOf, dateLabel, rangeLabel } from '../time.ts';

export const TYPE_LABEL: Record<SessionType, string> = { private: '包場', group: '拼場' };

export const STATUS_LABEL: Record<SessionStatus, string> = {
  pending: '待確認',
  confirmed: '已預約',
  group_pending: '拼團待確認',
  recruiting: '待拼團',
};

/** 對應前台時間表區塊的樣式 */
export const STATUS_CLASS: Record<SessionStatus, string> = {
  pending: 'block-pending',
  confirmed: 'block-booked',
  group_pending: 'block-group-pending',
  recruiting: 'block-recruiting',
};

export const PARTICIPANT_LABEL: Record<ParticipantStatus, string> = { joined: '已加入', applied: '申請中', rejected: '已拒絕' };

/** '11/20（五）14:00–18:00' */
export function whenLabel(x: { start_at: string; end_at: string }): string {
  const a = absOf(x.start_at);
  return `${dateLabel(Math.floor(a / 1440))} ${rangeLabel(a, absOf(x.end_at))}`;
}

/** '2/6・缺 男1 女3' */
export function headcount(s: AdminSession): string {
  const base = `${s.joined.count}/${s.players} 人`;
  if (s.type !== 'group') return base;
  const mm = s.script_male === null ? 0 : Math.max(0, s.script_male - s.joined.male);
  const mf = s.script_female === null ? 0 : Math.max(0, s.script_female - s.joined.female);
  const missing = [mm ? `男${mm}` : '', mf ? `女${mf}` : ''].filter(Boolean).join(' ');
  return missing ? `${base}・缺 ${missing}` : base;
}

export function host(s: AdminSession): AdminParticipant | undefined {
  return s.participants.find((p) => p.is_host) ?? s.participants[0];
}

export function peopleLabel(p: { count: number; male: number; female: number }): string {
  return `${p.count} 人（男 ${p.male}・女 ${p.female}）`;
}
