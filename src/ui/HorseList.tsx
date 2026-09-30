/**
 * 界面层（ui）：马匹列表。
 * 每匹马显示四个蹄位的当前同步状态，冲突蹄位挂冲突徽标——
 * 与蹄位对比、复查队列、蹄铁历史保持同一套冲突状态。
 */
import { useMemo } from "react";
import { useArchive } from "../archive/store";
import { HOOVES, conflictCountByHorse } from "../domain/rules";
import type { HoofCode } from "../domain/types";
import { ConflictBadge } from "./badges";
import { useCurrents } from "./selectors";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function HorseList({ selectedId, onSelect }: Props) {
  const { horses } = useArchive();
  const currents = useCurrents();

  const { hoofState, conflicts } = useMemo(() => {
    const hoofState = new Map<string, "local" | "synced" | "conflict">();
    for (const c of currents) {
      hoofState.set(
        `${c.horseId}|${c.hoof}`,
        c.conflict ? "conflict" : c.current.state,
      );
    }
    return {
      hoofState,
      conflicts: conflictCountByHorse(currents),
    };
  }, [currents]);

  return (
    <div className="horse-list">
      {horses.map((h) => {
        const conflictCount = conflicts.get(h.id) ?? 0;
        return (
          <button
            key={h.id}
            className={`horse-card ${selectedId === h.id ? "selected" : ""}`}
            onClick={() => onSelect(h.id)}
          >
            <div className="horse-head">
              <strong>{h.code}</strong>
              <span className="horse-name">{h.name}</span>
              <span className={`horse-status status-${h.status}`}>
                {h.status === "active" ? "运动马" : "休养马"}
              </span>
            </div>
            <div className="hoof-dots">
              {HOOVES.map(({ code, short }) => {
                const state = hoofState.get(`${h.id}|${code as HoofCode}`);
                return (
                  <span
                    key={code}
                    className={`hoof-dot dot-${state ?? "empty"}`}
                    title={`${short}蹄 · ${
                      state === "conflict"
                        ? "冲突"
                        : state === "local"
                          ? "本机草稿"
                          : state === "synced"
                            ? "已同步"
                            : "暂无记录"
                    }`}
                  >
                    {short}
                  </span>
                );
              })}
            </div>
            {conflictCount > 0 && (
              <div className="horse-conflict">
                <ConflictBadge />
                <span className="horse-conflict-count">{conflictCount} 个蹄位待核对</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
