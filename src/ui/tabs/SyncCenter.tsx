import { useMemo } from "react";
import { HOOF_LABELS, splitHoofKey } from "../../core/hoof";
import { selectBatches } from "../../core/selectors";
import { useStore } from "../state";

const STATUS_TEXT: Record<string, string> = {
  open: "本机暂存 · 待同步",
  pending: "提交中",
  failed: "写入失败 · 待重试（沿用原编号）",
  synced: "已同步",
};

function ConflictList() {
  const { state, acknowledge } = useStore();
  const conflicts = Object.values(state.conflicts).sort((a, b) =>
    b.resolvedAt.localeCompare(a.resolvedAt),
  );
  if (conflicts.length === 0) {
    return <p className="empty">尚无冲突。触发方式：断网在本机改某蹄位 → 用蹄位编辑弹窗里的“对端写入”制造两处同改 → 恢复网络同步。</p>;
  }
  return (
    <div className="conflict-records">
      {conflicts.map((c) => {
        const { horseId, hoof } = splitHoofKey(c.hoofKey);
        return (
          <article key={c.id} className={`conflict-record ${c.acknowledged ? "seen" : ""}`}>
            <div>
              <b>{horseId} · {HOOF_LABELS[hoof]}</b>
              <p>
                保留现场时间 <strong>{c.inspectedAtWinner.replace("T", " ")}</strong>（
                {c.winnerSide === "incoming" ? "本机较晚" : "对端较晚"}），
                舍弃 {c.inspectedAtLoser.replace("T", " ")}
              </p>
              <small>
                批次 {c.batchId} · {c.resolvedAt.replace("T", " ")} 判定 · 该状态同时反映在马匹列表、更换历史与复查队列
              </small>
            </div>
            {!c.acknowledged && <button onClick={() => acknowledge(c.hoofKey)}>确认</button>}
          </article>
        );
      })}
    </div>
  );
}

export function SyncCenter() {
  const { state, online, lastReport, busy, sync } = useStore();
  const batches = useMemo(() => selectBatches(state), [state]);

  return (
    <section className="panel sync-center">
      <div className="heading">
        <div>
          <p>按当天批次编号合并 · 整批原子提交 · 原编号幂等重试</p>
          <h2>当天批次与同步</h2>
        </div>
        <button className="primary" onClick={sync} disabled={busy || !online}>
          {busy ? "同步中…" : online ? "立即同步当天批次" : "当前断网，无法同步"}
        </button>
      </div>

      {lastReport && (
        <div className={`report ${lastReport.ok ? "ok" : "fail"}`}>
          <b>上次同步结果：{lastReport.ok ? "全部批次已合并" : "存在失败批次"}</b>
          <ul>
            {lastReport.acceptedBatchIds.length > 0 && (
              <li>成功批次：{lastReport.acceptedBatchIds.join("、")}</li>
            )}
            {lastReport.retriedBatchIds.length > 0 && (
              <li>沿用原编号重试：{lastReport.retriedBatchIds.join("、")}</li>
            )}
            {lastReport.conflicts.length > 0 && (
              <li>合并判定冲突 {lastReport.conflicts.length} 处，均按现场时间较晚值保留</li>
            )}
            {lastReport.failure && (
              <li>失败：{lastReport.failure.batchId} —— {lastReport.failure.reason}</li>
            )}
          </ul>
        </div>
      )}

      <h3>批次列表</h3>
      <div className="batch-list">
        {batches.map((b) => (
          <article key={b.batchId} className={`batch-row st-${b.status}`}>
            <div className="batch-id">
              <b>{b.batchId}</b>
              <span className={`batch-status bs-${b.status}`}>{STATUS_TEXT[b.status]}</span>
            </div>
            <div className="batch-meta">
              <span>{b.day}</span>
              <span>{b.checkCount} 条蹄位检查</span>
              <span>尝试 {b.attempts} 次</span>
            </div>
            <p className="batch-hoofs">{b.hoofList}</p>
            {b.lastError && <p className="batch-error">失败原因：{b.lastError}</p>}
          </article>
        ))}
      </div>

      <h3>冲突判定记录</h3>
      <ConflictList />

      <h3>演练步骤</h3>
      <ol className="guide">
        <li>点“切换为断网”，打开任意马匹的蹄位，修改蹄形/钉位后“记入当天批次”——批次保持「本机暂存」。</li>
        <li>同一蹄位用“对端写入更晚/更早的现场值”模拟另一台设备在服务端的并发改动。</li>
        <li>（可选）点“注入一次写入故障”后再同步：第一批会失败并沿用原编号，界面明确提示未提交任何蹄位，重试仍用同一编号。</li>
        <li>点“网络恢复 · 按当天批次合并”：两处同改的蹄位保留现场时间较晚者，马匹列表、更换历史、复查队列同步显示冲突状态。</li>
        <li>若此前对该蹄位发过复查结论，结论自动变为“已失效退回”，复查队列按新值重算截止日期。</li>
      </ol>
    </section>
  );
}
