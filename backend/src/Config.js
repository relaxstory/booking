/**
 * 全域設定。
 *
 * 場次狀態（sessions.status）：
 *   pending        包場待確認（佔時段，前台顯示「待確認」）
 *   confirmed      已預約（佔時段，前台顯示「已預約」；包場或成團的拼場）
 *   group_pending  拼團待確認（不佔時段，前台不顯示）
 *   recruiting     待拼團（佔時段，前台顯示人數與男女缺額）
 *   rejected       已拒絕
 *   cancelled      已取消
 *
 * 參與者狀態（participants.status）：joined 已加入、applied 申請中、rejected 已拒絕
 */

const SPREADSHEET_ID = '1YApuRxavmAeYQuqVdBzMhsZwEjTBzAMJg1BuVnwKuQk';
const TZ = 'Asia/Taipei';

/** 後台 Google 登入的 OAuth 用戶端 ID（公開值，非密鑰；需與 frontend/.env 的 VITE_GOOGLE_CLIENT_ID 相同） */
const GOOGLE_CLIENT_ID = '298103485927-4647bjf0l5qn3e7m8bucf77davqq3f0r.apps.googleusercontent.com';

/** 各工作表欄位（第一列為標題，依標題名稱讀寫，欄位順序可調整） */
const SHEETS = {
  scripts: ['id', 'name', 'players', 'duration_min', 'male', 'female', 'price', 'active'],
  sessions: ['id', 'type', 'script_id', 'start_at', 'end_at', 'status', 'passcode', 'created_at', 'updated_at', 'admin_note'],
  participants: ['id', 'session_id', 'status', 'is_host', 'name', 'nickname', 'phone', 'email', 'line_id', 'ig', 'count', 'male', 'female', 'note', 'created_at', 'updated_at', 'purged_at'],
  closures: ['id', 'start_at', 'end_at', 'note', 'created_at'],
  passcodes: ['code', 'created_at', 'expires_at', 'used_at', 'session_id'],
  admins: ['email', 'name', 'active'],
};

const RULES = {
  earliestStart: 9 * 60, // 09:00
  latestStart: 19 * 60, // 19:00
  slotMinutes: 30,
  monthsAhead: 6, // 可預約至「本月 + 6 個月」月底
  passcodeDays: 7,
  rateLimitCount: 5, // 同一 Email 在時間窗內最多送出次數
  rateLimitWindowSec: 600,
  maxScheduleDays: 62, // 時間表單次查詢最多天數
};

/** 佔用時段的場次狀態 */
const OCCUPYING_STATUSES = ['pending', 'confirmed', 'recruiting'];

/** 進行中（尚未拒絕或取消）的場次狀態 */
const ACTIVE_STATUSES = ['pending', 'confirmed', 'group_pending', 'recruiting'];

/** 後台登入有效時間（秒；CacheService 上限 6 小時） */
const ADMIN_SESSION_SEC = 21600;

/** 場次狀態 → 前台顯示用狀態 */
const PUBLIC_STATUS = { pending: 'pending', confirmed: 'booked', recruiting: 'recruiting' };
