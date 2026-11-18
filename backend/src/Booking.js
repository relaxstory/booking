/** 前台：包場／拼團登記、申請加入拼場 */

function handleBook_(p) {
  if (isBot_(p)) return { ok: true, status: 'received' };

  const contact = validateContact_(p);
  const scriptId = String(p.script_id || '').trim();
  if (!scriptId) fail_('missing_field', '請選擇劇本', { field: 'script_id' });

  const day = dayNum_(p.date);
  if (day === null) fail_('invalid_field', '日期格式錯誤', { field: 'date' });
  const w = bookingWindow_();
  if (day < w.minDay || day > w.maxDay) {
    fail_('date_out_of_range', '可預約日期為 ' + w.minDate + ' 至 ' + w.maxDate + '（不可預約當天）', { field: 'date' });
  }

  const startMin = hmToMin_(p.start);
  if (startMin === null || startMin < RULES.earliestStart || startMin > RULES.latestStart || startMin % RULES.slotMinutes !== 0) {
    fail_('invalid_start', '開場時間需為 09:00–19:00 的整點或半點', { field: 'start' });
  }

  const passcode = normalizePasscode_(p.passcode);
  rateLimit_(contact.email);

  return withLock_(function () {
    const script = loadScripts_().filter(function (s) {
      return s.id === scriptId && s.active && isUsableScript_(s);
    })[0];
    if (!script) fail_('script_not_found', '找不到此劇本，或劇本已下架', { field: 'script_id' });

    if (contact.count > script.players) {
      fail_('count_exceeds', '人數不可超過劇本人數（' + script.players + ' 人）', { field: 'count' });
    }
    const full = contact.count === script.players;
    if (passcode && !full) fail_('passcode_requires_full', '通關碼僅適用於人數已滿的包場', { field: 'passcode' });

    const start = day * 1440 + startMin;
    const end = start + script.duration_min;
    assertNoConflict_(start, end, null);

    const pc = passcode ? findUsablePasscode_(passcode) : null;
    const type = full ? 'private' : 'group';
    const status = !full ? 'group_pending' : pc ? 'confirmed' : 'pending';
    const ts = nowStr_();
    const sessionId = newId_();

    const session = insert_('sessions', {
      id: sessionId,
      type: type,
      script_id: script.id,
      start_at: absToStr_(start),
      end_at: absToStr_(end),
      status: status,
      passcode: pc ? pc.code : '',
      created_at: ts,
      updated_at: ts,
      admin_note: '',
    });
    const host = insert_('participants', Object.assign(
      { id: newId_(), session_id: sessionId, status: 'joined', is_host: 'TRUE', created_at: ts, updated_at: ts, purged_at: '' },
      contact
    ));
    if (pc) consumePasscode_(pc, sessionId);

    notify_('booking_submitted', { session: session, script: script, participants: [host] });
    return { ok: true, status: status, session_id: sessionId, start_at: session.start_at, end_at: session.end_at };
  });
}

function handleJoin_(p) {
  if (isBot_(p)) return { ok: true, status: 'received' };

  const contact = validateContact_(p);
  const sessionId = String(p.session_id || '').trim();
  if (!sessionId) fail_('missing_field', '缺少場次', { field: 'session_id' });
  rateLimit_(contact.email);

  return withLock_(function () {
    const session = readAll_('sessions').filter(function (s) { return s.id === sessionId; })[0];
    if (!session || session.type !== 'group' || session.status !== 'recruiting') {
      fail_('not_recruiting', '此場次目前未開放申請加入');
    }
    if (Math.floor(strToAbs_(session.start_at) / 1440) < bookingWindow_().minDay) {
      fail_('join_closed', '申請加入需於場次前一天以前送出');
    }

    const script = loadScripts_().filter(function (s) { return s.id === session.script_id; })[0];
    const players = script ? script.players : 0;
    const joined = joinedTotals_(readAll_('participants'))[session.id];
    const remaining = players - (joined ? joined.count : 0);
    if (contact.count > remaining) {
      fail_('exceeds_remaining', '人數超過剩餘名額（剩 ' + Math.max(0, remaining) + ' 人）', { field: 'count' });
    }

    const ts = nowStr_();
    const applicant = insert_('participants', Object.assign(
      { id: newId_(), session_id: session.id, status: 'applied', is_host: 'FALSE', created_at: ts, updated_at: ts, purged_at: '' },
      contact
    ));
    notify_('join_applied', { session: session, script: script, participants: [applicant] });
    return { ok: true, status: 'applied' };
  });
}
