import { h } from '../../dom.ts';
import { axisLength, DAY_START, splitByDay, type Segment } from '../../layout.ts';
import { DAY_MS, dateLabel, dayNum, minToHm, mondayOf, rangeLabel, shortDate, weekdayOf, WEEKDAYS } from '../../time.ts';
import { OCCUPYING, type AdminApp } from '../app.ts';
import type { AdminClosure, AdminSession } from '../api.ts';
import { STATUS_CLASS, STATUS_LABEL, headcount, host } from '../format.ts';
import { openClosure, openClosureForm } from './closure.ts';
import { openSession, openSessionForm } from './session.ts';

interface Item {
  start_at: string;
  end_at: string;
  session?: AdminSession;
  closure?: AdminClosure;
}

function itemsOf(app: AdminApp): Item[] {
  const d = app.data!;
  return [
    ...d.sessions.filter((s) => OCCUPYING.includes(s.status)).map((s) => ({ start_at: s.start_at, end_at: s.end_at, session: s })),
    ...d.closures.map((c) => ({ start_at: c.start_at, end_at: c.end_at, closure: c })),
  ];
}

function monthFirst(day: number, delta = 0): number {
  const t = new Date(day * DAY_MS);
  return Math.round(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + delta, 1) / DAY_MS);
}

function openItem(app: AdminApp, it: Item): void {
  if (it.session) openSession(app, it.session.id);
  else if (it.closure) openClosure(app, it.closure);
}

export function renderCalendar(app: AdminApp): HTMLElement {
  const week = app.calMode === 'week';
  const go = (delta: number) =>
    app.navigate(() => {
      if (week) {
        app.anchor += delta * 7;
        app.selectedDay = app.anchor <= app.today && app.today < app.anchor + 7 ? app.today : app.anchor;
      } else {
        app.anchor = monthFirst(app.anchor, delta);
      }
    });
  const goToday = () =>
    app.navigate(() => {
      app.anchor = week ? mondayOf(app.today) : monthFirst(app.today);
      app.selectedDay = app.today;
    });
  const setMode = (mode: 'week' | 'month') =>
    app.navigate(() => {
      if (mode === app.calMode) return;
      app.calMode = mode;
      const focus = mode === 'month' ? app.selectedDay : app.selectedDay >= app.anchor && app.selectedDay < monthFirst(app.anchor, 1) ? app.selectedDay : app.anchor;
      app.anchor = mode === 'month' ? monthFirst(focus) : mondayOf(focus);
      app.selectedDay = focus;
    });

  const t = new Date(app.anchor * DAY_MS);
  const label = week ? `${shortDate(app.anchor)} – ${shortDate(app.anchor + 6)}` : `${t.getUTCFullYear()} 年 ${t.getUTCMonth() + 1} 月`;
  const newDay = Math.max(app.today, app.selectedDay);

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'week-nav' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': week ? '上一週' : '上個月', onclick: () => go(-1) }, '‹'),
      h('span', { class: 'week-label' }, label),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': week ? '下一週' : '下個月', onclick: () => go(1) }, '›'),
      h('button', { class: 'text-btn', type: 'button', onclick: goToday }, '今天'),
    ),
    h('div', { class: 'seg', role: 'group', 'aria-label': '檢視' },
      h('button', { type: 'button', class: week ? 'is-on' : '', 'aria-pressed': String(week), onclick: () => setMode('week') }, '週'),
      h('button', { type: 'button', class: week ? '' : 'is-on', 'aria-pressed': String(!week), onclick: () => setMode('month') }, '月'),
    ),
    h('div', { class: 'toolbar-actions' },
      h('button', { class: 'secondary-btn', type: 'button', onclick: () => openClosureForm(app, { day: newDay }) }, '＋ 關閉時段'),
      h('button', { class: 'primary-btn', type: 'button', onclick: () => openSessionForm(app, { prefill: { day: newDay } }) }, '＋ 新增場次'),
    ),
  );

  const [from, to] = app.range();
  const d = app.data!;
  const ready = dayNum(d.from) <= from && dayNum(d.to) >= to;
  const body = !ready
    ? h('div', { class: 'grid-wrap is-loading' }, h('p', { class: 'loading' }, '載入時間表…'))
    : week ? renderWeek(app) : renderMonth(app);

  return h('section', { class: 'schedule admin-cal' },
    toolbar,
    body,
    h('div', { class: 'legend' },
      ...(['confirmed', 'pending', 'recruiting'] as const).map((st) => h('span', { class: 'legend-item' }, h('span', { class: `swatch ${STATUS_CLASS[st]}` }), STATUS_LABEL[st])),
      h('span', { class: 'legend-item' }, h('span', { class: 'swatch block-closure' }), '關閉時段'),
    ),
    h('p', { class: 'help' }, '點選空白處新增場次；點選區塊查看詳細。拼團待確認不佔用時段，請到「待處理」查看。'),
  );
}

