import { h } from '../dom.ts';
import { SITE } from '../site.ts';

export function renderPrivacy(): HTMLElement {
  const section = (title: string, ...body: (string | HTMLElement)[]) => h('section', null, h('h2', null, title), body.map((p) => (typeof p === 'string' ? h('p', null, p) : p)));
  return h('article', { class: 'prose' },
    h('p', null, h('a', { href: '#/' }, '‹ 回到時間表')),
    h('h1', null, '隱私權聲明'),
    h('p', null, `${SITE.name}（以下稱「本店」）依個人資料保護法，說明本預約網站蒐集、處理及利用個人資料的方式。`),
    section('蒐集目的', '場次預約、拼場媒合、預約確認與異動通知，以及與預約相關的聯繫。'),
    section('蒐集項目', '姓名、暱稱、電話、Email、LINE ID 或 IG 帳號、人數與男女人數、備註。'),
    section('公開範圍',
      '上述資料均不公開，僅本店管理人員可見。',
      '唯一例外：若你登記拼團並經本店確認公開招募，你的暱稱會以「主揪」身分顯示在時間表上。',
    ),
    section('利用期間與方式',
      '資料儲存於本店的 Google 帳號，以 Email 寄送預約相關通知。',
      '場次結束滿六個月後，系統會自動刪除參與者的個人資料，僅保留不含個資的場次紀錄（劇本、日期時間、人數）作為統計使用。',
    ),
    section('你的權利', '你可以隨時聯繫本店，查詢、更正或要求刪除你的個人資料，或取消預約。'),
    section('聯絡方式', `${SITE.privacyContact}`),
  );
}
