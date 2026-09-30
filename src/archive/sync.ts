import {
  acknowledgeConflict as acknowledgeConflictPure,
  commitBatch,
  convergeAfterSync,
  markBatchFailed,
  peerCommit,
} from "../core/merge";
import type {
  AppState,
  ConflictRecord,
  HoofCheck,
  RemoteState,
  StoredBatch,
} from "../core/types";
import { localArchive, MockRemoteServer } from "./storage";

export interface SyncReport {
  ok: boolean;
  acceptedBatchIds: string[];
  conflicts: ConflictRecord[];
  retriedBatchIds: string[];
  /** 第一个失败批次（沿用原编号，等待重试，未提交任何蹄位） */
  failure?: { batchId: string; reason: string };
  pulledAt: string;
}

function committable(b: StoredBatch): boolean {
  return b.status === "open" || b.status === "failed" || b.status === "pending";
}

/**
 * 网络恢复后的同步：
 * 1. 按当天批次编号顺序，把 open/failed 批次整批提交；失败即停，沿用原编号，不产生半条
 * 2. 全部成功后拉取服务端全量收敛，冲突按现场时间 LWW 已在服务端判定
 * 3. 复查队列、马匹列表、更换历史的派生由界面层基于收敛后状态重算
 */
export async function syncAll(
  server: MockRemoteServer,
  state: AppState,
  now: string,
): Promise<{ state: AppState; report: SyncReport }> {
  const queue = state.batches.filter(committable).sort((a, b) => a.batchId.localeCompare(b.batchId));
  const accepted: string[] = [];
  const retried: string[] = [];
  let allConflicts: ConflictRecord[] = [];
  let working = state;
  let remoteSnapshot: RemoteState | null = null;

  for (const batch of queue) {
    if (batch.attempts > 0) retried.push(batch.batchId);
    try {
      const result = await server.push((remote) => {
        const r = commitBatch(remote, batch, now);
        return {
          remote: r.state,
          conflicts: r.conflicts,
          idempotent: r.idempotent,
          batchId: r.acceptedBatchId,
        };
      });
      remoteSnapshot = result.remote;
      allConflicts = allConflicts.concat(result.conflicts);
      accepted.push(batch.batchId);
      // 本机先标记提交中的批次为 pending 以外状态；最终统一 converge
      working = {
        ...working,
        batches: working.batches.map((b) =>
          b.batchId === batch.batchId ? { ...b, attempts: b.attempts + 1 } : b,
        ),
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      const offline = e instanceof Error && e.name === "OfflineError";
      // 断网：请求未到达服务端，批次保持 open，不计尝试次数；
      // 真正的写入失败：标记 failed，沿用原编号等待重试，未提交任何蹄位。
      const next = offline
        ? state
        : markBatchFailed(working, batch.batchId, reason, now);
      localArchive.saveState(next);
      return {
        state: next,
        report: {
          ok: false,
          acceptedBatchIds: accepted,
          conflicts: allConflicts,
          retriedBatchIds: retried,
          failure: {
            batchId: batch.batchId,
            reason: offline ? `断网，批次仍在本机暂存：${reason}` : reason,
          },
          pulledAt: now,
        },
      };
    }
  }

  const remote = remoteSnapshot ?? (await server.pull());
  const converged = convergeAfterSync(working, remote, allConflicts, accepted);
  localArchive.saveState(converged);
  return {
    state: converged,
    report: {
      ok: true,
      acceptedBatchIds: accepted,
      conflicts: allConflicts,
      retriedBatchIds: retried,
      pulledAt: now,
    },
  };
}

/** 模拟另一台设备（对端）改了某个蹄位；写入服务端，不碰本机 */
export async function peerEdit(
  server: MockRemoteServer,
  check: HoofCheck,
  batchId: string,
  now: string,
): Promise<void> {
  await server.peerApply((remote) => peerCommit(remote, check, batchId, now).remote);
}

export { acknowledgeConflictPure };
