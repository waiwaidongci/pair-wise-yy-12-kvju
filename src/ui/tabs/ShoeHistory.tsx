import { useMemo } from "react";
import { HOOF_LABELS } from "../../core/hoof";
import { selectShoeHistory } from "../../core/selectors";
import { useStore } from "../state";

export function ShoeHistory() {
  const { state } = useStore();
  const rows = useMemo(() => selectShoeHistory(state), [state]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>蹄铁更换历史 · 冲突留痕（与马匹列表、复查队列同源显示冲突状态）</p>
          <h2>更换 / 修蹄时间线</h2>
        </div>
        <span className="muted">共 {rows.length} 条更换相关记录</span>
      </div>

      {rows.length === 0 && <p className="empty">暂无蹄铁更换记录。</p>}

      <ol className="timeline">
        {rows.map((r) => (
          <li key={r.id} className={`timeline-item ${r.dropped ? "dropped" : ""} ${r.conflict && !r.conflict.acknowledged ? "has-conflict" : ""}`}>
            <div className="timeline-time">
              <b>{r.inspectedAt.replace("T", " ")}</b>
              <span>{r.batchId}</span>
              <span className={`src-tag src-${r.source}`}>
                {r.source === "local" ? "本机" : "对端设备"}
              </span>
            </div>
            <div className="timeline-body">
              <h3>
                {r.horseName}（{r.horseId}）· {HOOF_LABELS[r.hoof]}
              </h3>
              <p>
                更换为 <strong>{r.shoeType}</strong> · 蹄形：{r.hoofShape} · 钉位：{r.nailPosition}
              </p>
              <div className="tag-row">
                <span className="tag tag-change">蹄铁更换</span>
                {r.dropped && (
                  <span className="tag tag-dropped">
                    现场时间较旧未保留（冲突落败，仅留痕）
                  </span>
                )}
                {r.winner && <span className="tag tag-conflict">冲突中现场值较晚，已保留</span>}
                {r.source === "peer" && <span className="tag tag-peer">来自对端</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
