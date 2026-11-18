/**
 * 時間工具。所有時間以台北時間表示：
 *   日期字串 'yyyy-MM-dd'、時間字串 'HH:mm'、日期時間字串 'yyyy-MM-dd HH:mm'
 * 計算時轉為「絕對分鐘」= 日序 × 1440 + 當日分鐘，跨午夜也能直接比較。
 */

/** 現在時間（測試時可替換） */
function now_() {
  return new Date();
}

function fmt_(date, pattern) {
  return Utilities.formatDate(date, TZ, pattern);
}

function nowStr_() {
  return fmt_(now_(), 'yyyy-MM-dd HH:mm:ss');
}

function todayStr_() {
  return fmt_(now_(), 'yyyy-MM-dd');
}

/** 'yyyy-MM-dd' → 日序（1970-01-01 為 0）；格式錯誤或不存在的日期回傳 null */
function dayNum_(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}

function dayStr_(dayNum) {
  return new Date(dayNum * 86400000).toISOString().slice(0, 10);
}

/** 'HH:mm' → 當日分鐘；格式錯誤回傳 null */
function hmToMin_(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function minToHm_(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function absToStr_(abs) {
  return dayStr_(Math.floor(abs / 1440)) + ' ' + minToHm_(abs % 1440);
}

/** 'yyyy-MM-dd HH:mm' → 絕對分鐘；格式錯誤回傳 null */
function strToAbs_(s) {
  const parts = String(s || '').split(' ');
  const d = dayNum_(parts[0]);
  const t = hmToMin_(parts[1]);
  return d === null || t === null ? null : d * 1440 + t;
}

/** 可預約日期範圍：明天 ～ 「本月 + monthsAhead 個月」的月底 */
function bookingWindow_() {
  const today = todayStr_();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1-based
  const minDay = dayNum_(today) + 1;
  const maxDay = Math.round(Date.UTC(y, m + RULES.monthsAhead, 0) / 86400000);
  return { minDay: minDay, maxDay: maxDay, minDate: dayStr_(minDay), maxDate: dayStr_(maxDay) };
}

function publicRules_() {
  const w = bookingWindow_();
  return {
    min_date: w.minDate,
    max_date: w.maxDate,
    earliest_start: minToHm_(RULES.earliestStart),
    latest_start: minToHm_(RULES.latestStart),
    slot_minutes: RULES.slotMinutes,
  };
}
