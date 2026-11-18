import type { App } from '../app.ts';
import type { Block, SessionBlock } from '../api.ts';
import { clear, h } from '../dom.ts';
import { axisLength, DAY_START, splitByDay, type Segment } from '../layout.ts';
import { dateLabel, minToHm, mondayOf, rangeLabel, shortDate, weekdayOf, WEEKDAYS } from '../time.ts';
import { openBooking } from './booking.ts';
import { openJoin } from './join.ts';

const STATUS_LABEL: Record<SessionBlock['status'], string> = {
  booked: '已預約',
  pending: '待確認',
  recruiting: '拼團中',
};

export function renderSchedule(app: App): HTMLElement {
  const firstWeek = mondayOf(app.today);
  const lastWeek = mondayOf(app.maxDay);
  const week = app.weekStart;
  const days = Array.from({ length: 7 }, (_, i) => week + i);
  if (app.selectedDay < week || app.selectedDay > week + 6) app.selectedDay = days.find((d) => d >= app.today) ?? week;

  const go = (delta: number) => {
    app.weekStart = Math.min(lastWeek, Math.max(firstWeek, week + delta * 7));
    app.selectedDay = app.weekStart === firstWeek ? app.today : app.weekStart;
    app.refresh();
  };

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'week-nav' },
      h('button', { class: 'icon-btn', 'aria-label': '上一週', disabled: week <= firstWeek, onclick: () => go(-1) }, '‹'),
      h('span', { class: 'week-label' }, `${shortDate(week)} – ${shortDate(week + 6)}`),
      h('button', { class: 'icon-btn', 'aria-label': '下一週', disabled: week >= lastWeek, onclick: () => go(1) }, '›'),
      week !== firstWeek && h('button', { class: 'text-btn', onclick: () => go(-999) }, '本週'),
    ),
    h('button', { class: 'primary-btn', onclick: () => openBooking(app, { date: app.isBookable(app.selectedDay) ? app.selectedDay : app.minDay }) }, '登記預約'),
  );

  const strip = h('div', { class: 'day-strip', role: 'tablist' },
    days.map((d) =>
      h('button', {
        class: `day-chip${d === app.selectedDay ? ' is-selected' : ''}${d < app.today ? ' is-past' : ''}`,
        role: 'tab',
        'aria-selected': d === app.selectedDay ? 'true' : 'false',
        'data-day': d,
        onclick: () => {
          app.selectedDay = d;
          root.querySelectorAll('[data-day]').forEach((el) => {
            const on = Number((el as HTMLElement).dataset.day) === d;
            el.classList.toggle('is-selected', on);
            if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected', String(on));
          });
        },
      },
        h('span', { class: 'chip-wd' }, WEEKDAYS[weekdayOf(d)]),
        h('span', { class: 'chip-date' }, shortDate(d)),
      ),
    ),
  );

  const grid = h('div', { class: 'grid-wrap is-loading' }, h('p', { class: 'loading' }, '載入時間表…'));

  const root = h('section', { class: 'schedule' },
    toolbar,
    strip,
    grid,
    renderLegend(),
    h('p', { class: 'help' }, '點選時間表的空白處，或按「登記預約」開始。登記前請先與店家確認時間；可預約明天起至 ', app.rules.max_date, '，開場時間 09:00–19:00。'),
  );

  app.weekBlocks(week).then(
    (blocks) => {
      if (app.weekStart !== week) return;
      clear(grid);
      grid.classList.remove('is-loading');
      grid.append(renderGrid(app, days, blocks));
    },
    (e: Error) => {
      clear(grid);
      grid.classList.remove('is-loading');
      grid.append(h('p', { class: 'error-box' }, e.message, ' ', h('button', { class: 'text-btn', onclick: () => app.refresh() }, '重新載入')));
    },
  );

  return root;
}

