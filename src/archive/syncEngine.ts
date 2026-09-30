/**
 * 存档层（archive）：同步引擎。
 * 编排「批次推送 → 远端拉取 → LWW 合并 → 队列重算 → 结论失效」：
 * - 批次按编号顺序整批原子写入，任一失败即中止，沿用原批次编号重试；
 * - 本机检查流与远端修改流分开保存，合并视图由 domain 层 mergeCurrents 派生，
 *   避免把远端胜者回写本机后二次合并掩盖冲突；
 * - 合并后按新值重算复查队列；已发结论依据的检查不再是当前值即失效退回。
 */
import type {
  Batch,
  Conclusion,
  StoredInspection,
} from "../domain/types";
import {
  mergeCurrents,
  recomputeQueue,
  refreshConclusions,
} from "../domain/rules";
import { remoteGateway } from "./remoteGateway";
import type { ArchiveState } from "./store";

export interface SyncEngineDeps {
  getState(): ArchiveState;
  patchBatch(no: string, patch: Partial<Batch>): void;
  commitSync(next: {
    remoteEdits: StoredInspection[];
    syncedLocalIds: string[];
  }): void;
}

export interface SyncSummary {
  ok: boolean;
  pushedBatchNos: string[];
  conflictCount: number;
  invalidatedCount: number;
  queueCount: number;
  failedBatchNo?: string;
  message: string;
}

export async function runSync(deps: SyncEngineDeps): Promise<SyncSummary> {
  const state = deps.getState();

  if (!state.online) {
    return {
      ok: false,
      pushedBatchNos: [],
      conflictCount: 0,
      invalidatedCount: 0,
      queueCount: 0,
      message: "当前处于断网状态：检查记录已按批次编号暂存本机，恢复联网后自动合并。",
    };
  }

  const pending = state.batches
    .filter((b) => b.status === "pending" || b.status === "failed")
    .sort((a, b) => a.createdAt - b.createdAt);

  // 1. 批次整批原子写入；失败则沿用原编号中止，绝不留下半条蹄位检查
  const pushedBatchNos: string[] = [];
  for (const batch of pending) {
    deps.patchBatch(batch.no, { status: "syncing", lastError: undefined });
    const items = state.inspections.filter((i) =>
      batch.itemIds.includes(i.id),
    );
    const result = await remoteGateway.pushBatch(batch, items);
    if (!result.ok) {
      deps.patchBatch(batch.no, {
        status: "failed",
        attempts: batch.attempts + 1,
        lastError: result.error,
      });
      return {
        ok: false,
        pushedBatchNos,
        conflictCount: 0,
        invalidatedCount: 0,
        queueCount: 0,
        failedBatchNo: batch.no,
        message: `批次 ${batch.no} 写入失败：已沿用原编号重试，本批 ${items.length} 条蹄位检查整批保留本机，无半条落库。`,
      };
    }
    deps.patchBatch(batch.no, {
      status: "synced",
      attempts: batch.attempts + 1,
      lastError: undefined,
    });
    pushedBatchNos.push(batch.no);
  }

  // 2. 拉远端修改，按现场时间 LWW 合并（合并视图派生，不回写本机流）
  const after = deps.getState();
  const remoteEdits = await remoteGateway.fetchEdits();
  const currents = mergeCurrents(after.inspections, remoteEdits);

  // 3. 本机 LWW 胜出的蹄位，远端旧修改被取代（冲突收敛）
  const localWonKeys = currents
    .filter((c) => c.conflict && c.current.origin === "local")
    .map((c) => c.key);
  remoteGateway.supersedeEdits(localWonKeys);

  // 4. 复查队列按新值重算；已发结论依据的检查不再是当前值即失效退回
  const queue = recomputeQueue(currents);
  const nextConclusions = refreshConclusions(after.conclusions, currents);

  // 5. 提交：远端修改更新；本批推送成功的本机检查标记为已同步
  const syncedLocalIds = after.batches
    .filter((b) => b.status === "synced")
    .flatMap((b) => b.itemIds);
  deps.commitSync({ remoteEdits, syncedLocalIds });

  const conflictCount = currents.filter((c) => c.conflict).length;
  const invalidatedCount = nextConclusions.filter(
    (c) => c.state === "invalidated",
  ).length;

  return {
    ok: true,
    pushedBatchNos,
    conflictCount,
    invalidatedCount,
    queueCount: queue.length,
    message:
      `同步完成：推送 ${pushedBatchNos.length} 个批次，合并后 ${conflictCount} 处蹄位冲突` +
      `（均保留现场时间较晚的检查值），复查队列重算为 ${queue.length} 条` +
      (invalidatedCount > 0
        ? `，${invalidatedCount} 条已发结论失效退回。`
        : "，已发结论均有效。"),
  };
}
