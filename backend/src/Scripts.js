/** 劇本資料 */

function loadScripts_() {
  return readAll_('scripts').map(function (r) {
    return {
      id: r.id,
      name: r.name,
      players: int_(r.players),
      duration_min: int_(r.duration_min),
      male: int_(r.male),
      female: int_(r.female),
      price: r.price === '' ? null : Number(r.price),
      active: bool_(r.active),
    };
  });
}

/** 資料完整、可供預約的劇本 */
function isUsableScript_(s) {
  return !!s.id && !!s.name && s.players > 0 && s.duration_min > 0;
}

function publicScript_(s) {
  return {
    id: s.id,
    name: s.name,
    players: s.players,
    duration_min: s.duration_min,
    male: isNaN(s.male) ? null : s.male,
    female: isNaN(s.female) ? null : s.female,
    price: s.price,
  };
}

function handleScripts_() {
  const scripts = loadScripts_()
    .filter(function (s) { return s.active && isUsableScript_(s); })
    .map(publicScript_);
  return { ok: true, scripts: scripts, rules: publicRules_() };
}
