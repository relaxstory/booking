/**
 * Re:LAX Story Lab schedule — Apps Script 後端進入點。
 * 前端以 GET（讀取）與 POST（Content-Type: text/plain，避免 CORS preflight）呼叫。
 */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  switch (action) {
    case 'ping':
      return json_({ ok: true, time: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss') });
    default:
      return json_({ ok: false, error: 'unknown_action' });
  }
}

function doPost(e) {
  return json_({ ok: false, error: 'not_implemented' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
