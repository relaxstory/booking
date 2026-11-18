import { API_URL } from './config.ts';

export interface Rules {
  min_date: string;
  max_date: string;
  earliest_start: string;
  latest_start: string;
  slot_minutes: number;
}

export interface Script {
  id: string;
  name: string;
  players: number;
  duration_min: number;
  male: number | null;
  female: number | null;
  price: number | null;
}

export interface SessionBlock {
  kind: 'session';
  type: 'private' | 'group';
  status: 'pending' | 'booked' | 'recruiting';
  script_name: string;
  start_at: string;
  end_at: string;
  // 僅待拼團
  id?: string;
  players?: number;
  joined?: number;
  missing_male?: number;
  missing_female?: number;
  host_nickname?: string;
}

export interface ClosureBlock {
  kind: 'closure';
  start_at: string;
  end_at: string;
}

export type Block = SessionBlock | ClosureBlock;

export interface Contact {
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
  website: string; // 陷阱欄位
}

export interface BookRequest extends Contact {
  script_id: string;
  date: string;
  start: string;
  passcode?: string;
}

export type BookStatus = 'confirmed' | 'pending' | 'group_pending' | 'received';

export class ApiError extends Error {
  code: string;
  field?: string;
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

async function parse<T>(res: Promise<Response>): Promise<T> {
  let data: { ok: boolean; error?: string; message?: string; field?: string };
  try {
    const r = await res;
    data = await r.json();
  } catch {
    throw new ApiError('network', '無法連線到伺服器，請檢查網路後再試一次');
  }
  if (!data.ok) throw new ApiError(data.error ?? 'unknown', data.message ?? '發生錯誤，請稍後再試', data.field);
  return data as T;
}

/** 開發時網址帶 ?mock 使用假資料（正式建置時 import.meta.env.DEV 為 false，整段會被移除） */
const MOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');

function mockResponse(p: Promise<object>): Promise<Response> {
  return p.then((d) => new Response(JSON.stringify(d)));
}

function get<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  if (MOCK) return parse<T>(mockResponse(import('./mock.ts').then((m) => m.mockGet(action, params))));
  const q = new URLSearchParams({ action, ...params });
  return parse<T>(fetch(`${API_URL}?${q}`));
}

function post<T>(body: object): Promise<T> {
  if (MOCK) return parse<T>(mockResponse(import('./mock.ts').then((m) => m.mockPost(body as Record<string, unknown>))));
  // text/plain 為「簡單請求」，不觸發 CORS preflight（Apps Script 不支援 OPTIONS）
  return parse<T>(fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }));
}

export const api = {
  scripts: () => get<{ scripts: Script[]; rules: Rules }>('scripts'),
  schedule: (from: string, to: string) => get<{ blocks: Block[]; rules: Rules }>('schedule', { from, to }),
  book: (req: BookRequest) => post<{ status: BookStatus; session_id?: string; start_at?: string; end_at?: string }>({ action: 'book', ...req }),
  join: (sessionId: string, contact: Contact) => post<{ status: 'applied' | 'received' }>({ action: 'join', session_id: sessionId, ...contact }),
};