/* ───────── 週 ───────── */

function renderWeek(app: AdminApp): HTMLElement {
  const days = Array.from({ length: 7 }, (_, i) => app.anchor + i);
  if (app.selectedDay < days[0] || app.selectedDay > days[6]) app.selectedDay = days[0];
  const byDay = splitByDay(itemsOf(app), days[0], days[6]);
  const axis = axisLength(byDay.values());
  const hours: number[] = [];
  for (let m = 0; m <= axis; m += 60) hours.push(m);

  const wrap = h('div', { class: 'grid-wrap' });
  const select = (day: number) => {
    app.selectedDay = day;
    wrap.parentElement?.querySelectorAll('[data-day]').forEach((el) => {
      const on = Number((el as HTMLElement).dataset.day) === day;
      el.classList.toggle('is-selected', on);
      if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected', String(on));
    });
  };

  const strip = h('div', { class: 'day-strip', role: 'tablist' },
    days.map((day) =>
      h('button', {
        type: 'button',
        class: `day-chip${day === app.selectedDay ? ' is-selected' : ''}${day < app.today ? ' is-past' : ''}`,
        role: 'tab',
        'aria-selected': String(day === app.selectedDay),
        'data-day': day,
        onclick: () => select(day),
      }, h('span', { class: 'chip-wd' }, WEEKDAYS[weekdayOf(day)]), h('span', { class: 'chip-date' }, shortDate(day))),
    ),
  );

  const head = h('div', { class: 'grid-head' },
    h('div', { class: 'gutter' }),
    days.map((day) =>
      h('div', { class: `col-head${day === app.selectedDay ? ' is-selected' : ''}${day === app.today ? ' is-today' : ''}`, 'data-day': day },
        h('span', { class: 'chip-wd' }, WEEKDAYS[weekdayOf(day)]),
        h('span', { class: 'chip-date' }, shortDate(day)),
      ),
    ),
  );

  const cols = days.map((day) => {
    const open = day >= app.today;
    const col = h('div', {
      class: `day-col${day === app.selectedDay ? ' is-selected' : ''}${open ? ' is-bookable' : ' is-closed'}`,
      'data-day': day,
      'aria-label': dateLabel(day),
      title: open ? '點選空白處新增場次' : undefined,
    }, (byDay.get(day) ?? []).map((seg) => renderBlock(app, seg)));
    if (open) {
      col.addEventListener('click', (ev) => {
        if (ev.target !== col) return;
        const rect = col.getBoundingClientRect();
        const min = DAY_START + Math.floor(((ev.clientY - rect.top) / (rect.height / axis)) / 30) * 30;
        openSessionForm(app, { prefill: { day, start: Math.min(19 * 60, Math.max(9 * 60, min)) } });
      });
    }
    return col;
  });

  wrap.append(h('div', { class: 'grid', style: `--axis:${axis}` },
    head,
    h('div', { class: 'grid-body' },
      h('div', { class: 'gutter' }, hours.map((m) => h('span', { class: 'hour', style: `--at:${m}` }, minToHm((m + DAY_START) % 1440)))),
      cols,
    ),
  ));
  return h('div', null, strip, wrap);
}

