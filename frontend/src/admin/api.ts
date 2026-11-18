import { API_URL } from '../config.ts';
import { ApiError, parse, type Contact, type Rules, type Script } from '../api.ts';

export type SessionType = 'private' | 'group';
export type SessionStatus = 'pending' | 'confirmed' | 'group_pending' | 'recruiting';
export type ParticipantStatus = 'joined' | 'applied' | 'rejected';

export interface AdminParticipant {
  id: string;
  session_id: string;
  status: ParticipantStatus;
  is_host: boolean;
  name: string;
  nickname: string;
  phone: string;
  email: string;
  line_id: string;
  ig: string;
  note: string;
  count: number;
  male: number;
  female: number;
  created_at: string;
}

export interface AdminSession {
  id: string;
  type: SessionType;
  status: SessionStatus;
  script_id: string;
  script_name: string;
  players: number;
  script_male: number | null;
  script_female: number | null;
  start_at: string;
  end_at: string;
  passcode: string;
  created_at: string;
  updated_at: string;
  admin_note: string;
  participants: AdminParticipant[];
  joined: { count: number; male: number; female: number };
  conflict: boolean;
}

export interface AdminClosure {
  id: string;
  start_at: string;
  end_at: string;
  note: string;
}

export interface AdminPasscode {
  code: string;
  created_at: string;
  expires_at: string;
  used_at: string;
  session_id: string;
  state: 'active' | 'used' | 'expired';
}

export interface AdminScript extends Script {
  active: boolean;
}

export interface AdminData {
  from: string;
  to: string;
  now: string;
  today: string;
  me: { email: string; name: string };
  scripts: AdminScript[];
  sessions: AdminSession[];
  closures: AdminClosure[];
  passcodes: AdminPasscode[];
  rules: Rules;
}

export type ContactInput = Omit<Contact, 'website'>;

/** 開發時網址帶 ?mock：在瀏覽器內執行後端程式碼（不會打包進正式網站） */
export const MOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');

/* ───────── 登入憑證（存在此瀏覽器，6 小時內有效） ───────── */

interface Stored {
  token: string;
  email: string;
  name: string;
  expires: number;
}

const KEY = 'relax-admin-session';

export const auth = {
  get(): Stored | null {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
      return s && s.expires > Date.now() ? s : null;
    } catch {
      return null;
    }
  },
  set(s: Stored): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* 無法儲存時本次仍可使用 */
    }
    memory = s;
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 略過 */
    }
    memory = null;
  },
  token(): string {
    return (this.get() ?? memory)?.token ?? '';
  },
};
let memory: Stored | null = null;

let onUnauthorized: (message: string) => void = () => {};
export function setUnauthorizedHandler(fn: (message: string) => void): void {
  onUnauthorized = fn;
}

function send(payload: object): Promise<Response> {
  if (MOCK) return import('./mock.ts').then(async (m) => new Response(JSON.stringify(await m.mockAdminPost(payload))));
  // text/plain 為「簡單請求」，不觸發 CORS preflight
  return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
}

async function call<T = { ok: true }>(action: string, body: object = {}): Promise<T> {
  try {
    return await parse<T>(send({ action, token: auth.token(), ...body }));
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'unauthorized' || e.code === 'forbidden') && action !== 'admin_login') {
      auth.clear();
      onUnauthorized(e.message);
    }
    throw e;
  }
}

export interface SessionInput {
  script_id: string;
  date: string;
  start: string;
  admin_note: string;
}

export const adminApi = {
  login: (idToken: string) => call<{ token: string; email: string; name: string; expires_in: number }>('admin_login', { id_token: idToken }),
  logout: () => call('admin_logout'),
  load: (from: string, to: string) => call<AdminData>('admin_load', { from, to }),

  confirm: (id: string) => call('admin_confirm', { session_id: id }),
  reject: (id: string) => call('admin_reject', { session_id: id }),
  cancel: (id: string) => call('admin_cancel', { session_id: id }),
  finalize: (id: string) => call('admin_finalize', { session_id: id }),
  createSession: (type: SessionType, s: SessionInput, host: ContactInput) => call('admin_create_session', { type, ...s, host }),
  updateSession: (id: string, s: SessionInput) => call('admin_update_session', { session_id: id, ...s }),

  addParticipant: (sessionId: string, contact: ContactInput) => call('admin_add_participant', { session_id: sessionId, contact }),
  updateParticipant: (id: string, contact: ContactInput) => call('admin_update_participant', { participant_id: id, contact }),
  setHost: (id: string) => call('admin_set_host', { participant_id: id }),
  removeParticipant: (id: string) => call('admin_remove_participant', { participant_id: id }),
  approveApplication: (id: string) => call('admin_approve_application', { participant_id: id }),
  rejectApplication: (id: string) => call('admin_reject_application', { participant_id: id }),

  createClosure: (start_at: string, end_at: string, note: string) => call('admin_closure_create', { start_at, end_at, note }),
  deleteClosure: (id: string) => call('admin_closure_delete', { closure_id: id }),
  createPasscode: () => call<{ code: string; expires_at: string }>('admin_passcode_create'),
  toggleScript: (id: string, active: boolean) => call('admin_script_toggle', { script_id: id, active }),
};
