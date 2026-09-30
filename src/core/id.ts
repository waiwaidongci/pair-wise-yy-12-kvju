let counter = 0;

export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** 当天批次编号：B-YYYYMMDD-序号 */
export function batchIdOf(day: string, seq: number): string {
  return `B-${day.replace(/-/g, "")}-${String(seq).padStart(2, "0")}`;
}

export function todayISO(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function nowMinute(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
