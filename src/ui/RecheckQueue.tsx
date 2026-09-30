/**
 * 界面层（ui）：复查队列。
 * 队列完全由 domain 层按蹄位当前值重算：合并后旧值消失则条目消失，
 * 新值进入则出现；冲突条目挂徽标。可直接发出复查结论。
 */
import { useState } from "react";
import { archiveStore, useArchive } from "../archive/store";
import { hoofLabel } from "../domain/rules";
import type { HoofCode } from "../domain/types";
import { ConflictBadge } from "./badges";
import { useQueue } from "./selectors";
import { daysUntil, fmtDate } from "./format";

export default function RecheckQueue() {
  const { horses } = useArchive();
  const items = useQueue();
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [text, setText] = useState("");

  const horseCode = (horseId: string) =>
    horses.find((h) => h.id === horseId)?.code ?? horseId;

  const issue = (horseId: string, hoof: HoofCode) => {
    if (!text.trim()) return;
    archiveStore.issueConclusion(horseId, hoof, text.trim());
    setText("");
    setDraftKey(null);
  };

  if (items.length === 0) {
    return (
      <p className="queue-empty">
        暂无待复查蹄位。合并远端批次后，队列会按新值自动重算。
      </p>
    );
  }

  return (
    <ul className="queue-list">
      {items.map((item) => {
        const key = `${item.horseId}|${item.hoof}`;
        const due = daysUntil(item.dueAt);
        return (
          <li key={item.key} className="queue-item">
            <div className="queue-main">
              <strong>
                {horseCode(item.horseId)} · {hoofLabel(item.hoof)}
              </strong>
              <div className="queue-reasons">
                {item.reasons.map((r) => (
                  <span key={r} className="badge badge-reason">
                    {r}
                  </span>
                ))}
                {item.conflict && <ConflictBadge />}
              </div>
            </div>
            <div className="queue-side">
              <span className={`queue-due ${due <= 3 ? "due-soon" : ""}`}>
                {due < 0 ? "已逾期" : `剩 ${due} 天`} · {fmtDate(item.dueAt)}
              </span>
              {draftKey === key ? (
                <div className="queue-issue">
                  <input
                    autoFocus
                    value={text}
                    placeholder="复查结论，如：2 周后复拍步态照片"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") issue(item.horseId, item.hoof);
                    }}
                  />
                  <button
                    className="primary"
                    onClick={() => issue(item.horseId, item.hoof)}
                  >
                    发出
                  </button>
                  <button
                    onClick={() => {
                      setDraftKey(null);
                      setText("");
                    }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setDraftKey(key);
                    setText("");
                  }}
                >
                  发出复查结论
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
