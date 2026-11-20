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

/* ---------- 官網劇本目錄（GET ?action=catalog） ----------
 * 官網建置時讀取，用於劇本總覽、詳細頁、首頁精選。只含公開資訊。
 * 欄位（試算表 scripts 分頁右側）：
 *   site_status   官網顯示：上架中／即將推出／隱藏（空白 = 依 active：上架→上架中、下架→隱藏）
 *   featured      TRUE = 首頁精選
 *   sort_order    排序（數字小的在前，空白排最後）
 *   badge         新上架／熱門（其他值不顯示）
 *   tagline       一句話簡介
 *   genres        類型標籤，以 / 、 , 分隔（例：推理/還原/戀陪）
 *   gender_advice 玩家性別建議（例：1女1男、不限）
 *   series        系列
 *   adapted       TRUE = 劇本繁化
 *   difficulty    推理難度 1–5（空白不顯示）
 *   hosts         主持人代號，以 , 分隔（對應官網 src/content/hosts 檔名，例：kaike）
 *   description   故事簡介（儲存格內換行；空一行 = 分段）
 *   author        作者
 *   features      特色，以 / 、 , 分隔（例：強設定推理/平行時空）
 *   suits         適合哪些玩家，以 / 、 , 分隔（例：喜歡設定推理/還原時間線）
 *   experience    經驗需求（例：新手可）
 *   reading_load  閱讀量（例：6000字／共同資訊多）
 *   curator_note  館長筆記（推薦詞，儲存格內換行即分段）
 *   crossplay     TRUE = 可反串（官網顯示「可反串」標記；空白／FALSE 不顯示）
 * 角色配置由 male／female 推算（兩者皆空白 = 不限）。
 */

const SITE_STATUSES_ = ['上架中', '即將推出', '隱藏'];
const SITE_BADGES_ = ['新上架', '熱門'];

function splitList_(v) {
  return String(v === undefined || v === null ? '' : v)
    .split(/[\/、,，]/)
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; });
}

function cellText_(v) {
  return String(v === undefined || v === null ? '' : v).replace(/\r\n?/g, '\n').trim();
}

function siteStatus_(r) {
  const s = cellText_(r.site_status);
  if (SITE_STATUSES_.indexOf(s) >= 0) return s;
  return bool_(r.active) ? '上架中' : '隱藏';
}

function catalogScript_(r) {
  const male = int_(r.male);
  const female = int_(r.female);
  const difficulty = int_(r.difficulty);
  const order = Number(cellText_(r.sort_order));
  const badge = cellText_(r.badge);
  return {
    id: cellText_(r.id),
    name: cellText_(r.name),
    site_status: siteStatus_(r),
    bookable: bool_(r.active),
    featured: bool_(r.featured),
    sort_order: cellText_(r.sort_order) !== '' && !isNaN(order) ? order : null,
    badge: SITE_BADGES_.indexOf(badge) >= 0 ? badge : null,
    tagline: cellText_(r.tagline),
    genres: splitList_(r.genres),
    players: isNaN(int_(r.players)) ? null : int_(r.players),
    duration_min: isNaN(int_(r.duration_min)) ? null : int_(r.duration_min),
    male: isNaN(male) ? null : male,
    female: isNaN(female) ? null : female,
    gender_advice: cellText_(r.gender_advice),
    series: cellText_(r.series),
    adapted: bool_(r.adapted),
    difficulty: difficulty >= 1 && difficulty <= 5 ? difficulty : null,
    hosts: splitList_(r.hosts),
    price: cellText_(r.price) === '' || isNaN(Number(r.price)) ? null : Number(r.price),
    description: cellText_(r.description),
    author: cellText_(r.author),
    features: splitList_(r.features),
    suits: splitList_(r.suits),
    experience: cellText_(r.experience),
    reading_load: cellText_(r.reading_load),
    curator_note: cellText_(r.curator_note),
    crossplay: bool_(r.crossplay),
  };
}

function handleCatalog_() {
  const scripts = readAll_('scripts')
    .map(catalogScript_)
    .filter(function (s) { return s.id && s.name && s.site_status !== '隱藏'; });
  return { ok: true, scripts: scripts };
}
