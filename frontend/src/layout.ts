import type { Block } from './api.ts';
import { absOf } from './time.ts';

/**
 * 時間表以「營業日」為一欄：從當天 09:00 到隔天 09:00。
 * 晚場延續到午夜之後仍畫在同一欄，不會跑到隔天欄的最上面。
 */
export const DAY_START = 9 * 60;
export const DEFAULT_AXIS_END = 23 * 60 - DAY_START; // 預設畫到 23:00

export interface Segment {
  block: Block;
  day: number; // 營業日的日序
  start: number; // 距該營業日 09:00 的分鐘
  end: number;
  startAbs: number; // 整個區塊的絕對分鐘
  endAbs: number;
  cutBefore: boolean; // 區塊從前一個營業日延續過來
  cutAfter: boolean; // 區塊延續到下一個營業日
}

/** 把區塊切成各營業日的片段，只保留 [fromDay, toDay] 內的 */
export function splitByDay(blocks: Block[], fromDay: number, toDay: number): Map<number, Segment[]> {
  const out = new Map<number, Segment[]>();
  for (let d = fromDay; d <= toDay; d++) out.set(d, []);
  for (const block of blocks) {
    const a = absOf(block.start_at);
    const b = absOf(block.end_at);
    if (b <= a) continue;
    const first = Math.floor((a - DAY_START) / 1440);
    const last = Math.floor((b - 1 - DAY_START) / 1440);
    for (let d = first; d <= last; d++) {
      const list = out.get(d);
      if (!list) continue;
      const dayStartAbs = d * 1440 + DAY_START;
      list.push({
        block,
        day: d,
        start: Math.max(a, dayStartAbs) - dayStartAbs,
        end: Math.min(b, dayStartAbs + 1440) - dayStartAbs,
        startAbs: a,
        endAbs: b,
        cutBefore: a < dayStartAbs,
        cutAfter: b > dayStartAbs + 1440,
      });
    }
  }
  for (const list of out.values()) list.sort((x, y) => x.start - y.start);
  return out;
}

/** 時間軸長度（分鐘，從 09:00 起算）：至少到 23:00，有更晚的區塊就延長到整點 */
export function axisLength(segments: Iterable<Segment[]>): number {
  let end = DEFAULT_AXIS_END;
  for (const list of segments) for (const s of list) end = Math.max(end, Math.ceil(s.end / 60) * 60);
  return Math.min(end, 1440);
}

export interface StartOption {
  start: number; // 當日分鐘
  available: boolean;
}

/**
 * 指定日期、劇本時長下，每個可選開場時間是否空著。
 * blocks 需涵蓋該日前後（跨午夜的區塊）。
 */
export function startOptions(day: number, durationMin: number, blocks: Block[], earliest: number, latest: number, step: number): StartOption[] {
  const busy = blocks.map((b) => [absOf(b.start_at), absOf(b.end_at)] as const);
  const out: StartOption[] = [];
  for (let m = earliest; m <= latest; m += step) {
    const s = day * 1440 + m;
    const e = s + durationMin;
    out.push({ start: m, available: !busy.some(([a, b]) => s < b && a < e) });
  }
  return out;
}
