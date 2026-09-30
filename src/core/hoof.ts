import {
  HOOF_GROUP,
  HOOF_LABELS,
  HOOF_POSITIONS,
  type HoofCheck,
  type HoofPosition,
  type Horse,
  type ReviewQueueItem,
} from "./types";

export function hoofKey(horseId: string, hoof: HoofPosition): string {
  return `${horseId}#${hoof}`;
}

export function splitHoofKey(key: string): { horseId: string; hoof: HoofPosition } {
  const [horseId, hoof] = key.split("#");
  return { horseId, hoof: hoof as HoofPosition };
}

export { HOOF_GROUP, HOOF_LABELS, HOOF_POSITIONS };

export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODay(d);
}

export function toISODay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 步态非"正常/良好"即视为异常步态 */
export function isAbnormalGait(gait: string): boolean {
  const g = gait.trim();
  return g.length > 0 && !/^(正常|良好|无异常)$/.test(g);
}

/**
 * 蹄位检查原子性校验：一条蹄位检查必须四蹄信息各自完整。
 * 批次写入时任何一条缺字段，整批拒绝——不能留下半条蹄位检查。
 */
export function REQUIRED_FIELDS(): Array<{ key: keyof HoofCheck; label: string }> {
  return [
    { key: "inspectedAt", label: "检查时间" },
    { key: "hoofShape", label: "蹄形评估" },
    { key: "gait", label: "步态" },
    { key: "shoeType", label: "蹄铁类型" },
    { key: "nailPosition", label: "钉位" },
  ];
}

export function validateCheck(check: HoofCheck): string[] {
  const errors: string[] = [];
  for (const { key, label } of REQUIRED_FIELDS()) {
    const v = check[key];
    if (typeof v !== "string" || v.trim() === "") {
      errors.push(`${HOOF_LABELS[check.hoof]}缺少「${label}」`);
    }
  }
  if (!Number.isFinite(check.nextReviewDays) || check.nextReviewDays < 0) {
    errors.push(`${HOOF_LABELS[check.hoof]}的下次复查天数无效`);
  }
  return errors;
}

export function validateBatch(checks: HoofCheck[]): string[] {
  if (checks.length === 0) return ["空批次不能写入"];
  return checks.flatMap(validateCheck);
}

/** 下次复查日期 = 检查当天 + nextReviewDays */
export function reviewDueDate(check: HoofCheck): string {
  const day = check.inspectedAt.slice(0, 10);
  return addDays(day, check.nextReviewDays);
}

/**
 * 复查队列：按下次复查日期升序，取每蹄最新检查值重算。
 * 已退回的结论随队列出队提示；现场值变化后调用方负责先退回旧结论。
 */
export function computeReviewQueue(
  current: Record<string, HoofCheck>,
  conclusions: { hoofKey: string; status: string }[],
  horses: Horse[],
  todayISO: string,
): ReviewQueueItem[] {
  const conclusionByKey = new Map(
    conclusions.map((c) => [c.hoofKey, c as ReviewQueueItem["conclusion"]]),
  );
  const today = new Date(`${todayISO}T00:00:00`).getTime();
  const items: ReviewQueueItem[] = [];
  for (const [key, check] of Object.entries(current)) {
    if (!horses.some((h) => h.id === check.horseId)) continue;
    const due = reviewDueDate(check);
    const daysUntilDue = Math.round(
      (new Date(`${due}T00:00:00`).getTime() - today) / DAY_MS,
    );
    const conclusion = conclusionByKey.get(key);
    items.push({
      hoofKey: key,
      horseId: check.horseId,
      hoof: check.hoof,
      dueDate: due,
      daysUntilDue,
      shoeType: check.shoeType,
      abnormalGait: check.abnormalGait,
      conclusion,
      inConflict: false,
    });
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** 格式化剩余天数文案 */
export function dueLabel(days: number): string {
  if (days < 0) return `逾期 ${-days} 天`;
  if (days === 0) return "今天复查";
  return `${days} 天后`;
}