function renderGrid(app: App, days: number[], blocks: Block[]): HTMLElement {
  const byDay = splitByDay(blocks, days[0], days[6]);
  const axis = axisLength(byDay.values());
  const hours: number[] = [];
  for (let m = 0; m <= axis; m += 60) hours.push(m);

  const head = h('div', { class: 'grid-head' },
    h('div', { class: 'gutter' }),
    days.map((d) =>
      h('div', { class: `col-head${d === app.selectedDay ? ' is-selected' : ''}${d === app.today ? ' is-today' : ''}`, 'data-day': d },
        h('span', { class: 'chip-wd' }, WEEKDAYS[weekdayOf(d)]),
        h('span', { class: 'chip-date' }, shortDate(d)),
      ),
    ),
  );

  const gutter = h('div', { class: 'gutter' },
    hours.map((m) => h('span', { class: 'hour', style: `--at:${m}` }, minToHm((m + DAY_START) % 1440))),
  );

  const cols = days.map((d) => {
    const bookable = app.isBookable(d);
    const col = h('div', {
      class: `day-col${d === app.selectedDay ? ' is-selected' : ''}${bookable ? ' is-bookable' : ' is-closed'}`,
      'data-day': d,
      'aria-label': dateLabel(d),
      title: bookable ? '點選空白處登記這個時間' : undefined,
    }, (byDay.get(d) ?? []).map((s) => renderBlock(app, s)));
    if (bookable) {
      col.addEventListener('click', (ev) => {
        if (ev.target !== col) return;
        const rect = col.getBoundingClientRect();
        const ppm = rect.height / axis;
        const min = DAY_START + Math.floor((ev.clientY - rect.top) / ppm / 30) * 30;
        const start = Math.min(19 * 60, Math.max(9 * 60, min));
        openBooking(app, { date: d, start });
      });
    }
    return col;
  });

  return h('div', { class: 'grid', style: `--axis:${axis}` },
    head,
    h('div', { class: 'grid-body' }, gutter, cols),
  );
}

function renderBlock(app: App, seg: Segment): HTMLElement {
  const b = seg.block;
  const style = `--top:${seg.start};--len:${seg.end - seg.start}`;
  const time = rangeLabel(seg.startAbs, seg.endAbs);
  const cut = `${seg.cutBefore ? ' cut-before' : ''}${seg.cutAfter ? ' cut-after' : ''}`;

  if (b.kind === 'closure') {
    return h('div', { class: `block block-closure${cut}`, style }, h('span', { class: 'block-title' }, '不開放'), h('span', { class: 'block-time' }, time));
  }

  const status = h('span', { class: 'badge' }, STATUS_LABEL[b.status]);
  if (b.status === 'recruiting') {
    const missing = [b.missing_male ? `男${b.missing_male}` : '', b.missing_female ? `女${b.missing_female}` : ''].filter(Boolean).join(' ');
    return h('button', { class: `block block-recruiting${cut}`, style, onclick: () => openJoin(app, b) },
      h('span', { class: 'block-title' }, b.script_name),
      h('span', { class: 'block-time' }, time),
      h('span', { class: 'block-meta' }, status, ` ${b.joined}/${b.players}`, missing && `・缺 ${missing}`),
      b.host_nickname && h('span', { class: 'block-meta' }, `主揪：${b.host_nickname}`),
      h('span', { class: 'block-cta' }, '申請加入 ›'),
    );
  }
  return h('div', { class: `block block-${b.status}${cut}`, style },
    h('span', { class: 'block-title' }, b.script_name),
    h('span', { class: 'block-time' }, time),
    h('span', { class: 'block-meta' }, status),
  );
}

function renderLegend(): HTMLElement {
  const item = (cls: string, label: string) => h('span', { class: 'legend-item' }, h('span', { class: `swatch ${cls}` }), label);
  return h('div', { class: 'legend' },
    item('block-booked', '已預約'),
    item('block-pending', '待確認'),
    item('block-recruiting', '拼團中（可申請加入）'),
    item('block-closure', '不開放'),
  );
}
