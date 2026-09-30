import { useMemo, useState } from "react";
import {
  HOOF_GROUP,
  HOOF_LABELS,
  HOOF_POSITIONS,
} from "../../core/hoof";
import { selectHorseRows, type HorseRow } from "../../core/selectors";
import type { HoofPosition } from "../../core/types";
import { useStore } from "../state";
import { HoofEditor } from "./HoofEditor";

const HORSE_FILTERS = ["全部", "运动马", "休养马"] as const;
const GROUP_FILTERS = ["全部", "前蹄", "后蹄"] as const;

function ConflictTag({ hoofKey }: { hoofKey: string }) {
  const { state } = useStore();
  const c = state.conflicts[hoofKey];
  if (!c) return null;
  return (
    <span className={`tag tag-conflict ${c.acknowledged ? "seen" : ""}`}>
      {c.acknowledged ? "冲突已确认" : "两处同改 · 待确认"}
    </span>
  );
}

function HoofCell({
  row,
  hoof,
  dimmed,
  onOpen,
}: {
  row: HorseRow;
  hoof: HoofPosition;
  dimmed: boolean;
  onOpen: () => void;
}) {
  const check = row.hooves[hoof];
  const inConflict = row.conflictHoofs.includes(hoof);
  return (
    <button
      className={`hoof-cell ${inConflict ? "conflict" : ""} ${dimmed ? "dimmed" : ""}`}
      onClick={onOpen}
      title="点击查看 / 登记该蹄位"
    >
      <div className="hoof-cell-head">
        <b>{HOOF_LABELS[hoof]}</b>
        {check?.abnormalGait && <span className="tag tag-abn">异常步态</span>}
      </div>
      {check ? (
        <dl>
          <div><dt>蹄形</dt><dd>{check.hoofShape}</dd></div>
          <div><dt>步态</dt><dd>{check.gait}</dd></div>
          <div><dt>蹄铁</dt><dd>{check.shoeType}</dd></div>
          <div><dt>钉位</dt><dd>{check.nailPosition}</dd></div>
          <div><dt>现场时间</dt><dd>{check.inspectedAt.replace("T", " ")}</dd></div>
        </dl>
      ) : (
        <p className="empty">尚未记录，点击登记</p>
      )}
      {inConflict && <ConflictTag hoofKey={`${row.horse.id}#${hoof}`} />}
    </button>
  );
}

export function HorseList() {
  const { state } = useStore();
  const rows = useMemo(() => selectHorseRows(state), [state]);
  const [horseFilter, setHorseFilter] = useState<(typeof HORSE_FILTERS)[number]>("全部");
  const [groupFilter, setGroupFilter] = useState<(typeof GROUP_FILTERS)[number]>("全部");
  const [open, setOpen] = useState<string | null>(null);

  const visible = rows.filter(
    (r) => horseFilter === "全部" || r.horse.status === horseFilter,
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>马匹列表 · 左右前后蹄对比记录 · 异常步态标记</p>
          <h2>马匹四蹄档案</h2>
        </div>
        <div className="filter-stack">
          <div className="chips">
            {HORSE_FILTERS.map((f) => (
              <button
                key={f}
                className={horseFilter === f ? "chip-on" : ""}
                onClick={() => setHorseFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="chips">
            {GROUP_FILTERS.map((f) => (
              <button
                key={f}
                className={groupFilter === f ? "chip-on" : ""}
                onClick={() => setGroupFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="horse-grid">
        {visible.map((row) => (
          <article key={row.horse.id} className="horse-card">
            <header>
              <div>
                <h3>
                  {row.horse.id} · {row.horse.name}
                  {row.pendingChange && (
                    <span className="tag tag-pending" title="存在未成功同步的本机批次">
                      本机待同步
                    </span>
                  )}
                </h3>
                <p className="gait-note">总评：{row.horse.gaitNote}</p>
              </div>
              <div className="horse-side">
                <span className="tag tag-status">{row.horse.status}</span>
                {row.abnormalCount > 0 && (
                  <span className="tag tag-abn">异常 × {row.abnormalCount}</span>
                )}
                {row.conflictHoofs.length > 0 && (
                  <span className="tag tag-conflict">冲突蹄位 × {row.conflictHoofs.length}</span>
                )}
              </div>
            </header>

            <div className="hoof-grid">
              {HOOF_POSITIONS.map((hoof) => (
                <HoofCell
                  key={hoof}
                  row={row}
                  hoof={hoof}
                  dimmed={
                    groupFilter !== "全部" &&
                    HOOF_GROUP[hoof] !== (groupFilter === "前蹄" ? "front" : "hind")
                  }
                  onOpen={() => setOpen(`${row.horse.id}#${hoof}`)}
                />
              ))}
            </div>
          </article>
        ))}
      </div>

      {open && (
        <HoofEditor
          hoofKey={open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
