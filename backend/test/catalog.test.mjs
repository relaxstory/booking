import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGas } from './gas-mock.mjs';

let gas;

beforeEach(() => {
  gas = createGas('2026-11-20T10:00:00+08:00');
  gas.setup(); // 含測試用範例劇本 s-sample-1～3（s-sample-3 下架）
  gas.run('importOfficialScripts()');
});

const catalog = () => gas.get({ action: 'catalog' }).scripts;
const edit = (id, fields) =>
  gas.run(`(function(){ const r = readAll_('scripts').filter(function (x) { return x.id === ${JSON.stringify(id)}; })[0]; Object.assign(r, ${JSON.stringify(fields)}); update_('scripts', r); })()`);

test('setup 會補上官網目錄欄位', () => {
  const header = gas.rows('scripts')[0];
  for (const k of ['site_status', 'featured', 'sort_order', 'badge', 'tagline', 'genres', 'gender_advice', 'series', 'adapted', 'difficulty', 'hosts', 'description', 'author', 'features', 'suits', 'experience', 'reading_load', 'curator_note']) {
    assert.ok(k in header, k);
  }
});

test('catalog：site_status 空白時依 active 決定；隱藏的不回傳', () => {
  const ids = catalog().map((s) => s.id);
  assert.ok(ids.includes('s-sample-1'));
  assert.ok(!ids.includes('s-sample-3'), '下架且未指定 site_status → 隱藏');

  edit('s-sample-3', { site_status: '即將推出' });
  const soon = catalog().find((s) => s.id === 's-sample-3');
  assert.equal(soon.site_status, '即將推出');
  assert.equal(soon.bookable, false);

  edit('s-sample-1', { site_status: '隱藏' });
  assert.ok(!catalog().some((s) => s.id === 's-sample-1'));
});

test('importSiteCatalog：填入官網資料，只填空白欄位，可重複執行', () => {
  edit('diesu', { tagline: '店主自己改過的簡介' });
  gas.run('importSiteCatalog()');

  const c = catalog();
  const chutao = c.find((s) => s.id === 'chutao-lianticun');
  assert.deepEqual(
    { featured: chutao.featured, badge: chutao.badge, genres: chutao.genres, adapted: chutao.adapted, hosts: chutao.hosts, male: chutao.male, female: chutao.female, sort_order: chutao.sort_order },
    { featured: true, badge: '新上架', genres: ['推理', '還原', '戀陪'], adapted: true, hosts: ['kaike'], male: 1, female: 4, sort_order: 1 },
  );
  assert.equal(c.find((s) => s.id === 'diesu').tagline, '店主自己改過的簡介', '已填的內容不覆蓋');
  const half = c.find((s) => s.id === 'half-world-deduction');
  assert.deepEqual([half.male, half.female, half.badge, half.featured], [null, null, '熱門', true]);
  assert.deepEqual(c.filter((s) => s.featured).map((s) => s.id).sort(), ['chutao-lianticun', 'diesu', 'half-world-deduction']);

  gas.run('importSiteCatalog()');
  assert.equal(catalog().length, c.length);
});

test('catalog：欄位整理（分隔符號、換行、無效值）', () => {
  edit('diesu', {
    genres: '推理、還原, 沉浸／', hosts: 'kaike, daidai', badge: '亂填', difficulty: '9',
    description: '第一段\r\n\r\n第二段', price: '650', sort_order: '',
  });
  const d = catalog().find((s) => s.id === 'diesu');
  assert.deepEqual(d.genres, ['推理', '還原', '沉浸／']);
  assert.deepEqual(d.hosts, ['kaike', 'daidai']);
  assert.equal(d.badge, null);
  assert.equal(d.difficulty, null);
  assert.equal(d.description, '第一段\n\n第二段');
  assert.equal(d.price, 650);
  assert.equal(d.sort_order, null);
});

test('catalog 不含任何預約或個資欄位', () => {
  gas.run('importSiteCatalog()');
  const keys = new Set(catalog().flatMap((s) => Object.keys(s)));
  for (const k of ['name_', 'phone', 'email', 'line_id', 'ig', 'note', '_row']) assert.ok(!keys.has(k), k);
});

test('catalog：簡介、館長筆記、適性資訊（蝶溯）', () => {
  gas.run('importSiteCatalog()');
  const d = catalog().find((s) => s.id === 'diesu');
  assert.equal(d.author, '小游《請將我深埋》');
  assert.deepEqual(d.features, ['強設定推理', '平行時空']);
  assert.deepEqual(d.suits, ['喜歡設定推理', '還原時間線']);
  assert.equal(d.experience, '新手可');
  assert.equal(d.reading_load, '6000字／共同資訊多');
  assert.match(d.curator_note, /命運的交錯感/);
  assert.deepEqual(d.genres, ['推理', '還原', '沉浸', '可反串']);
  const paras = d.description.split('\n\n');
  assert.equal(paras.length, 6);
  assert.equal(paras[0], '如何殺死一個死亡回溯者？');
  assert.equal(paras[3].split('\n').length, 3);
  // 其他劇本沒有這些資料時為空值
  const c = catalog().find((s) => s.id === 'tongliu-hewu');
  assert.deepEqual([c.author, c.features, c.suits, c.curator_note], ['', [], [], '']);
});
