/**
 * 界面层（ui）：蹄铁更换历史。
 * 来自所有登记了蹄铁类型的检查；冲突蹄位与其他视图同步挂冲突徽标。
 */
import { useMemo } from "react";
import { useArchive } from "../archive/store";
import { hoofKey, hoofLabel, shoeChanges } from "../domain/rules";
import { ConflictBadge, OriginTag } from "./badges";
import { useCurrents, useTimeline } from "./selectors";
import { fmtDateTime } from "./format";

export default function ShoeHistory() {
  const { horses } = useArchive();
  const timelineItems = useTimeline();
  const currents = useCurrents();

  const changes = useMemo(() => shoeChanges(timelineItems), [timelineItems]);
  const horseCode = (horseId: string) =>
    horses.find((h) => h.id === horseId)?.code ?? horseId;

  if (changes.length === 0) {
    return <p className="queue-empty">暂无蹄铁更换记录。</p>;
  }

  return (
    <ul className="shoe-history">
      {changes.map((ins) => {
        const current = currents.find(
          (c) => c.key === hoofKey(ins.horseId, ins.hoof),
        );
        const isWinner = current?.current.id === ins.id;
        return (
          <li key={ins.id} className="shoe-row">
            <div className="shoe-main">
              <strong>
                {horseCode(ins.horseId)} · {hoofLabel(ins.hoof)}
              </strong>
              <span className="shoe-type">{ins.shoeType}</span>
              {isWinner && current?.conflict && <ConflictBadge />}
            </div>
            <div className="shoe-meta">
              <OriginTag origin={ins.origin} />
              <span>钉位 {ins.nailPosition}</span>
              <span>{fmtDateTime(ins.inspectedAt)}</span>
              <span className="shoe-batch">批次 {ins.batchNo}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
