import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Block } from '../src/api.ts';
import { axisLength, splitByDay, startOptions } from '../src/layout.ts';
import { dayNum, durationLabel, mondayOf, rangeLabel, weekdayOf } from '../src/time.ts';

const D = dayNum('2026-11-20'); // 星期五

const session = (start: string, end: string): Block => ({ kind: 'session', type: 'private', status: 'booked', script_name: 'X', start_at: start, end_at: end });

test('星期與週一', () => {
  assert.equal(weekdayOf(D), 4);
  assert.equal(mondayOf(D), dayNum('2026-11-16'));
  assert.equal(mondayOf(dayNum('2026-11-16')), dayNum('2026-11-16'));
  assert.equal(mondayOf(dayNum('2026-11-22')), dayNum('2026-11-16'));
});

test('一般場次落在當天，位置從 09:00 起算', () => {
  const m = splitByDay([session('2026-11-20 14:00', '2026-11-20 18:00')], D, D);
  const [s] = m.get(D)!;
  assert.equal(s.start, 300);
  assert.equal(s.end, 540);
  assert.equal(s.cutBefore || s.cutAfter, false);
});

test('跨午夜的晚場留在同一個營業日欄位', () => {
  const m = splitByDay([session('2026-11-20 19:00', '2026-11-21 01:00')], D, D + 1);
  assert.equal(m.get(D)!.length, 1);
  assert.equal(m.get(D)![0].end, 16 * 60); // 隔天 01:00
  assert.equal(m.get(D + 1)!.length, 0);
  assert.equal(axisLength(m.values()), 16 * 60);
});

test('跨過 09:00 的關閉時段拆成兩段', () => {
  const closure: Block = { kind: 'closure', start_at: '2026-11-20 22:00', end_at: '2026-11-21 12:00' };
  const m = splitByDay([closure], D, D + 1);
  const a = m.get(D)![0];
  const b = m.get(D + 1)![0];
  assert.deepEqual([a.start, a.end, a.cutAfter], [13 * 60, 24 * 60, true]);
  assert.deepEqual([b.start, b.end, b.cutBefore], [0, 3 * 60, true]);
});

test('時間軸預設到 23:00', () => {
  assert.equal(axisLength(splitByDay([], D, D).values()), 14 * 60);
});

test('可選開場時間：重疊的時段不可選，剛好接上可選', () => {
  const blocks = [session('2026-11-20 14:00', '2026-11-20 18:00')];
  const opts = startOptions(D, 240, blocks, 9 * 60, 19 * 60, 30);
  const avail = (hm: string) => opts.find((o) => o.start === Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)))!.available;
  assert.equal(opts.length, 21);
  assert.equal(avail('10:00'), true); // 10:00–14:00
  assert.equal(avail('10:30'), false);
  assert.equal(avail('17:30'), false);
  assert.equal(avail('18:00'), true);
});

test('可選開場時間會考慮前一天跨午夜的場次', () => {
  const blocks = [session('2026-11-19 19:00', '2026-11-20 10:00')];
  const opts = startOptions(D, 120, blocks, 9 * 60, 19 * 60, 30);
  assert.equal(opts[0].available, false); // 09:00
  assert.equal(opts[2].available, true); // 10:00
});

test('文字格式', () => {
  assert.equal(durationLabel(240), '4 小時');
  assert.equal(durationLabel(210), '3.5 小時');
  assert.equal(durationLabel(135), '2 小時 15 分');
  assert.equal(rangeLabel(D * 1440 + 840, D * 1440 + 1080), '14:00–18:00');
  assert.equal(rangeLabel(D * 1440 + 1140, D * 1440 + 1500), '19:00–隔天 01:00');
  assert.equal(rangeLabel(D * 1440 + 1140, D * 1440 + 1440), '19:00–24:00');
});
