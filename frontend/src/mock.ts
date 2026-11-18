// 開發用假資料：只在 `npm run dev` 且網址帶 ?mock 時使用，不會打包進正式網站。
import { dayNum, dayStr, minToHm } from './time.ts';

const today = dayNum(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()));
const at = (dayOffset: number, hm: string) => `${dayStr(today + dayOffset)} ${hm}`;

function rules() {
  const t = new Date(today * 86400000);
  const max = Math.round(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 7, 0) / 86400000);
  return { min_date: dayStr(today + 1), max_date: dayStr(max), earliest_start: '09:00', latest_start: '19:00', slot_minutes: 30 };
}

const scripts = [
  { id: 's1', name: '霧港來信', players: 6, duration_min: 240, male: 3, female: 3, price: 600 },
  { id: 's2', name: '第七號房', players: 4, duration_min: 180, male: 2, female: 2, price: 500 },
  { id: 's3', name: '長夜將明', players: 7, duration_min: 330, male: 4, female: 3, price: 750 },
];

const blocks = [
  { kind: 'session', type: 'private', status: 'booked', script_name: '霧港來信', start_at: at(1, '13:00'), end_at: at(1, '17:00') },
  { kind: 'session', type: 'private', status: 'pending', script_name: '第七號房', start_at: at(1, '18:00'), end_at: at(1, '21:00') },
  {
    kind: 'session', type: 'group', status: 'recruiting', script_name: '霧港來信', start_at: at(2, '14:00'), end_at: at(2, '18:00'),
    id: 'g1', players: 6, joined: 2, missing_male: 2, missing_female: 2, host_nickname: '阿明',
  },
  { kind: 'session', type: 'private', status: 'booked', script_name: '長夜將明', start_at: at(3, '19:00'), end_at: at(4, '00:30') },
  { kind: 'closure', start_at: at(4, '09:00'), end_at: at(4, '13:00') },
  { kind: 'closure', start_at: at(5, '00:00'), end_at: at(6, '00:00') },
];

export async function mockGet(action: string, params: Record<string, string>): Promise<object> {
  await new Promise((r) => setTimeout(r, 400));
  if (action === 'scripts') return { ok: true, scripts, rules: rules() };
  if (action === 'schedule') {
    const from = dayNum(params.from) * 1440;
    const to = (dayNum(params.to) + 1) * 1440;
    const abs = (s: string) => dayNum(s.slice(0, 10)) * 1440 + Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
    return { ok: true, blocks: blocks.filter((b) => abs(b.start_at) < to && from < abs(b.end_at)), rules: rules() };
  }
  return { ok: false, error: 'unknown_action', message: '未知的操作' };
}

export async function mockPost(body: Record<string, unknown>): Promise<object> {
  await new Promise((r) => setTimeout(r, 600));
  if (body.action === 'join') return { ok: true, status: 'applied' };
  const s = scripts.find((x) => x.id === body.script_id)!;
  if (body.name === 'conflict') return { ok: false, error: 'conflict', message: '此時段已有其他預約或不開放，請選擇其他時間' };
  if (body.passcode === 'BAD') return { ok: false, error: 'passcode_invalid', message: '通關碼無效、已使用或已過期', field: 'passcode' };
  const status = Number(body.count) < s.players ? 'group_pending' : body.passcode ? 'confirmed' : 'pending';
  return { ok: true, status, session_id: 'x', start_at: `${body.date} ${body.start}`, end_at: `${body.date} ${minToHm(0)}` };
}
