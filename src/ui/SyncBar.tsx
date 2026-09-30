/**
 * 界面层（ui）：同步状态栏。
 * 网络状态、当天批次列表（待同步/失败原号重试）、失败模拟开关。
 */
import { useArchive, archiveStore } from "../archive/store";
import { BatchStatusBadge } from "./badges";
import { fmtDateTime } from "./format";

export default function SyncBar() {
  const { online, failNext, batches, lastSyncAt, lastMessage } = useArchive();

  const sorted = [...batches].sort((a, b) => b.createdAt - a.createdAt);
  const pendingCount = batches.filter(
    (b) => b.status === "pending" || b.status === "failed",
  ).length;

  return (
    <section className="panel sync-panel">
      <div className="sync-head">
        <div className="sync-status">
          <span className={`net-dot ${online ? "net-online" : "net-offline"}`} />
          <strong>{online ? "网络在线" : "断网模式"}</strong>
          <span className="sync-hint">
            {online
              ? pendingCount > 0
                ? `${pendingCount} 个当天批次待合并`
                : "所有批次已同步"
              : "蹄位检查先记本机，恢复联网后按批次编号合并"}
          </span>
        </div>
        <div className="sync-actions">
          <button
            className="primary"
            disabled={!online || pendingCount === 0}
            onClick={() => void archiveStore.sync()}
          >
            {online ? "立即同步批次" : "断网中 · 已暂存本机"}
          </button>
          <button
            onClick={() => archiveStore.setOnline(!online)}
            title="演示用：手动切换网络状态"
          >
            {online ? "模拟断网" : "恢复联网"}
          </button>
          <label className="fail-toggle" title="演示用：让下一次批次写入被远端拒绝，验证整批回滚与原号重试">
            <input
              type="checkbox"
              checked={failNext}
              onChange={(e) => archiveStore.setFailNext(e.target.checked)}
            />
            模拟下次写入失败
          </label>
          <button
            className="btn-reset"
            onClick={() => {
              if (window.confirm("重置本机与远端的演示数据？")) archiveStore.resetDemo();
            }}
          >
            重置演示
          </button>
        </div>
      </div>

      {lastSyncAt && (
        <p className="sync-meta">最近同步：{fmtDateTime(lastSyncAt)}</p>
      )}

      <div className="batch-list">
        {sorted.map((b) => (
          <article key={b.no} className="batch-row">
            <div className="batch-no">{b.no}</div>
            <BatchStatusBadge status={b.status} />
            <span className="batch-items">{b.itemIds.length} 条蹄位检查</span>
            <span className="batch-attempts">尝试 {b.attempts} 次</span>
            {b.status === "failed" && (
              <button
                className="btn-retry"
                onClick={() => void archiveStore.sync()}
                title="沿用原批次编号重试，不产生新编号"
              >
                沿用原号 {b.no} 重试
              </button>
            )}
            {b.lastError && <p className="batch-error">{b.lastError}</p>}
          </article>
        ))}
      </div>

      {lastMessage && <p className="sync-message">{lastMessage}</p>}
    </section>
  );
}
