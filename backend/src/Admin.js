/**
 * 後台 API。登入流程：
 *   前端以 Google Identity Services 取得 ID token → admin_login 驗證 token 並比對 admins 工作表
 *   → 回傳後台登入憑證（隨機字串，存於 CacheService，6 小時有效）→ 之後每個請求帶 token。
 *
 * 所有後台操作皆為 POST { action: 'admin_*', token, ... }。
 */

function routeAdmin_(b) {
  if (b.action === 'admin_login') return handleAdminLogin_(b);
  if (b.action === 'admin_logout') return handleAdminLogout_(b);
  const admin = requireAdmin_(b.token);

  // 唯讀或自行加鎖的操作
  switch (b.action) {
    case 'admin_load':
      return handleAdminLoad_(b, admin);
    case 'admin_passcode_create':
      return Object.assign({ ok: true }, generatePasscode_());
  }

  const fn = adminMutation_(b.action);
  if (!fn) fail_('unknown_action', '未知的操作');
  return withLock_(function () {
    fn(b);
    return { ok: true };
  });
}

function adminMutation_(action) {
  switch (action) {
    case 'admin_confirm': return adminConfirm_;
    case 'admin_reject': return adminReject_;
    case 'admin_cancel': return adminCancel_;
    case 'admin_finalize': return adminFinalize_;
    case 'admin_create_session': return adminCreateSession_;
    case 'admin_update_session': return adminUpdateSession_;
    case 'admin_add_participant': return adminAddParticipant_;
    case 'admin_update_participant': return adminUpdateParticipant_;
    case 'admin_set_host': return adminSetHost_;
    case 'admin_remove_participant': return adminRemoveParticipant_;
    case 'admin_approve_application': return adminApproveApplication_;
    case 'admin_reject_application': return adminRejectApplication_;
    case 'admin_closure_create': return adminClosureCreate_;
    case 'admin_closure_delete': return adminClosureDelete_;
    case 'admin_script_toggle': return adminScriptToggle_;
    default: return null;
  }
}

/* ───────── 登入 ───────── */

function findAdmin_(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return readAll_('admins').filter(function (a) {
    return a.email.toLowerCase() === e && bool_(a.active);
  })[0] || null;
}

/** OAuth 用戶端 ID（測試時可替換） */
function googleClientId_() {
  return GOOGLE_CLIENT_ID;
}

/** 向 Google 驗證 ID token，回傳已驗證的 Email */
function verifyIdToken_(idToken) {
  const clientId = googleClientId_();
  if (!clientId) fail_('not_configured', '後台登入尚未設定（GOOGLE_CLIENT_ID）');
  if (!idToken) fail_('unauthorized', '請先登入');
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) fail_('unauthorized', 'Google 登入驗證失敗，請重新登入');
  const info = JSON.parse(res.getContentText());
  const issOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  const valid = info.aud === clientId && issOk &&
    String(info.email_verified) === 'true' && Number(info.exp) * 1000 > now_().getTime();
  if (!valid || !info.email) fail_('unauthorized', 'Google 登入驗證失敗，請重新登入');
  return String(info.email);
}

function handleAdminLogin_(p) {
  const email = verifyIdToken_(String(p.id_token || ''));
  const admin = findAdmin_(email);
  if (!admin) fail_('forbidden', '此 Google 帳號（' + email + '）沒有後台權限');
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  CacheService.getScriptCache().put('adm:' + token, admin.email, ADMIN_SESSION_SEC);
  return { ok: true, token: token, email: admin.email, name: admin.name, expires_in: ADMIN_SESSION_SEC };
}

function handleAdminLogout_(p) {
  const t = String(p.token || '');
  if (t) CacheService.getScriptCache().remove('adm:' + t);
  return { ok: true };
}

function requireAdmin_(token) {
  const t = String(token || '');
  const email = t ? CacheService.getScriptCache().get('adm:' + t) : null;
  if (!email) fail_('unauthorized', '登入已逾時，請重新登入');
  const admin = findAdmin_(email);
  if (!admin) fail_('forbidden', '此帳號沒有後台權限');
  return admin;
}

/* ───────── 讀取 ───────── */

