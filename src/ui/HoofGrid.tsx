/**
 * 界面层（ui）：左右前后蹄对比记录。
 * 每匹马四个蹄位卡片，展示当前蹄形/步态/钉位/蹄铁、现场时间与来源，
 * 冲突蹄位挂冲突徽标；下方列出该蹄位的检查历史。
 */
import { useMemo } from "react";
import { HOOVES } from "../domain/rules";
import type { HoofCode, StoredInspection } from "../domain/types";
import { ConflictBadge, OriginTag, SyncStateBadge } from "./badges";
import { useCurrents, useTimeline } from "./selectors";
import { fmtDateTime } from "./format";

interface Props {
  horseId: string;
}

const FIELDS: { key: keyof StoredInspection; label: string }[] = [
  { key: "hoofShape", label: "蹄形" },
  { key: "gait", label: "步态" },
  { key: "nailPosition", label: "钉位" },
  { key: "shoeType", label: "蹄铁" },
];

export default function HoofGrid({ horseId }: Props) {
  const currents = useCurrents();
  const timelineItems = useTimeline();

  const byHoof = useMemo(() => {
    const map = new Map<HoofCode, StoredInspection[]>();
    for (const h of HOOVES) map.set(h.code, []);
    for (const ins of timelineItems) {
      if (ins.horseId !== horseId) continue;
      map.get(ins.hoof)?.push(ins);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.inspectedAt - a.inspectedAt);
    }
    return map;
  }, [timelineItems, horseId]);

  const currentOf = (hoof: HoofCode) =>
    currents.find((c) => c.horseId === horseId && c.hoof === hoof);

  return (
    <div className="hoof-grid">
      {HOOVES.map(({ code, label }) => {
        const list = byHoof.get(code) ?? [];
        const winner = currentOf(code);
        const current = winner?.current;
        return (
          <article
            key={code}
            className={`hoof-card ${winner?.conflict ? "hoof-conflict" : ""}`}
          >
            <header className="hoof-card-head">
              <h3>{label}</h3>
              {current ? (
                <SyncStateBadge state={winner?.conflict ? "conflict" : current.state} />
              ) : (
                <span className="badge badge-empty">暂无记录</span>
              )}
            </header>

            {current ? (
              <>
                {winner?.conflict && (
                  <div className="hoof-conflict-note">
                    <ConflictBadge />
                    <p>
                      本机与远端都修改过该蹄位，已保留现场时间较晚的检查值
                      （{fmtDateTime(current.inspectedAt)}）；可在巡诊时再次核对。
                    </p>
                  </div>
                )}
                <dl className="hoof-fields">
                  {FIELDS.map(({ key, label: fieldLabel }) => (
                    <div key={key}>
                      <dt>{fieldLabel}</dt>
                      <dd>{String(current[key])}</dd>
                    </div>
                  ))}
                </dl>
                <p className="hoof-meta">
                  <OriginTag origin={current.origin} />
                  <span>现场 {fmtDateTime(current.inspectedAt)}</span>
                  <span>批次 {current.batchNo}</span>
                </p>
              </>
            ) : (
              <p className="hoof-empty">该蹄位还没有检查记录。</p>
            )}

            {list.length > 1 && (
              <details className="hoof-history">
                <summary>蹄位历史（{list.length}）</summary>
                <ul>
                  {list.map((ins) => (
                    <li key={ins.id}>
                      <OriginTag origin={ins.origin} />
                      <span className="hoof-history-time">
                        {fmtDateTime(ins.inspectedAt)}
                      </span>
                      <span>
                        {ins.hoofShape} · {ins.gait} · {ins.nailPosition} ·{" "}
                        {ins.shoeType}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}
