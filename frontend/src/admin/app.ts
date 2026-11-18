import { ApiError } from '../api.ts';
import { clear, h } from '../dom.ts';
import { dayNum, dayStr, mondayOf } from '../time.ts';
import type { Timed } from '../layout.ts';
import { adminApi, auth, MOCK, setUnauthorizedHandler, type AdminData, type SessionStatus } from './api.ts';
import { forgetGoogleAccount, renderLogin } from './login.ts';
import { renderCalendar } from './views/calendar.ts';
import { renderPending, pendingCount } from './views/pending.ts';
import { renderSettings } from './views/settings.ts';

export type Tab = 'pending' | 'calendar' | 'settings';

/** 佔用時段的場次狀態（與後端相同） */
export const OCCUPYING: SessionStatus[] = ['pending', 'confirmed', 'recruiting'];
const TABS: [Tab, string][] = [
  ['pending', '待處理'],
  ['calendar', '時間表'],
  ['settings', '通關碼與劇本'],
];

export class AdminApp {
  data: AdminData | null = null;
  /** 剛產生的通關碼（顯示在「通關碼」區） */
  lastPasscode: { code: string; expires_at: string } | null = null;
  tab: Tab = 'pending';
  calMode: 'week' | 'month' = 'week';
  /** 週檢視：該週週一；月檢視：該月 1 日 */
  anchor = 0;
  selectedDay = 0;
  today = dayNum(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()));

  private main!: HTMLElement;
  private nav!: HTMLElement;
  private who!: HTMLElement;
  private toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  private toastTimer = 0;
  private loadToken = 0;
  private booted = false;

  constructor(private root: HTMLElement) {}

  start(): void {
    this.anchor = mondayOf(this.today);
    this.selectedDay = this.today;
    this.readHash();
    setUnauthorizedHandler((msg) => this.showLogin(msg));
    window.addEventListener('hashchange', () => {
      this.readHash();
      document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
      window.scrollTo(0, 0);
      if (this.booted) this.render();
    });
    if (auth.get()) this.boot();
    else this.showLogin();
  }

  private readHash(): void {
    const t = location.hash.replace('#/', '') as Tab;
    this.tab = TABS.some(([k]) => k === t) ? t : 'pending';
  }

  showLogin(message = ''): void {
    this.booted = false;
    this.data = null;
    document.title = '後台登入｜Re:LAX Story Lab';
    renderLogin(this.root, async (idToken) => {
      const r = await adminApi.login(idToken);
      auth.set({ token: r.token, email: r.email, name: r.name, expires: Date.now() + (r.expires_in - 60) * 1000 });
      this.boot();
    }, message);
  }

  private boot(): void {
    this.booted = true;
    document.title = '後台｜Re:LAX Story Lab';
    clear(this.root);
    this.nav = h('nav', { class: 'admin-tabs wrap', 'aria-label': '後台功能' });
    this.who = h('span', { class: 'who' }, auth.get()?.name ?? '');
    this.main = h('main', { id: 'main' }, h('p', { class: 'loading' }, '載入中…'));
    this.root.append(
      h('header', { class: 'site-header' },
        h('div', { class: 'wrap admin-header' },
          h('a', { class: 'brand', href: '#/pending' },
            h('span', { class: 'brand-name' }, 'Re:LAX Story Lab'),
            h('span', { class: 'brand-tag' }, MOCK ? '後台（模擬資料）' : '後台'),
          ),
          h('div', { class: 'admin-user' },
            this.who,
            h('a', { class: 'text-btn', href: './', target: '_blank', rel: 'noopener' }, '前台'),
            h('button', { class: 'text-btn', type: 'button', onclick: () => void this.logout() }, '登出'),
          ),
        ),
        this.nav,
      ),
      this.main,
      this.toastEl,
    );
    void this.reload();
  }

  async logout(): Promise<void> {
    await adminApi.logout().catch(() => {});
    auth.clear();
    forgetGoogleAccount();
    this.showLogin('已登出。');
  }

  /** 目前時間表檢視需要的日期範圍 */
  range(): [number, number] {
    if (this.calMode === 'week') return [this.anchor - 1, this.anchor + 7];
    const start = mondayOf(this.anchor);
    return [start, start + 41];
  }

  /** 重新載入資料並重繪 */
  async reload(): Promise<void> {
    const token = ++this.loadToken;
    const [from, to] = this.range();
    try {
      const data = await adminApi.load(dayStr(from), dayStr(to));
      if (token !== this.loadToken) return;
      this.data = data;
      this.today = dayNum(data.today);
      this.who.textContent = data.me.name || data.me.email;
      this.who.title = data.me.email;
      this.render();
    } catch (e) {
      if (token !== this.loadToken || !this.booted) return;
      clear(this.main);
      this.main.append(h('p', { class: 'error-box' }, (e as Error).message, ' ',
        h('button', { class: 'text-btn', type: 'button', onclick: () => void this.reload() }, '重新載入')));
    }
  }

  render(): void {
    if (!this.data) return;
    clear(this.nav);
    const n = pendingCount(this.data);
    for (const [key, label] of TABS) {
      this.nav.append(h('a', { href: `#/${key}`, class: `admin-tab${key === this.tab ? ' is-active' : ''}`, 'aria-current': key === this.tab ? 'page' : undefined },
        label, key === 'pending' && n > 0 && h('span', { class: 'count' }, n)));
    }
    clear(this.main);
    if (this.tab === 'calendar') this.main.append(renderCalendar(this));
    else if (this.tab === 'settings') this.main.append(renderSettings(this));
    else this.main.append(renderPending(this));
  }

  /** 某日前後一天佔用時段的區塊（排除指定場次），供選擇開場時間；不在已載入範圍內時另外查詢 */
  async blocksAround(day: number, excludeId?: string): Promise<Timed[]> {
    let d = this.data;
    if (!d || day - 1 < dayNum(d.from) || day + 1 > dayNum(d.to)) d = await adminApi.load(dayStr(day - 1), dayStr(day + 1));
    return [
      ...d.sessions.filter((s) => OCCUPYING.includes(s.status) && s.id !== excludeId),
      ...d.closures,
    ];
  }

  /** 改變時間表範圍後重新載入（保留舊資料顯示到新資料回來） */
  navigate(update: () => void): void {
    update();
    this.render();
    void this.reload();
  }

  toast(message: string, error = false): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('is-error', error);
    this.toastEl.classList.add('is-shown');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('is-shown'), error ? 6000 : 3000);
  }

  /**
   * 執行一個後台操作：按鈕顯示處理中、成功後提示並重新載入；失敗時提示錯誤。
   * confirmText 有值時先詢問。回傳是否成功。
   */
  async act(btn: HTMLButtonElement | null, task: () => Promise<unknown>, okMessage: string, confirmText?: string): Promise<boolean> {
    if (confirmText && !window.confirm(confirmText)) return false;
    const label = btn?.textContent ?? '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '處理中…';
    }
    try {
      await task();
      this.toast(okMessage);
      await this.reload();
      return true;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('unknown', '發生錯誤，請稍後再試');
      if (err.code !== 'unauthorized' && err.code !== 'forbidden') this.toast(err.message, true);
      if (btn?.isConnected) {
        btn.disabled = false;
        btn.textContent = label;
      }
      return false;
    }
  }
}