function adminParticipant_(p) {
  return {
    id: p.id,
    session_id: p.session_id,
    status: p.status,
    is_host: bool_(p.is_host),
    name: p.name,
    nickname: p.nickname,
    phone: p.phone,
    email: p.email,
    line_id: p.line_id,
    ig: p.ig,
    note: p.note,
    count: int_(p.count) || 0,
    male: int_(p.male) || 0,
    female: int_(p.female) || 0,
    created_at: p.created_at,
  };
}

const PARTICIPANT_ORDER = { joined: 1, applied: 2, rejected: 3 };

function adminSession_(s, script, parts, conflict) {
  const joined = { count: 0, male: 0, female: 0 };
  parts.forEach(function (p) {
    if (p.status !== 'joined') return;
    joined.count += p.count;
    joined.male += p.male;
    joined.female += p.female;
  });
  parts.sort(function (a, b) {
    return (b.is_host - a.is_host) ||
      ((PARTICIPANT_ORDER[a.status] || 9) - (PARTICIPANT_ORDER[b.status] || 9)) ||
      (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
  });
  return {
    id: s.id,
    type: s.type,
    status: s.status,
    script_id: s.script_id,
    script_name: script ? script.name : '（找不到劇本）',
    players: script ? script.players : 0,
    script_male: script && !isNaN(script.male) ? script.male : null,
    script_female: script && !isNaN(script.female) ? script.female : null,
    start_at: s.start_at,
    end_at: s.end_at,
    passcode: s.passcode,
    created_at: s.created_at,
    updated_at: s.updated_at,
    admin_note: s.admin_note,
    participants: parts,
    joined: joined,
    conflict: !!conflict,
  };
}

/**
 * 後台資料：期間內佔用時段的場次與關閉時段，
 * 加上所有尚未結束的待確認、拼團待確認、待拼團場次（待處理清單用），以及劇本、通關碼。
 */
function handleAdminLoad_(p, admin) {
  const fromDay = dayNum_(p.from);
  const toDay = dayNum_(p.to);
  if (fromDay === null || toDay === null || toDay < fromDay) fail_('invalid_range', '查詢日期範圍錯誤');
  if (toDay - fromDay + 1 > RULES.maxScheduleDays) fail_('invalid_range', '單次最多查詢 ' + RULES.maxScheduleDays + ' 天');
  const rangeStart = fromDay * 1440;
  const rangeEnd = (toDay + 1) * 1440;
  const nowAbs = strToAbs_(nowStr_().slice(0, 16));

  const scripts = loadScripts_();
  const scriptById = indexBy_(scripts, 'id');
  const bySession = {};
  readAll_('participants').forEach(function (r) {
    (bySession[r.session_id] = bySession[r.session_id] || []).push(adminParticipant_(r));
  });

  const sessions = readAll_('sessions');
  const closures = readAll_('closures');
  const busy = [];
  sessions.forEach(function (s) {
    if (OCCUPYING_STATUSES.indexOf(s.status) >= 0) busy.push({ id: s.id, start: strToAbs_(s.start_at), end: strToAbs_(s.end_at) });
  });
  closures.forEach(function (c) {
    busy.push({ id: c.id, start: strToAbs_(c.start_at), end: strToAbs_(c.end_at) });
  });

  const outSessions = [];
  sessions.forEach(function (s) {
    const a = strToAbs_(s.start_at);
    const b = strToAbs_(s.end_at);
    if (a === null || b === null) return;
    const inRange = OCCUPYING_STATUSES.indexOf(s.status) >= 0 && a < rangeEnd && rangeStart < b;
    const open = ['pending', 'group_pending', 'recruiting'].indexOf(s.status) >= 0 && b > nowAbs;
    if (!inRange && !open) return;
    const conflict = s.status === 'group_pending' && busy.some(function (x) {
      return x.id !== s.id && a < x.end && x.start < b;
    });
    outSessions.push(adminSession_(s, scriptById[s.script_id], bySession[s.id] || [], conflict));
  });
  outSessions.sort(function (x, y) {
    return x.start_at < y.start_at ? -1 : x.start_at > y.start_at ? 1 : 0;
  });

  const outClosures = closures
    .filter(function (c) {
      const a = strToAbs_(c.start_at);
      const b = strToAbs_(c.end_at);
      return a !== null && b !== null && a < rangeEnd && rangeStart < b;
    })
    .map(function (c) {
      return { id: c.id, start_at: c.start_at, end_at: c.end_at, note: c.note };
    });

  const now = nowStr_();
  const passcodes = readAll_('passcodes')
    .sort(function (x, y) { return x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0; })
    .slice(0, 30)
    .map(function (r) {
      return {
        code: r.code,
        created_at: r.created_at,
        expires_at: r.expires_at,
        used_at: r.used_at,
        session_id: r.session_id,
        state: r.used_at ? 'used' : r.expires_at <= now ? 'expired' : 'active',
      };
    });

  return {
    ok: true,
    from: dayStr_(fromDay),
    to: dayStr_(toDay),
    now: now,
    today: todayStr_(),
    me: { email: admin.email, name: admin.name },
    scripts: scripts.filter(isUsableScript_).map(function (s) {
      return Object.assign(publicScript_(s), { active: s.active });
    }),
    sessions: outSessions,
    closures: outClosures,
    passcodes: passcodes,
    rules: publicRules_(),
  };
}

/* ───────── 共用 ───────── */

function findSession_(id) {
  const s = readAll_('sessions').filter(function (x) { return x.id === String(id || ''); })[0];
  if (!s) fail_('not_found', '找不到此場次');
  return s;
}

function findParticipant_(id) {
  const p = readAll_('participants').filter(function (x) { return x.id === String(id || ''); })[0];
  if (!p) fail_('not_found', '找不到此參與者');
  return p;
}

function findScript_(id) {
  const s = loadScripts_().filter(function (x) { return x.id === String(id || '') && isUsableScript_(x); })[0];
  if (!s) fail_('script_not_found', '找不到此劇本', { field: 'script_id' });
  return s;
}

function expectStatus_(s, statuses) {
  if (statuses.indexOf(s.status) < 0) fail_('invalid_status', '此場次目前的狀態無法進行這個操作，請重新整理');
}

function saveSession_(s) {
  s.updated_at = nowStr_();
  update_('sessions', s);
}

function joinedOf_(sessionId) {
  return readAll_('participants').filter(function (p) {
    return p.session_id === sessionId && p.status === 'joined';
  });
}

/** 已加入人數 + addCount 不得超過劇本人數（excludeId：修改時排除自己原本的人數） */
function assertCapacity_(session, addCount, excludeId) {
  const script = loadScripts_().filter(function (x) { return x.id === session.script_id; })[0];
  if (!script || !(script.players > 0)) return;
  const joined = joinedOf_(session.id).reduce(function (n, p) {
    return p.id === excludeId ? n : n + (int_(p.count) || 0);
  }, 0);
  if (joined + addCount > script.players) {
    fail_('exceeds_remaining', '人數超過劇本人數（目前 ' + joined + '/' + script.players + ' 人）', { field: 'count' });
  }
}

/** 後台安排的開場：日期不可早於今天，開場時間規則與前台相同 */
function adminStartAbs_(p) {
  const day = dayNum_(p.date);
  if (day === null) fail_('invalid_field', '日期格式錯誤', { field: 'date' });
  if (day < dayNum_(todayStr_())) fail_('date_out_of_range', '不可安排在今天以前', { field: 'date' });
  const m = hmToMin_(p.start);
  if (m === null || m < RULES.earliestStart || m > RULES.latestStart || m % RULES.slotMinutes !== 0) {
    fail_('invalid_start', '開場時間需為 09:00–19:00 的整點或半點', { field: 'start' });
  }
  return day * 1440 + m;
}

function notifySession_(event, s, extra) {
  const script = loadScripts_().filter(function (x) { return x.id === s.script_id; })[0] || null;
  notify_(event, Object.assign({ session: s, script: script, participants: joinedOf_(s.id) }, extra || {}));
}

/* ───────── 場次 ───────── */

/** 待確認 → 已預約；拼團待確認 → 待拼團（重新檢查衝突） */
function adminConfirm_(p) {
  const s = findSession_(p.session_id);
  expectStatus_(s, ['pending', 'group_pending']);
  if (s.status === 'group_pending') {
    assertNoConflict_(strToAbs_(s.start_at), strToAbs_(s.end_at), s.id);
    s.status = 'recruiting';
    saveSession_(s);
    notifySession_('group_opened', s);
  } else {
    s.status = 'confirmed';
    saveSession_(s);
    notifySession_('booking_confirmed', s);
  }
}

function adminReject_(p) {
  const s = findSession_(p.session_id);
  expectStatus_(s, ['pending', 'group_pending']);
  s.status = 'rejected';
  saveSession_(s);
  notifySession_('booking_rejected', s);
}

/** 取消：待拼團的取消即「拼團失敗」 */
function adminCancel_(p) {
  const s = findSession_(p.session_id);
  expectStatus_(s, ['pending', 'confirmed', 'recruiting']);
  const event = s.status === 'recruiting' ? 'group_failed' : 'booking_cancelled';
  s.status = 'cancelled';
  saveSession_(s);
  notifySession_(event, s);
}

/** 成團：待拼團 → 已預約 */
function adminFinalize_(p) {
  const s = findSession_(p.session_id);
  expectStatus_(s, ['recruiting']);
  s.status = 'confirmed';
  saveSession_(s);
  notifySession_('group_formed', s);
}

/** 後台建立場次：包場直接為已預約，拼場直接為待拼團 */
function adminCreateSession_(p) {
  const type = p.type === 'group' ? 'group' : p.type === 'private' ? 'private' : '';
  if (!type) fail_('invalid_field', '請選擇類型', { field: 'type' });
  const script = findScript_(p.script_id);
  const start = adminStartAbs_(p);
  const end = start + script.duration_min;
  const host = validateContact_(p.host || {});
  if (host.count > script.players) fail_('count_exceeds', '人數不可超過劇本人數（' + script.players + ' 人）', { field: 'count' });
  assertNoConflict_(start, end, null);

  const ts = nowStr_();
  const s = insert_('sessions', {
    id: newId_(),
    type: type,
    script_id: script.id,
    start_at: absToStr_(start),
    end_at: absToStr_(end),
    status: type === 'group' ? 'recruiting' : 'confirmed',
    passcode: '',
    created_at: ts,
    updated_at: ts,
    admin_note: String(p.admin_note || '').trim().slice(0, 500),
  });
  insert_('participants', Object.assign(
    { id: newId_(), session_id: s.id, status: 'joined', is_host: 'TRUE', created_at: ts, updated_at: ts, purged_at: '' },
    host
  ));
  notifySession_(type === 'group' ? 'group_opened' : 'booking_confirmed', s);
}

/** 修改時間、劇本或後台備註 */
function adminUpdateSession_(p) {
  const s = findSession_(p.session_id);
  expectStatus_(s, ACTIVE_STATUSES);
  const script = findScript_(p.script_id || s.script_id);
  const start = adminStartAbs_(p);
  const end = start + script.duration_min;
  if (OCCUPYING_STATUSES.indexOf(s.status) >= 0) assertNoConflict_(start, end, s.id);

  const before = { start_at: s.start_at, end_at: s.end_at, script_id: s.script_id };
  s.script_id = script.id;
  s.start_at = absToStr_(start);
  s.end_at = absToStr_(end);
  if (p.admin_note !== undefined) s.admin_note = String(p.admin_note || '').trim().slice(0, 500);
  saveSession_(s);
  if (before.start_at !== s.start_at || before.end_at !== s.end_at || before.script_id !== s.script_id) {
    notifySession_('session_changed', s, { previous: before });
  }
}

/* ───────── 參與者 ───────── */

function groupSessionOf_(participant) {
  const s = findSession_(participant.session_id);
  if (s.type !== 'group') fail_('invalid_status', '只有拼場可以調整參與者');
  expectStatus_(s, ['group_pending', 'recruiting', 'confirmed']);
  return s;
}

/** 管理者直接加入拼場參與者（狀態為已加入） */
function adminAddParticipant_(p) {
  const s = findSession_(p.session_id);
  if (s.type !== 'group') fail_('invalid_status', '只有拼場可以新增參與者');
  expectStatus_(s, ['group_pending', 'recruiting', 'confirmed']);
  const c = validateContact_(p.contact || {});
  assertCapacity_(s, c.count, null);
  const ts = nowStr_();
  const added = insert_('participants', Object.assign(
    { id: newId_(), session_id: s.id, status: 'joined', is_host: 'FALSE', created_at: ts, updated_at: ts, purged_at: '' },
    c
  ));
  notifySession_('participant_added', s, { participant: added });
}

/** 修改參與者資料與人數 */
function adminUpdateParticipant_(p) {
  const row = findParticipant_(p.participant_id);
  const s = findSession_(row.session_id);
  expectStatus_(s, ACTIVE_STATUSES);
  const c = validateContact_(p.contact || {});
  if (row.status === 'joined') {
    if (s.type === 'group') assertCapacity_(s, c.count, row.id);
    else {
      const script = loadScripts_().filter(function (x) { return x.id === s.script_id; })[0];
      if (script && c.count > script.players) fail_('count_exceeds', '人數不可超過劇本人數（' + script.players + ' 人）', { field: 'count' });
    }
  }
  Object.assign(row, c, { updated_at: nowStr_() });
  update_('participants', row);
}

function adminSetHost_(p) {
  const row = findParticipant_(p.participant_id);
  groupSessionOf_(row);
  if (row.status !== 'joined') fail_('invalid_status', '只有已加入的參與者可以設為主揪');
  const ts = nowStr_();
  readAll_('participants').forEach(function (x) {
    if (x.session_id !== row.session_id) return;
    const want = x.id === row.id ? 'TRUE' : 'FALSE';
    if (bool_(x.is_host) === (want === 'TRUE')) return;
    x.is_host = want;
    x.updated_at = ts;
    update_('participants', x);
  });
}

function adminRemoveParticipant_(p) {
  const row = findParticipant_(p.participant_id);
  groupSessionOf_(row);
  deleteRows_('participants', [row._row]);
}

function adminApproveApplication_(p) {
  const row = findParticipant_(p.participant_id);
  const s = groupSessionOf_(row);
  if (row.status !== 'applied') fail_('invalid_status', '此申請已處理過，請重新整理');
  assertCapacity_(s, int_(row.count) || 0, null);
  row.status = 'joined';
  row.updated_at = nowStr_();
  update_('participants', row);
  notifySession_('application_approved', s, { participant: row });
}

function adminRejectApplication_(p) {
  const row = findParticipant_(p.participant_id);
  const s = groupSessionOf_(row);
  if (row.status !== 'applied') fail_('invalid_status', '此申請已處理過，請重新整理');
  row.status = 'rejected';
  row.updated_at = nowStr_();
  update_('participants', row);
  notifySession_('application_rejected', s, { participant: row });
}

/* ───────── 關閉時段、劇本 ───────── */

function adminClosureCreate_(p) {
  const start = strToAbs_(p.start_at);
  const end = strToAbs_(p.end_at);
  if (start === null) fail_('invalid_field', '開始時間格式錯誤', { field: 'start_at' });
  if (end === null) fail_('invalid_field', '結束時間格式錯誤', { field: 'end_at' });
  if (end <= start) fail_('invalid_field', '結束時間需晚於開始時間', { field: 'end_at' });
  assertNoConflict_(start, end, null);
  insert_('closures', {
    id: newId_(),
    start_at: absToStr_(start),
    end_at: absToStr_(end),
    note: String(p.note || '').trim().slice(0, 500),
    created_at: nowStr_(),
  });
}

function adminClosureDelete_(p) {
  const row = readAll_('closures').filter(function (c) { return c.id === String(p.closure_id || ''); })[0];
  if (!row) fail_('not_found', '找不到此關閉時段');
  deleteRows_('closures', [row._row]);
}

function adminScriptToggle_(p) {
  const row = readAll_('scripts').filter(function (r) { return r.id === String(p.script_id || ''); })[0];
  if (!row) fail_('not_found', '找不到此劇本');
  row.active = p.active ? 'TRUE' : 'FALSE';
  update_('scripts', row);
}
