/**
 * Re:LAX Story Lab schedule — Apps Script 後端進入點。
 *
 * GET  ?action=ping | scripts | catalog | schedule&from=yyyy-MM-dd&to=yyyy-MM-dd
 * POST （Content-Type: text/plain，內容為 JSON，避免 CORS preflight）
 *      { action: 'book', ... } | { action: 'join', ... }
 *      { action: 'admin_*', token, ... } 後台操作（見 Admin.js）
 */

function doGet(e) {
  return respond_(function () {
    return routeGet_((e && e.parameter) || {});
  });
}

function doPost(e) {
  return respond_(function () {
    let body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '');
    } catch (err) {
      fail_('bad_request', '請求格式錯誤');
    }
    if (!body || typeof body !== 'object') fail_('bad_request', '請求格式錯誤');
    return routePost_(body);
  });
}

function routeGet_(p) {
  switch (p.action) {
    case 'ping':
      return { ok: true, time: nowStr_() };
    case 'scripts':
      return handleScripts_();
    case 'catalog':
      return handleCatalog_();
    case 'schedule':
      return handleSchedule_(p);
    default:
      return fail_('unknown_action', '未知的操作');
  }
}

function routePost_(b) {
  if (String(b.action).indexOf('admin_') === 0) return routeAdmin_(b);
  switch (b.action) {
    case 'book':
      return handleBook_(b);
    case 'join':
      return handleJoin_(b);
    default:
      return fail_('unknown_action', '未知的操作');
  }
}

function respond_(fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    if (err instanceof AppError) {
      out = Object.assign({ ok: false, error: err.code, message: err.message }, err.extra);
    } else {
      console.error((err && err.stack) || err);
      out = { ok: false, error: 'server_error', message: '系統錯誤，請稍後再試' };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
