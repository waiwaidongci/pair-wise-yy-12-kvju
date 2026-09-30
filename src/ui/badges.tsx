/**
 * 界面层（ui）：同步状态相关的展示小部件。
 * 马匹列表、蹄位对比、复查队列、蹄铁历史共用同一套冲突/状态徽标，
 * 保证「冲突状态」在三个视图里一致显示。
 */
import type {
  BatchStatus,
  ConclusionState,
  Origin,
  SyncState,
} from "../domain/types";

export function ConflictBadge() {
  return (
    <span className="badge badge-conflict" title="同一蹄位两处都改过，已保留现场时间较晚的检查值">
      冲突 · 以较晚现场时间为准
    </span>
  );
}

export function SyncStateBadge({ state }: { state: SyncState }) {
  if (state === "local") return <span className="badge badge-local">本机草稿</span>;
  if (state === "synced") return <span className="badge badge-synced">已同步</span>;
  return <span className="badge badge-conflict">冲突</span>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const map: Record<BatchStatus, { text: string; cls: string }> = {
    pending: { text: "待同步", cls: "badge-local" },
    syncing: { text: "同步中", cls: "badge-syncing" },
    failed: { text: "失败", cls: "badge-failed" },
    synced: { text: "已同步", cls: "badge-synced" },
  };
  const item = map[status];
  return <span className={`badge ${item.cls}`}>{item.text}</span>;
}

export function ConclusionStateBadge({ state }: { state: ConclusionState }) {
  return state === "valid" ? (
    <span className="badge badge-synced">有效</span>
  ) : (
    <span className="badge badge-failed">已退回 · 蹄位已变化</span>
  );
}

export function OriginTag({ origin }: { origin: Origin }) {
  return (
    <span className={`origin-tag origin-${origin}`}>
      {origin === "local" ? "本机" : "远端"}
    </span>
  );
}
