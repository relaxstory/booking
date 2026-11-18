/** 時段佔用、衝突檢查與公開時間表 */

/** 所有佔用時段的區塊（場次 + 關閉時段），可排除指定場次（修改時用） */
function occupiedBlocks_(excludeSessionId) {
  const blocks = [];
  readAll_('sessions').forEach(function (s) {
    if (OCCUPYING_STATUSES.indexOf(s.status) < 0 || s.id === excludeSessionId) return;
    const a = strToAbs_(s.start_at);
    const b = strToAbs_(s.end_at);
    if (a !== null && b !== null) blocks.push({ start: a, end: b });
  });
  readAll_('closures').forEach(function (c) {
    const a = strToAbs_(c.start_at);
    const b = strToAbs_(c.end_at);
    if (a !== null && b !== null) blocks.push({ start: a, end: b });
  });
  return blocks;
}

function assertNoConflict_(start, end, excludeSessionId) {
  const hit = occupiedBlocks_(excludeSessionId).some(function (b) {
    return start < b.end && b.start < end;
  });
  if (hit) fail_('conflict', '此時段已有其他預約或不開放，請選擇其他時間');
}

/** 各場次「已加入」參與者的人數、男女數與主揪暱稱 */
function joinedTotals_(participants) {
  const out = {};
  participants.forEach(function (p) {
    if (p.status !== 'joined') return;
    const t = out[p.session_id] || (out[p.session_id] = { count: 0, male: 0, female: 0, host_nickname: '' });
    t.count += int_(p.count) || 0;
    t.male += int_(p.male) || 0;
    t.female += int_(p.female) || 0;
    if (bool_(p.is_host)) t.host_nickname = p.nickname;
  });
  return out;
}

/** 前台用的場次區塊：只含公開資訊 */
function publicSessionBlock_(s, script, joined) {
  const block = {
    kind: 'session',
    type: s.type,
    status: PUBLIC_STATUS[s.status],
    script_name: script ? script.name : '',
    start_at: s.start_at,
    end_at: s.end_at,
  };
  if (s.status === 'recruiting') {
    const j = joined || { count: 0, male: 0, female: 0, host_nickname: '' };
    const players = script ? script.players : 0;
    block.id = s.id;
    block.players = players;
    block.joined = j.count;
    block.missing_male = Math.max(0, (script && !isNaN(script.male) ? script.male : 0) - j.male);
    block.missing_female = Math.max(0, (script && !isNaN(script.female) ? script.female : 0) - j.female);
    block.host_nickname = j.host_nickname;
  }
  return block;
}

function handleSchedule_(p) {
  const fromDay = dayNum_(p.from);
  const toDay = dayNum_(p.to);
  if (fromDay === null || toDay === null || toDay < fromDay) fail_('invalid_range', '查詢日期範圍錯誤');
  if (toDay - fromDay + 1 > RULES.maxScheduleDays) fail_('invalid_range', '單次最多查詢 ' + RULES.maxScheduleDays + ' 天');
  const rangeStart = fromDay * 1440;
  const rangeEnd = (toDay + 1) * 1440;
  const overlaps = function (a, b) {
    return a !== null && b !== null && a < rangeEnd && rangeStart < b;
  };

  const scripts = indexBy_(loadScripts_(), 'id');
  const joined = joinedTotals_(readAll_('participants'));
  const blocks = [];

  readAll_('sessions').forEach(function (s) {
    if (OCCUPYING_STATUSES.indexOf(s.status) < 0) return;
    if (!overlaps(strToAbs_(s.start_at), strToAbs_(s.end_at))) return;
    blocks.push(publicSessionBlock_(s, scripts[s.script_id], joined[s.id]));
  });
  readAll_('closures').forEach(function (c) {
    if (!overlaps(strToAbs_(c.start_at), strToAbs_(c.end_at))) return;
    blocks.push({ kind: 'closure', start_at: c.start_at, end_at: c.end_at });
  });

  blocks.sort(function (a, b) {
    return a.start_at < b.start_at ? -1 : a.start_at > b.start_at ? 1 : 0;
  });
  return { ok: true, from: dayStr_(fromDay), to: dayStr_(toDay), blocks: blocks, rules: publicRules_() };
}
