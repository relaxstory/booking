/**
 * 通知信（spec 第 7 節）。以 MailApp 寄出純文字信，寄件人為部署者的 Google 帳號。
 *
 * notify_(event, { session, script, participants, participant?, previous? })
 *   participants：該場「已加入」的參與者；participant：單一對象（申請者、被核准者等）
 *
 * 前台事件：
 *   booking_submitted     包場／拼團登記送出 → 登記者；依場次狀態改寄：
 *                           已預約（有通關碼）→ 預約成立
 *                           包場待確認 → booking_received（已收到包場登記）
 *                           拼團待確認 → group_received（已收到拼團登記）
 *   join_applied          送出加入拼場申請 → participant
 * 後台事件：
 *   booking_confirmed     包場確認，或後台直接建立包場 → 登記者
 *   group_opened          拼團待確認被確認，或後台直接建立拼場 → 主揪
 *   booking_rejected      拒絕 → 登記者
 *   session_changed       修改時間或劇本（previous 為原本的場次）→ 該場所有人
 *   booking_cancelled     取消 → 該場所有人
 *   group_failed          拼團失敗取消 → 該場所有人
 *   group_formed          成團（轉為已預約）→ 該場所有人
 *   application_approved  加入申請核准 → participant
 *   application_rejected  加入申請拒絕 → participant
 *   participant_added     管理者直接加入拼場 → participant
 * 排程事件：
 *   reminder              開場前一日提醒 → 該場所有人
 *
 * 寄信失敗不影響原本的操作（只記錄到執行紀錄）。
 */

/** 寄給登記者（主揪）的事件 */
const HOST_EVENTS_ = ['booking_submitted', 'booking_received', 'group_received', 'booking_confirmed', 'group_opened', 'booking_rejected'];
/** 寄給單一參與者的事件 */
const PARTICIPANT_EVENTS_ = ['join_applied', 'application_approved', 'application_rejected', 'participant_added'];

function notify_(event, data) {
  try {
    if (event === 'booking_submitted') {
      const st = data.session.status;
      if (st === 'pending') event = 'booking_received';
      else if (st === 'group_pending') event = 'group_received';
      else if (st !== 'confirmed') return 0;
    }
    let sent = 0;
    mailRecipients_(event, data).forEach(function (p) {
      if (sendMail_(p.email, buildMail_(event, data, p))) sent++;
    });
    return sent;
  } catch (e) {
    console.error('notify_ 失敗：' + event, e && e.stack ? e.stack : e);
    return 0;
  }
}

