import { GOOGLE_CLIENT_ID } from '../config.ts';
import { clear, h } from '../dom.ts';
import { MOCK } from './api.ts';

interface Gis {
  accounts: {
    id: {
      initialize(o: object): void;
      renderButton(el: HTMLElement, o: object): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

let gis: Promise<Gis> | null = null;

/** 載入 Google Identity Services */
function loadGis(): Promise<Gis> {
  if (!gis) {
    gis = new Promise((resolve, reject) => {
      const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true });
      s.addEventListener('load', () => (window.google ? resolve(window.google) : reject(new Error('gis'))));
      s.addEventListener('error', () => {
        gis = null;
        reject(new Error('gis'));
      });
      document.head.append(s);
    });
  }
  return gis;
}

/** 登出時呼叫，避免下次自動以同一帳號登入 */
export function forgetGoogleAccount(): void {
  window.google?.accounts.id.disableAutoSelect();
}

/** 登入畫面；onLogin 收到 Google ID token，失敗時丟出錯誤 */
export function renderLogin(root: HTMLElement, onLogin: (idToken: string) => Promise<void>, message = ''): void {
  clear(root);
  const status = h('p', { class: 'login-status', 'aria-live': 'polite' });
  const error = h('p', { class: 'error-box', role: 'alert', hidden: !message }, message);
  const buttonBox = h('div', { class: 'login-button' });

  const submit = async (idToken: string) => {
    error.hidden = true;
    status.textContent = '驗證中…';
    buttonBox.classList.add('is-busy');
    try {
      await onLogin(idToken);
    } catch (e) {
      status.textContent = '';
      error.textContent = (e as Error).message;
      error.hidden = false;
      buttonBox.classList.remove('is-busy');
    }
  };

  root.append(
    h('div', { class: 'login' },
      h('div', { class: 'login-card' },
        h('p', { class: 'brand-name' }, 'Re:LAX Story Lab'),
        h('h1', null, '後台登入'),
        h('p', { class: 'hint' }, '請以管理者的 Google 帳號登入。'),
        error,
        buttonBox,
        status,
        h('p', { class: 'hint' }, h('a', { href: './' }, '‹ 回到前台時間表')),
      ),
    ),
  );

  if (MOCK) {
    buttonBox.append(h('button', { class: 'primary-btn', type: 'button', onclick: () => submit('mock:owner@example.com') }, '模擬登入（owner@example.com）'));
    return;
  }
  if (!GOOGLE_CLIENT_ID) {
    error.textContent = '尚未設定 Google 登入（VITE_GOOGLE_CLIENT_ID）。';
    error.hidden = false;
    return;
  }
  status.textContent = '載入 Google 登入…';
  loadGis().then(
    (g) => {
      status.textContent = '';
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r: { credential: string }) => void submit(r.credential),
        auto_select: true,
        ux_mode: 'popup',
      });
      g.accounts.id.renderButton(buttonBox, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'zh-TW' });
    },
    () => {
      status.textContent = '';
      error.textContent = '無法載入 Google 登入，請檢查網路或關閉擋廣告外掛後重新整理。';
      error.hidden = false;
    },
  );
}
