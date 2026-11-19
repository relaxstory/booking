// 開發用：在瀏覽器內直接執行 backend/src 的後端程式碼與模擬試算表（只在 `npm run dev` 且網址帶 ?mock 時載入）。
// 重新整理頁面會重設資料。
import { loadBackend, makeGlobals, MockSpreadsheet } from '../../../backend/test/gas-env.mjs';
import { dayNum, dayStr } from '../time.ts';

const files = import.meta.glob('../../../backend/src/*.js', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sources = Object.keys(files).sort().map((k) => files[k]);

const ss = new MockSpreadsheet();
const { globals } = makeGlobals({ ss, now: () => new Date() });
const run = loadBackend(sources, globals, () => new Date());

type Gs = { getContent(): string };
const doPost = run('doPost') as (e: object) => Gs;
const post = (body: object) => JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } }).getContent());

run('setup()');
run('importOfficialScripts()');

// 示範資料
const today = dayNum(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()));
const d = (n: number) => dayStr(today + n);
let seq = 0;
const person = (nickname: string, count: number, male: number, female: number, over: object = {}) => ({
  name: `${nickname}本名`, nickname, phone: '0912345678', email: `demo${++seq}@example.com`,
  line_id: `line_${seq}`, ig: '', note: '', count, male, female, ...over,
});
const book = (date: string, start: string, script_id: string, p: object) => post({ action: 'book', script_id, date, start, ...p });

book(d(1), '14:00', 'chutao-lianticun', person('小明', 5, 1, 4, { note: '有一位第一次玩' }));
const c = book(d(2), '13:00', 'tongliu-hewu', person('阿華', 5, 3, 2));
run(`adminConfirm_({ session_id: ${JSON.stringify(c.session_id)} })`);
const g = book(d(3), '14:00', 'diesu', person('主揪阿明', 2, 1, 1));
book(d(3), '15:00', 'yaomo-guiguai', person('小美', 1, 0, 1)); // 與上面重疊的拼團待確認
run(`adminConfirm_({ session_id: ${JSON.stringify(g.session_id)} })`);
post({ action: 'join', session_id: g.session_id, ...person('路人甲', 2, 0, 2, { ig: 'jia_ig', line_id: '' }) });
book(d(5), '12:00', 'half-world-deduction', person('夜貓', 3, 2, 1));
run(`insert_('closures', { id: 'demo-c1', start_at: '${d(4)} 09:00', end_at: '${d(4)} 13:00', note: '店休（整理場地）', created_at: '' })`);
run('generatePasscode_()');

export async function mockAdminPost(payload: object): Promise<object> {
  await new Promise((r) => setTimeout(r, 350));
  return post(payload);
}
