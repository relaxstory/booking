import { api, type Block, type Rules, type Script } from './api.ts';
import { clear, h } from './dom.ts';
import { dayNum, dayStr, mondayOf } from './time.ts';
import { renderSchedule } from './views/schedule.ts';
import { renderPrivacy } from './views/privacy.ts';
import { renderShell } from './views/shell.ts';

export class App {
  scripts: Script[] = [];
  rules!: Rules;
  /** 今天（台北），由後端回傳的最早可預約日 − 1 推得，不依賴使用者電腦時區 */
  today = 0;
  minDay = 0;
  maxDay = 0;
  weekStart = 0;
  selectedDay = 0;

  private cache = new Map<string, Promise<Block[]>>();
  private main!: HTMLElement;

  constructor(private root: HTMLElement) {}

  async start(): Promise<void> {
    this.main = renderShell(this.root);
    this.main.append(h('p', { class: 'loading' }, '載入中…'));
    // 與劇本列表同時預先載入本週時間表（Apps Script 每次請求約 1–3 秒，平行可省一半等待）
    const guessToday = dayNum(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()));
    this.weekBlocks(mondayOf(guessToday)).catch(() => {});
    try {
      const r = await api.scripts();
      this.scripts = r.scripts;
      this.applyRules(r.rules);
      this.weekStart = mondayOf(this.today);
      this.selectedDay = this.today;
    } catch (e) {
      clear(this.main);
      this.main.append(h('p', { class: 'error-box' }, (e as Error).message));
      return;
    }
    window.addEventListener('hashchange', () => this.route());
    this.route();
  }

  applyRules(rules: Rules): void {
    this.rules = rules;
    this.minDay = dayNum(rules.min_date);
    this.maxDay = dayNum(rules.max_date);
    this.today = this.minDay - 1;
  }

  route(): void {
    clear(this.main);
    if (location.hash === '#/privacy') {
      this.main.append(renderPrivacy());
      document.title = '隱私權聲明｜Re:LAX Story Lab';
    } else {
      this.main.append(renderSchedule(this));
      document.title = 'Re:LAX Story Lab 場次預約';
    }
  }

  /** 重新繪製時間表（不重新載入資料） */
  refresh(): void {
    if (location.hash !== '#/privacy') this.route();
  }

  /** 取得日期範圍內的區塊（含快取） */
  blocks(fromDay: number, toDay: number): Promise<Block[]> {
    const key = `${fromDay}:${toDay}`;
    let p = this.cache.get(key);
    if (!p) {
      p = api.schedule(dayStr(fromDay), dayStr(toDay)).then((r) => {
        this.applyRules(r.rules);
        return r.blocks;
      });
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return p;
  }

  /** 一週的區塊：週一 09:00 ～ 下週一 09:00 */
  weekBlocks(weekStart: number): Promise<Block[]> {
    return this.blocks(weekStart, weekStart + 7);
  }

  /** 送出後資料已變更，清除快取 */
  invalidate(): void {
    this.cache.clear();
  }

  isBookable(day: number): boolean {
    return day >= this.minDay && day <= this.maxDay;
  }
}
