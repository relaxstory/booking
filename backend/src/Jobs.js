/**
 * 排程工作（時間觸發器）。於編輯器執行一次 installTriggers 安裝。
 *   dailyReminder  每天 RULES.reminderHour 點：寄出隔天「已預約」場次的提醒
 *   dailyPurge     每天 RULES.purgeHour 點：清除場次結束滿 RULES.purgeMonths 個月的參與者個資
 * 觸發器呼叫的函式名稱不能以底線結尾，因此另外包一層。
 */

const TRIGGER_HANDLERS_ = ['dailyReminder', 'dailyPurge'];

function dailyReminder() {
  Logger.log('提醒信：' + sendReminders_() + ' 場');
}

function dailyPurge() {
  Logger.log('個資清除：' + purgePersonalData_() + ' 筆');
}

/** 安裝（或重新安裝）排程觸發器；同時補齊工作表欄位。可重複執行。 */
function installTriggers() {
  requireAllScopes_();
  setup();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_HANDLERS_.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminder').timeBased().everyDays(1).atHour(RULES.reminderHour).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyPurge').timeBased().everyDays(1).atHour(RULES.purgeHour).inTimezone(TZ).create();
  Logger.log('已安裝排程：每天 ' + RULES.reminderHour + ' 點寄提醒、' + RULES.purgeHour + ' 點清除過期個資');
}

/** 寄出隔天開場的已預約場次提醒；每場只寄一次（記錄於 reminded_at）。回傳場次數。 */
function sendReminders_() {
  return withLock_(function () {
    const tomorrow = dayNum_(todayStr_()) + 1;
    const sessions = readAll_('sessions').filter(function (s) {
      const start = strToAbs_(s.start_at);
      return s.status === 'confirmed' && !s.reminded_at && start !== null && Math.floor(start / 1440) === tomorrow;
    });
    if (!sessions.length) return 0;
    const participants = readAll_('participants');
    const scripts = indexBy_(loadScripts_(), 'id');
    sessions.forEach(function (s) {
      notify_('reminder', {
        session: s,
        script: scripts[s.script_id] || null,
        participants: participants.filter(function (p) { return p.session_id === s.id && p.status === 'joined'; }),
      });
      s.reminded_at = nowStr_();
      update_('sessions', s);
    });
    return sessions.length;
  });
}

/** 個資清除的基準日：今天往前 RULES.purgeMonths 個月（月底不足時取該月最後一天） */
function purgeCutoffDay_() {
  const today = todayStr_();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 - RULES.purgeMonths; // 0-based，可為負
  const d = Number(today.slice(8, 10));
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.round(Date.UTC(y, m, Math.min(d, lastDay)) / 86400000);
}

/**
 * 清除場次結束日不晚於基準日（即結束滿半年）的參與者個資；場次已不存在的參與者也一併清除。
 * 保留場次紀錄與人數、暱稱等統計欄位。回傳清除筆數。
 */
function purgePersonalData_() {
  return withLock_(function () {
    const cutoff = purgeCutoffDay_();
    const sessions = indexBy_(readAll_('sessions'), 'id');
    const ts = nowStr_();
    let n = 0;
    readAll_('participants').forEach(function (p) {
      if (p.purged_at) return;
      const s = sessions[p.session_id];
      if (s) {
        const end = strToAbs_(s.end_at);
        if (end === null || Math.floor(end / 1440) > cutoff) return;
      }
      PERSONAL_FIELDS.forEach(function (f) { p[f] = ''; });
      p.purged_at = ts;
      p.updated_at = ts;
      update_('participants', p);
      n++;
    });
    return n;
  });
}
