import { useState } from "react";
import { HOOF_LABELS, reviewDueDate, splitHoofKey } from "../../core/hoof";
import { nowMinute } from "../../core/id";
import type { HoofCheck } from "../../core/types";
import { useStore } from "../state";

const SHOE_OPTIONS = ["钢蹄铁", "铝蹄铁", "树脂蹄铁", "加护蹄垫", "无蹄铁（裸蹄）"];

export function HoofEditor({ hoofKey: keyStr, onClose }: { hoofKey: string; onClose: () => void }) {
  const { state, saveCheck, issueConclusion, peerEdit, acknowledge } = useStore();
  const { horseId, hoof } = splitHoofKey(keyStr);
  const horse = state.horses.find((h) => h.id === horseId);
  const current = state.current[keyStr];
  const conflict = state.conflicts[keyStr];

  const [form, setForm] = useState({
    inspectedAt: current?.inspectedAt ?? nowMinute(),
    hoofShape: current?.hoofShape ?? "",
    gait: current?.gait ?? "正常",
    shoeType: current?.shoeType ?? "钢蹄铁",
    nailPosition: current?.nailPosition ?? "",
    nextReviewDays: current?.nextReviewDays ?? 21,
    photoNote: current?.photoNote ?? "",
  });
  const [conclusionText, setConclusionText] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const input: Omit<HoofCheck, "horseId" | "hoof" | "abnormalGait"> = {
      inspectedAt: form.inspectedAt,
      hoofShape: form.hoofShape.trim(),
      gait: form.gait.trim(),
      shoeType: form.shoeType,
      nailPosition: form.nailPosition.trim(),
      nextReviewDays: Number(form.nextReviewDays),
      photoNote: form.photoNote.trim(),
    };
    saveCheck(horseId, hoof, input);
    onClose();
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>蹄位检查登记（断网也可保存，先记本机）</p>
            <h2>{horseId} · {horse?.name} · {HOOF_LABELS[hoof]}</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>

        {conflict && (
          <div className={`conflict-box ${conflict.acknowledged ? "seen" : ""}`}>
            <b>⚠ 两处都改过这个蹄位，已按现场时间合并</b>
            <ul>
              <li>保留值现场时间：{conflict.inspectedAtWinner.replace("T", " ")}（{conflict.winnerSide === "incoming" ? "本次提交较晚，现场值保留" : "服务端现值较晚，对端值保留"}）</li>
              <li>被顶掉的现场时间：{conflict.inspectedAtLoser.replace("T", " ")}</li>
              <li>合并批次：{conflict.batchId}</li>
            </ul>
            {!conflict.acknowledged && (
              <button onClick={() => acknowledge(keyStr)}>知道了，确认冲突状态</button>
            )}
          </div>
        )}

        {current && (
          <div className="current-snapshot">
            当前保留的检查值：{current.hoofShape} · {current.gait} · {current.shoeType} ·
            钉位 {current.nailPosition} · 复查截止 {reviewDueDate(current)}
          </div>
        )}

        <div className="field-grid">
          <label>
            <span>现场检查时间（合并以此为准）</span>
            <input
              type="datetime-local"
              value={form.inspectedAt}
              onChange={(e) => set("inspectedAt", e.target.value)}
            />
          </label>
          <label>
            <span>蹄形评估</span>
            <input value={form.hoofShape} onChange={(e) => set("hoofShape", e.target.value)} placeholder="如：外侧轻度磨耗" />
          </label>
          <label>
            <span>步态问题（非“正常”即标记异常步态）</span>
            <input value={form.gait} onChange={(e) => set("gait", e.target.value)} placeholder="如：右前运步稍短" />
          </label>
          <label>
            <span>蹄铁类型</span>
            <select value={form.shoeType} onChange={(e) => set("shoeType", e.target.value)}>
              {SHOE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span>钉位</span>
            <input value={form.nailPosition} onChange={(e) => set("nailPosition", e.target.value)} placeholder="如：标准 6 钉 / 外侧补钉 7 钉" />
          </label>
          <label>
            <span>下次复查（天后）</span>
            <input
              type="number"
              min={0}
              max={120}
              value={form.nextReviewDays}
              onChange={(e) => set("nextReviewDays", Number(e.target.value))}
            />
          </label>
          <label className="wide">
            <span>照片备注</span>
            <input value={form.photoNote} onChange={(e) => set("photoNote", e.target.value)} placeholder="照片编号 / 备注" />
          </label>
        </div>

        <div className="conclusion-row">
          <input
            value={conclusionText}
            onChange={(e) => setConclusionText(e.target.value)}
            placeholder="发出复查结论（留空默认“复查通过”）；对应蹄位再变化会自动失效退回"
          />
          <button
            onClick={() => {
              issueConclusion(horseId, hoof, conclusionText);
              setConclusionText("");
            }}
          >
            发出复查结论
          </button>
        </div>

        <div className="peer-row">
          <span>并发演练（模拟另一台设备对同一蹄位的改动）：</span>
          <button onClick={() => peerEdit(horseId, hoof, "earlier")}>
            对端写入更早的现场值
          </button>
          <button onClick={() => peerEdit(horseId, hoof, "later")}>
            对端写入更晚的现场值
          </button>
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={submit}>记入当天批次</button>
          <small>保存时校验：任一字段缺失将整条拒绝，不会写入半条蹄位检查</small>
        </div>
      </div>
    </div>
  );
}
