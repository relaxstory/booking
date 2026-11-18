/** 表單欄位檢查與防灌單 */

const FIELD_LIMITS = { name: 50, nickname: 30, phone: 20, email: 100, line_id: 50, ig: 50, note: 500 };

function text_(p, key, label, required) {
  const v = p[key] === undefined || p[key] === null ? '' : String(p[key]).trim();
  if (required && !v) fail_('missing_field', '請填寫' + label, { field: key });
  if (v.length > FIELD_LIMITS[key]) fail_('invalid_field', label + '過長（最多 ' + FIELD_LIMITS[key] + ' 字）', { field: key });
  return v;
}

function intField_(p, key, label, min) {
  const n = int_(p[key]);
  if (isNaN(n)) fail_('missing_field', '請填寫' + label, { field: key });
  if (n < min || n > 99) fail_('invalid_field', label + '數值錯誤', { field: key });
  return n;
}

/** 檢查聯絡資料與人數，回傳可直接寫入 participants 的欄位 */
function validateContact_(p) {
  const name = text_(p, 'name', '姓名', true);
  const nickname = text_(p, 'nickname', '暱稱', true);
  const phone = text_(p, 'phone', '電話', true);
  if (!/^[0-9+\-() ]{8,20}$/.test(phone)) fail_('invalid_field', '電話格式錯誤', { field: 'phone' });
  const email = text_(p, 'email', 'Email', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('invalid_field', 'Email 格式錯誤', { field: 'email' });
  const lineId = text_(p, 'line_id', 'LINE ID', false);
  const ig = text_(p, 'ig', 'IG 帳號', false);
  if (!lineId && !ig) fail_('contact_required', 'LINE ID 與 IG 帳號請至少填寫一項', { field: 'line_id' });
  const note = text_(p, 'note', '備註', false);
  const count = intField_(p, 'count', '人數', 1);
  const male = intField_(p, 'male', '男性人數', 0);
  const female = intField_(p, 'female', '女性人數', 0);
  if (male + female !== count) fail_('gender_mismatch', '男性人數與女性人數加總需等於總人數', { field: 'male' });
  return {
    name: name,
    nickname: nickname,
    phone: phone,
    email: email,
    line_id: lineId,
    ig: ig,
    note: note,
    count: count,
    male: male,
    female: female,
  };
}

/** 隱藏陷阱欄位：真人看不到，機器人會填 */
function isBot_(p) {
  return !!(p.website && String(p.website).trim());
}

/** 同一 Email 在時間窗內的送出次數限制 */
function rateLimit_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'rl:' + String(email).toLowerCase();
  const n = Number(cache.get(key) || 0);
  if (n >= RULES.rateLimitCount) fail_('rate_limited', '送出次數過多，請稍後再試');
  cache.put(key, String(n + 1), RULES.rateLimitWindowSec);
}
