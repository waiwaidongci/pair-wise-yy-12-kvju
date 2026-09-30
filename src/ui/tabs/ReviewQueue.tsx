import { useMemo } from "react";
import { dueLabel, HOOF_LABELS } from "../../core/hoof";
import { selectReviewQueue } from "../../core/selectors";
import { useStore } from "../state";

type Bucket = "overdue" | "soon" | "later";

function bucketOf(days: number): Bucket {
  if (days < 0) return "overdue";
  if (days <= 14) return "soon";
  return "later";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "已逾期",
  soon: "14 天内复查",
  later: "之后",
};

export function ReviewQueue() {
  const { state, today } = useStore();
  const items = useMemo(() => selectReviewQueue(state, today), [state, today]);
  const horses = new Map(state.horses.map((h) => [h.id, h.name]));

  const groups: Record<Bucket, typeof items> = { overdue: [], soon: [], later: [] };
  for (const it of items) groups[bucketOf(it.daysUntilDue)].push(it);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>复查提醒 · 合并后按新值重算 · 已发结论随蹄位变化失效退回</p>
          <h2>复查队列</h2>
        </div>
        <span className="muted">队列日期取每个蹄位当前保留的检查值重算</span>
      </div>

      {(Object.keys(groups) as Bucket[]).map((bk) =>
        groups[bk].length === 0 ? null : (
          <div key={bk} className="queue-group">
            <h3 className={`queue-title q-${bk}`}>{BUCKET_LABEL[bk]}（{groups[bk].length}）</h3>
            <div className="queue-list">
              {groups[bk].map((q) => {
                const c = q.conclusion;
                const returned = c?.status === "returned";
                return (
                  <article
                    key={q.hoofKey}
                    className={`queue-card ${q.inConflict ? "in-conflict" : ""} ${returned ? "returned" : ""}`}
                  >
                    <div className="queue-main">
                      <b>
                        {horses.get(q.horseId) ?? q.horseId}（{q.horseId}）· {HOOF_LABELS[q.hoof]}
                      </b>
                      <p>
                        复查截止 <strong>{q.dueDate}</strong>（{dueLabel(q.daysUntilDue)}） · 现蹄铁 {q.shoeType}
                      </p>
                      {q.abnormalGait && <span className="tag tag-abn">异常步态</span>}
                      {q.inConflict && (
                        <span className="tag tag-conflict">蹄位刚发生冲突合并，请按新值复查</span>
                      )}
                    </div>
                    <div className={`conclusion ${returned ? "is-returned" : c ? "is-issued" : "is-none"}`}>
                      {c ? (
                        <>
                          <span className="conclusion-status">
                            {returned ? "结论已失效退回" : "已发结论"}
                          </span>
                          <p>{c.result}</p>
                          {returned && <small>退回原因：{c.returnedReason}</small>}
                        </>
                      ) : (
                        <span className="conclusion-status">尚未发出结论</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ),
      )}

      {items.length === 0 && <p className="empty">暂无复查项。</p>}
    </section>
  );
}
