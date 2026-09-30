import {
  computeReviewQueue,
  HOOF_GROUP,
  HOOF_LABELS,
  hoofKey,
  splitHoofKey,
} from "./hoof";
import type {
  AppState,
  ConflictRecord,
  HoofCheck,
  HoofPosition,
  Horse,
  ReviewQueueItem,
} from "./types";

export interface HorseRow {
  horse: Horse;
  hooves: Partial<Record<HoofPosition, HoofCheck>>;
  /** 四蹄中处于冲突状态的蹄位 */
  conflictHoofs: HoofPosition[];
  abnormalCount: number;
  pendingChange: boolean;
}

/** 未同步成功的批次里是否含该马 */
function pendingHorseIds(state: AppState): Set<string> {
  const ids = new Set<string>();
  for (const b of state.batches) {
    if (b.status === "open" || b.status === "failed" || b.status === "pending") {
      for (const e of b.checks) ids.add(e.check.horseId);
    }
  }
  return ids;
}

/** 马匹列表：四蹄对比 + 冲突标记，冲突状态与历史/队列同源 */
export function selectHorseRows(state: AppState): HorseRow[] {
  const pending = pendingHorseIds(state);
  return state.horses.map((horse) => {
    const hooves: HorseRow["hooves"] = {};
    const conflictHoofs: HoofPosition[] = [];
    let abnormalCount = 0;
    for (const hoof of Object.keys(HOOF_LABELS) as HoofPosition[]) {
      const check = state.current[hoofKey(horse.id, hoof)];
      if (check) {
        hooves[hoof] = check;
        if (check.abnormalGait) abnormalCount += 1;
      }
      if (state.conflicts[hoofKey(horse.id, hoof)]) conflictHoofs.push(hoof);
    }
    return {
      horse,
      hooves,
      conflictHoofs,
      abnormalCount,
      pendingChange: pending.has(horse.id),
    };
  });
}

export interface ShoeChangeRow {
  id: string;
  hoofKey: string;
  horseId: string;
  horseName: string;
  hoof: HoofPosition;
  inspectedAt: string;
  shoeType: string;
  hoofShape: string;
  nailPosition: string;
  batchId: string;
  source: "local" | "peer";
  conflict?: ConflictRecord;
  winner?: boolean;
  dropped?: boolean;
}

/** 蹄铁更换历史（更换记录 + 冲突落败留痕 + 冲突标记） */
export function selectShoeHistory(state: AppState): ShoeChangeRow[] {
  const nameOf = new Map(state.horses.map((h) => [h.id, h.name]));
  return state.history
    .filter((h) => h.shoeChanged || h.conflictDropped || h.conflictWinner === true)
    .map((h) => {
      const { horseId, hoof } = splitHoofKey(h.hoofKey);
      return {
        id: h.id,
        hoofKey: h.hoofKey,
        horseId,
        horseName: nameOf.get(horseId) ?? horseId,
        hoof,
        inspectedAt: h.inspectedAt,
        shoeType: h.shoeType,
        hoofShape: h.hoofShape,
        nailPosition: h.nailPosition,
        batchId: h.batchId,
        source: h.source,
        conflict: state.conflicts[h.hoofKey],
        winner: h.conflictWinner,
        dropped: h.conflictDropped,
      };
    });
}

/** 复查队列：合并后按新值重算；结论退回 / 冲突状态一起带出 */
export function selectReviewQueue(state: AppState, todayISO: string): ReviewQueueItem[] {
  const items = computeReviewQueue(
    state.current,
    state.conclusions,
    state.horses,
    todayISO,
  );
  for (const item of items) {
    item.inConflict = Boolean(state.conflicts[item.hoofKey]);
  }
  return items;
}

export interface PendingBatchView {
  batchId: string;
  day: string;
  status: "open" | "pending" | "failed" | "synced";
  attempts: number;
  lastError?: string;
  checkCount: number;
  hoofList: string;
}

export function selectBatches(state: AppState): PendingBatchView[] {
  return state.batches.map((b) => ({
    batchId: b.batchId,
    day: b.day,
    status: b.status,
    attempts: b.attempts,
    lastError: b.lastError,
    checkCount: b.checks.length,
    hoofList: b.checks
      .map((e) => `${e.check.horseId} ${HOOF_LABELS[e.check.hoof]}`)
      .join("、"),
  }));
}

export function selectMetrics(state: AppState, todayISO: string) {
  const queue = selectReviewQueue(state, todayISO);
  return {
    pendingReview: queue.filter((q) => q.daysUntilDue <= 14).length,
    abnormalGait: Object.values(state.current).filter((c) => c.abnormalGait).length,
    shoeChanges: state.history.filter((h) => h.shoeChanged).length,
    horses: state.horses.length,
    conflicts: Object.values(state.conflicts).filter((c) => !c.acknowledged).length,
    pendingBatches: state.batches.filter(
      (b) => b.status === "open" || b.status === "failed" || b.status === "pending",
    ).length,
  };
}

export { HOOF_GROUP, HOOF_LABELS };
