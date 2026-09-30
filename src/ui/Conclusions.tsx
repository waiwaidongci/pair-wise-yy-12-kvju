/**
 * 界面层（ui）：复查结论列表。
 * 已发出的结论一旦对应蹄位变化（合并后当前检查不再是发出时那条），
 * 即失效退回，与有效结论分区显示。
 */
import { useMemo } from "react";
import { useArchive } from "../archive/store";
import { hoofLabel, refreshConclusions } from "../domain/rules";
import { ConclusionStateBadge } from "./badges";
import { useCurrents } from "./selectors";
import { fmtDateTime } from "./format";

export default function Conclusions() {
  const { conclusions, horses } = useArchive();
  const currents = useCurrents();

  const refreshed = useMemo(
    () => refreshConclusions(conclusions, currents),
    [conclusions, currents],
  );

  const horseCode = (horseId: string) =>
    horses.find((h) => h.id === horseId)?.code ?? horseId;

  if (refreshed.length === 0) {
    return <p className="queue-empty">还没有发出过复查结论。</p>;
  }

  const valid = refreshed.filter((c) => c.state === "valid");
  const invalid = refreshed.filter((c) => c.state === "invalidated");

  const render = (c: (typeof refreshed)[number]) => (
    <li key={c.id} className="conclusion-item">
      <div className="conclusion-head">
        <strong>
          {horseCode(c.horseId)} · {hoofLabel(c.hoof)}
        </strong>
        <ConclusionStateBadge state={c.state} />
      </div>
      <p className="conclusion-text">{c.text}</p>
      <p className="conclusion-meta">发出于 {fmtDateTime(c.issuedAt)}</p>
      {c.state === "invalidated" && (
        <p className="conclusion-invalid-note">
          该蹄位检查值已被较晚的现场记录取代，本结论自动失效退回，请按新值重新评估。
        </p>
      )}
    </li>
  );

  return (
    <div className="conclusions">
      {invalid.length > 0 && (
        <div className="conclusion-group">
          <h4>已退回（{invalid.length}）</h4>
          <ul>{invalid.map(render)}</ul>
        </div>
      )}
      {valid.length > 0 && (
        <div className="conclusion-group">
          <h4>有效（{valid.length}）</h4>
          <ul>{valid.map(render)}</ul>
        </div>
      )}
    </div>
  );
}
