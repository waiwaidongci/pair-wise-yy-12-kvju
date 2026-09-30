/**
 * 界面层（ui）：展示用格式化工具。
 */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 2026-09-30 14:05 */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 2026-09-30 */
export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 距今天数（含今天），用于复查日期倒计时 */
export function daysUntil(ts: number, now: number = Date.now()): number {
  return Math.ceil((ts - now) / (24 * 60 * 60 * 1000));
}