function renderBlock(app: AdminApp, seg: Segment<Item>): HTMLElement {
  const it = seg.block;
  const style = `--top:${seg.start};--len:${seg.end - seg.start}`;
  const cut = `${seg.cutBefore ? ' cut-before' : ''}${seg.cutAfter ? ' cut-after' : ''}`;
  const time = rangeLabel(seg.startAbs, seg.endAbs);
  const onclick = () => openItem(app, it);
  if (it.closure) {
    return h('button', { type: 'button', class: `block block-closure is-clickable${cut}`, style, onclick },
      h('span', { class: 'block-title' }, '關閉時段'),
      h('span', { class: 'block-time' }, time),
      it.closure.note && h('span', { class: 'block-meta' }, it.closure.note),
    );
  }
  const s = it.session!;
  const hp = host(s);
  return h('button', { type: 'button', class: `block ${STATUS_CLASS[s.status]} is-clickable${cut}`, style, onclick },
    h('span', { class: 'block-title' }, s.script_name),
    h('span', { class: 'block-time' }, time),
    h('span', { class: 'block-meta' }, h('span', { class: 'badge' }, STATUS_LABEL[s.status]), ` ${headcount(s)}`),
    hp && h('span', { class: 'block-meta' }, hp.nickname),
  );
}

/* ───────── 月 ───────── */

function itemLine(app: AdminApp, seg: Segment<Item>, withStatus: boolean): HTMLElement {
  const it = seg.block;
  const cls = it.closure ? 'block-closure' : STATUS_CLASS[it.session!.status];
  const start = seg.cutBefore ? '…' : minToHm(seg.startAbs % 1440);
  return h('button', { type: 'button', class: `m-item ${cls}`, onclick: () => openItem(app, it) },
    h('span', { class: 'm-time' }, start),
    h('span', { class: 'm-name' }, it.closure ? `關閉${it.closure.note ? `・${it.closure.note}` : ''}` : it.session!.script_name),
    withStatus && it.session && h('span', { class: 'm-status' }, `${STATUS_LABEL[it.session.status]}・${headcount(it.session)}`),
  );
}

function renderMonth(app: AdminApp): HTMLElement {
  const first = app.anchor;
  const next = monthFirst(first, 1);
  const start = mondayOf(first);
  const byDay = splitByDay(itemsOf(app), start, start + 41);
  const toWeek = (day: number) =>
    app.navigate(() => {
      app.calMode = 'week';
      app.anchor = mondayOf(day);
      app.selectedDay = day;
    });

  const grid = h('div', { class: 'month-grid' },
    WEEKDAYS.map((w) => h('div', { class: 'm-head' }, w)),
    Array.from({ length: 42 }, (_, i) => {
      const day = start + i;
      const segs = byDay.get(day) ?? [];
      return h('div', { class: `m-cell${day < first || day >= next ? ' is-other' : ''}${day === app.today ? ' is-today' : ''}${day < app.today ? ' is-past' : ''}` },
        h('button', { type: 'button', class: 'm-date', 'aria-label': `${dateLabel(day)}，切換到週檢視`, onclick: () => toWeek(day) }, shortDate(day)),
        segs.map((seg) => itemLine(app, seg, false)),
      );
    }),
  );

  // 手機：依日期列出
  const days: number[] = [];
  for (let day = first; day < next; day++) if ((byDay.get(day) ?? []).length) days.push(day);
  const agenda = h('div', { class: 'agenda' },
    days.length
      ? days.map((day) =>
          h('div', { class: `agenda-day${day === app.today ? ' is-today' : ''}` },
            h('button', { type: 'button', class: 'agenda-date', onclick: () => toWeek(day) }, dateLabel(day)),
            (byDay.get(day) ?? []).map((seg) => itemLine(app, seg, true)),
          ))
      : h('p', { class: 'empty' }, '這個月沒有場次。'),
  );

  return h('div', { class: 'month' }, grid, agenda);
}
