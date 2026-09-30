/**
 * 界面层（ui）：新增蹄位检查记录。
 * 断网时也可填写：保存即落本机档案并归入当天批次，不依赖网络。
 */
import { useState } from "react";
import { archiveStore, useArchive } from "../archive/store";
import { HOOVES } from "../domain/rules";
import type { HoofCode } from "../domain/types";

const HOOF_SHAPES = ["蹄壁完整", "外侧磨耗", "蹄尖磨损", "后蹄裂纹", "蹄壁裂纹"];
const GAITS = ["正常", "轻微跛行", "跛行（右前）", "跛行（左前）", "步态不稳"];
const NAILS = ["正钉", "偏钉", "钉位靠后", "钉位靠前"];
const SHOES = ["旧蹄铁", "铝蹄铁", "钢蹄铁", "新蹄铁", "加护蹄垫", "未换"];

interface Props {
  defaultHorseId?: string | null;
}

export default function InspectionForm({ defaultHorseId }: Props) {
  const { horses } = useArchive();
  const [horseId, setHorseId] = useState(defaultHorseId ?? "");
  const [hoof, setHoof] = useState<HoofCode>("LF");
  const [hoofShape, setHoofShape] = useState(HOOF_SHAPES[0]);
  const [gait, setGait] = useState(GAITS[0]);
  const [nailPosition, setNailPosition] = useState(NAILS[0]);
  const [shoeType, setShoeType] = useState(SHOES[0]);

  const submit = () => {
    if (!horseId) return;
    archiveStore.saveDraft({
      horseId,
      hoof,
      hoofShape,
      gait,
      nailPosition,
      shoeType,
    });
  };

  return (
    <div className="inspection-form">
      <div className="field-grid">
        <label>
          <span>马匹编号</span>
          <select value={horseId} onChange={(e) => setHorseId(e.target.value)}>
            <option value="" disabled>
              选择马匹
            </option>
            {horses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.code} · {h.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>蹄位</span>
          <select
            value={hoof}
            onChange={(e) => setHoof(e.target.value as HoofCode)}
          >
            {HOOVES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>蹄形评估</span>
          <select value={hoofShape} onChange={(e) => setHoofShape(e.target.value)}>
            {HOOF_SHAPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>步态问题</span>
          <select value={gait} onChange={(e) => setGait(e.target.value)}>
            {GAITS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>钉位</span>
          <select
            value={nailPosition}
            onChange={(e) => setNailPosition(e.target.value)}
          >
            {NAILS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>蹄铁类型</span>
          <select value={shoeType} onChange={(e) => setShoeType(e.target.value)}>
            {SHOES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button className="primary" onClick={submit} disabled={!horseId}>
          保存到本机
        </button>
        <span className="form-hint">
          断网可直接保存；恢复联网后按当天批次编号合并，两处同蹄位冲突时保留现场时间较晚的值。
        </span>
      </div>
    </div>
  );
}
