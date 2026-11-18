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
      h('div', { class: 'wrap' },
        h('a', { class: 'brand', href: '#/' },
          h('span', { class: 'brand-name' }, SITE.name),
          h('span', { class: 'brand-tag' }, SITE.tagline),
        ),
      ),
    ),
    main,
    h('footer', { class: 'site-footer' },
      h('div', { class: 'wrap' },
        h('p', null, '預約或拼場相關問題：', contact),
        h('p', null, h('a', { href: '#/privacy' }, '隱私權聲明')),
      ),
    ),
  );
  return main;
}