/** 收件的參與者列（同一 Email 只寄一次） */
function mailRecipients_(event, data) {
  const all = data.participants || [];
  let list;
  if (PARTICIPANT_EVENTS_.indexOf(event) >= 0) {
    list = data.participant ? [data.participant] : all.slice(0, 1);
  } else if (HOST_EVENTS_.indexOf(event) >= 0) {
    list = all.filter(function (p) { return bool_(p.is_host); });
    if (!list.length) list = all;
  } else {
    list = all;
  }
  const seen = {};
  return list.filter(function (p) {
    const key = String(p.email || '').trim().toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

/** 測試用的保留網域（example.com、.test 等）不實際寄出 */
function isDeliverable_(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !/@(.+\.)?example\.(com|net|org)$/.test(e) && !/\.(test|example|invalid|localhost)$/.test(e);
}

function sendMail_(to, mail) {
  if (!isDeliverable_(to)) return false;
  try {
    MailApp.sendEmail({ to: String(to).trim(), subject: mail.subject, body: mail.body, name: SHOP.name });
    return true;
  } catch (e) {
    console.error('寄信失敗：' + mail.subject, e && e.stack ? e.stack : e);
    return false;
  }
}

/* ---------- 信件內容 ---------- */

const WEEKDAYS_ = ['日', '一', '二', '三', '四', '五', '六'];

/** 'yyyy-MM-dd HH:mm' → '2026/11/20（五）' */
function mailDate_(dt) {
  const day = dayNum_(String(dt || '').slice(0, 10));
  if (day === null) return String(dt || '');
  return dayStr_(day).replace(/-/g, '/') + '（' + WEEKDAYS_[(day + 4) % 7] + '）';
}

/** 場次時間：'2026/11/20（五）14:00–18:00'（跨日時結束時間加註日期） */
function mailTime_(s) {
  const start = String(s.start_at || '');
  const end = String(s.end_at || '');
  const endText = end.slice(0, 10) === start.slice(0, 10) ? end.slice(11, 16) : mailDate_(end) + ' ' + end.slice(11, 16);
  return mailDate_(start) + ' ' + start.slice(11, 16) + '–' + endText;
}

function scriptLabel_(script) {
  if (!script) return '（劇本資料不存在）';
  const parts = [];
  if (script.players > 0) parts.push(script.players + ' 人');
  if (script.duration_min > 0) parts.push(durationText_(script.duration_min));
  return script.name + (parts.length ? '（' + parts.join('・') + '）' : '');
}

function durationText_(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return (h ? h + ' 小時' : '') + (m ? m + ' 分' : '');
}

function groupText_(p) {
  const count = int_(p.count) || 0;
  const male = int_(p.male) || 0;
  const female = int_(p.female) || 0;
  return count + ' 人（男 ' + male + '・女 ' + female + '）';
}

/** 場次摘要（劇本、時間、類型、人數） */
function sessionLines_(data, p) {
  const s = data.session;
  const lines = [
    '劇本：' + scriptLabel_(data.script),
    '時間：' + mailTime_(s),
    '類型：' + (s.type === 'group' ? '拼場' : '包場'),
  ];
  if (p) lines.push('你這組：' + groupText_(p) + (bool_(p.is_host) && s.type === 'group' ? '・主揪' : ''));
  if (s.type === 'group' && data.script && data.script.players > 0) {
    const joined = (data.participants || []).reduce(function (n, x) { return n + (int_(x.count) || 0); }, 0);
    lines.push('目前人數：' + joined + '/' + data.script.players + ' 人');
  }
  return lines;
}

function contactLine_() {
  return SHOP.contact ? '請聯繫店家（' + SHOP.contact + '）' : '請直接回覆此信與店家聯繫';
}

/** 依事件組出主旨與內文 */
function buildMail_(event, data, p) {
  const s = data.session;
  const scriptName = data.script ? data.script.name : '';
  const when = mailDate_(s.start_at) + ' ' + String(s.start_at).slice(11, 16);
  let subject;
  let intro;
  let after = [];

  switch (event) {
    case 'booking_submitted':
    case 'booking_confirmed':
      subject = '預約成立：' + when + ' ' + scriptName;
      intro = '你的包場預約已成立，期待你的光臨！';
      break;
    case 'booking_received':
      subject = '已收到包場登記：' + when + ' ' + scriptName;
      intro = '已收到你的包場登記，目前為「待確認」，此時段已先為你保留。店家確認後會再寄信通知你。';
      break;
    case 'group_received':
      subject = '已收到拼團登記：' + when + ' ' + scriptName;
      intro = '已收到你的拼團登記，目前為「拼團待確認」。店家確認後會公開在時間表上開始招募，並再寄信通知你；確認前此時段尚未保留。';
      break;
    case 'group_opened':
      subject = '拼場開始招募：' + when + ' ' + scriptName;
      intro = '你發起的拼場已公開在時間表上，開始招募其他玩家。';
      after = ['人數湊齊後，店家會將場次改為「已預約」並寄信通知你。', '想邀請朋友加入，可以請他們在時間表上點此場次「申請加入」：' + SHOP.url];
      break;
    case 'booking_rejected':
      subject = '預約未成立：' + when + ' ' + scriptName;
      intro = '很抱歉，你登記的以下場次未能成立，時段已釋出。';
      after = ['如需改約其他時間，' + contactLine_() + '。'];
      break;
    case 'session_changed': {
      const prev = data.previous || {};
      const prevScript = prev.script_id && prev.script_id !== s.script_id
        ? (loadScripts_().filter(function (x) { return x.id === prev.script_id; })[0] || null)
        : null;
      subject = '場次異動：' + when + ' ' + scriptName;
      intro = '店家已修改你的場次，請確認新的內容：';
      after = ['原本：' + mailTime_(prev) + (prevScript ? '・' + prevScript.name : '')];
      break;
    }
    case 'booking_cancelled':
      subject = '場次已取消：' + when + ' ' + scriptName;
      intro = '以下場次已由店家取消。';
      after = ['如有疑問，' + contactLine_() + '。'];
      break;
    case 'group_failed':
      subject = '拼場未成團，場次取消：' + when + ' ' + scriptName;
      intro = '很可惜，以下拼場未能湊齊人數，場次已取消。';
      after = ['如想改約其他時間，' + contactLine_() + '。'];
      break;
    case 'group_formed':
      subject = '拼場成團，預約成立：' + when + ' ' + scriptName;
      intro = '好消息！你參加的拼場已成團，預約成立，期待你的光臨！';
      break;
    case 'join_applied':
      subject = '已收到加入申請：' + when + ' ' + scriptName;
      intro = '已收到你加入以下拼場的申請。目前為「申請中」，尚未計入人數；店家核准或拒絕後會再寄信通知你。';
      break;
    case 'application_approved':
      subject = '加入申請已核准：' + when + ' ' + scriptName;
      intro = '你的加入申請已核准，已計入此拼場人數。';
      after = s.status === 'confirmed' ? [] : ['此場次目前仍在招募中，成團後會再寄信通知你。'];
      break;
    case 'application_rejected':
      subject = '加入申請未通過：' + when + ' ' + scriptName;
      intro = '很抱歉，你加入以下拼場的申請未通過。';
      after = ['歡迎到時間表看看其他場次：' + SHOP.url];
      break;
    case 'participant_added':
      subject = '你已加入拼場：' + when + ' ' + scriptName;
      intro = '店家已將你加入以下拼場。';
      after = s.status === 'confirmed' ? [] : ['此場次目前仍在招募中，成團後會再寄信通知你。'];
      break;
    case 'reminder':
      subject = '明天見！場次提醒：' + when + ' ' + scriptName;
      intro = '提醒你，明天就是預約的場次了：';
      break;
    default:
      subject = '場次通知：' + when + ' ' + scriptName;
      intro = '你的場次有更新：';
  }

  const lines = [(p && (p.nickname || p.name) ? (p.nickname || p.name) : '你') + ' 你好：', '', intro, '', sessionLines_(data, p).join('\n')];
  if (after.length) lines.push('', after.join('\n'));
  if (event !== 'booking_rejected' && event !== 'booking_cancelled' && event !== 'group_failed' && event !== 'application_rejected') {
    lines.push('', '如需修改或取消，' + contactLine_() + '。');
  }
  lines.push('', '時間表：' + SHOP.url, '', '—— ' + SHOP.name, '（此信由預約系統自動寄出）');
  return { subject: '【' + SHOP.name + '】' + subject, body: lines.join('\n') };
}
