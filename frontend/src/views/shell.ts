import { h } from '../dom.ts';
import { SITE } from '../site.ts';

/** 頁首、頁尾；回傳主內容容器 */
export function renderShell(root: HTMLElement): HTMLElement {
  const main = h('main', { id: 'main' });
  const contact = SITE.contact.url
    ? h('a', { href: SITE.contact.url, target: '_blank', rel: 'noopener' }, SITE.contact.label)
    : SITE.contact.label;
  root.append(
    h('header', { class: 'site-header' },
      h('div', { class: 'wrap brand-row' },
        h('div', { class: 'brand-group' },
          // Logo 與店名連回官網首頁
          h('a', { class: 'brand', href: SITE.homeUrl, title: '回官網首頁' },
            // 深色模式改用淺色 Logo
            h('picture', null,
              h('source', { srcset: `${import.meta.env.BASE_URL}logo-mark-light.png`, media: '(prefers-color-scheme: dark)' }),
              h('img', { class: 'brand-logo', src: `${import.meta.env.BASE_URL}logo-mark.png`, alt: '', width: 40, height: 34 }),
            ),
            h('span', { class: 'brand-name' }, 'Re:', h('em', null, 'LAX'), ' Story Lab'),
          ),
          h('a', { class: 'brand-tag', href: '#/' }, SITE.tagline),
        ),
        h('a', { class: 'home-link', href: SITE.homeUrl }, '← 回官網'),
      ),
    ),
    main,
    h('footer', { class: 'site-footer' },
      h('div', { class: 'wrap' },
        h('p', null, '預約或拼場相關問題：', contact),
        h('p', null,
          h('a', { href: '#/privacy' }, '隱私權聲明'),
          '・',
          h('a', { href: SITE.homeUrl }, 'Re:LAX Story Lab 官網'),
        ),
      ),
    ),
  );
  return main;
}
