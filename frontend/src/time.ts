// 日期以「日序」（1970-01-01 = 0）計算，時間以分鐘計算；一律視為台北時間，與後端一致。

export const DAY_MS = 86400000;
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function dayNum(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dayStr(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function hmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function minToHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 'yyyy-MM-dd HH:mm' → 絕對分鐘 */
export function absOf(dt: string): number {
  return dayNum(dt.slice(0, 10)) * 1440 + hmToMin(dt.slice(11, 16));
}

/** 星期一 = 0 … 星期日 = 6 */
export function weekdayOf(n: number): number {
  return (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
}

export function mondayOf(n: number): number {
  return n - weekdayOf(n);
}

/** 'M/D' */
export function shortDate(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** '11/20（五）' */
export function dateLabel(n: number): string {
  return `${shortDate(n)}（${WEEKDAYS[weekdayOf(n)]}）`;
}

/** 絕對分鐘 → '11/20（五）14:00' */
export function absLabel(abs: number): string {
  return `${dateLabel(Math.floor(abs / 1440))} ${minToHm(abs % 1440)}`;
}

/** '4 小時'、'3.5 小時'、'2 小時 15 分' */
export function durationLabel(min: number): string {
  if (min % 30 === 0) return `${min / 60} 小時`;
  return `${Math.floor(min / 60)} 小時 ${min % 60} 分`;
}

/** 時間區間文字：同日 '14:00–18:00'，剛好到午夜 '19:00–24:00'，跨日 '19:00–隔天 01:00' */
export function rangeLabel(startAbs: number, endAbs: number): string {
  const startDay = Math.floor(startAbs / 1440);
  const endDay = Math.floor(endAbs / 1440);
  const start = minToHm(startAbs % 1440);
  if (endDay === startDay) return `${start}–${minToHm(endAbs % 1440)}`;
  if (endDay === startDay + 1 && endAbs % 1440 === 0) return `${start}–24:00`;
  return `${start}–隔天 ${minToHm(endAbs % 1440)}`;
}
