/**
 * 存档层（archive）：演示用初始档案。
 * 种子数据同时铺本机与远端两处，为「按批次合并 + 同蹄位冲突」准备场景：
 * - HORSE-31 左前蹄：本机 09:50 记「轻微跛行」，远端 10:10 记「步态正常」→ 远端较晚，远端胜
 * - HORSE-18 右前蹄：远端 09:55 记「正常」，本机 10:05 记「跛行」→ 本机较晚，本机胜
 * - HORSE-27 右后蹄 / 左后蹄：仅远端有值（裂纹、新蹄铁），合并后进入复查队列
 */
import type {
  Batch,
  Conclusion,
  Horse,
  StoredInspection,
} from "../domain/types";
import { batchNoFor } from "../domain/rules";

function atDay(base: Date, daysAgo: number, hour: number, minute: number): number {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export interface SeedData {
  horses: Horse[];
  inspections: StoredInspection[];
  remoteEdits: StoredInspection[];
  batches: Batch[];
  conclusions: Conclusion[];
}

export function buildSeed(now: Date = new Date()): SeedData {
  const d1 = atDay(now, 2, 9, 0);
  const d1b = atDay(now, 2, 11, 0);
  const d1c = atDay(now, 2, 11, 20);
  const d1Remote = atDay(now, 2, 14, 0);
  const t1 = atDay(now, 0, 9, 50);
  const t2 = atDay(now, 0, 9, 55);
  const t3 = atDay(now, 0, 10, 5);
  const t4 = atDay(now, 0, 10, 10);
  const t5 = atDay(now, 0, 10, 30);

  const b0 = batchNoFor(new Date(d1), 1);
  const b1 = batchNoFor(new Date(t1), 1);

  const horses: Horse[] = [
    { id: "h1", code: "HORSE-18", name: "星辰", status: "active" },
    { id: "h2", code: "HORSE-27", name: "踏雪", status: "active" },
    { id: "h3", code: "HORSE-31", name: "追风", status: "rest" },
    { id: "h4", code: "HORSE-05", name: "青骢", status: "active" },
  ];

  const inspections: StoredInspection[] = [
    {
      id: "i1", horseId: "h1", hoof: "LF",
      hoofShape: "蹄壁完整", gait: "正常", nailPosition: "正钉", shoeType: "旧蹄铁",
      inspectedAt: d1, batchNo: b0, origin: "local", state: "synced",
    },
    {
      id: "i2", horseId: "h4", hoof: "LF",
      hoofShape: "蹄壁完整", gait: "正常", nailPosition: "偏钉", shoeType: "新蹄铁",
      inspectedAt: d1b, batchNo: b0, origin: "local", state: "synced",
    },
    {
      id: "i3", horseId: "h4", hoof: "RF",
      hoofShape: "外侧磨耗", gait: "正常", nailPosition: "正钉", shoeType: "铝蹄铁",
      inspectedAt: d1c, batchNo: b0, origin: "local", state: "synced",
    },
    {
      id: "i4", horseId: "h3", hoof: "LF",
      hoofShape: "蹄壁完整", gait: "轻微跛行", nailPosition: "正钉", shoeType: "旧蹄铁",
      inspectedAt: t1, batchNo: b1, origin: "local", state: "local",
    },
    {
      id: "i5", horseId: "h1", hoof: "RF",
      hoofShape: "蹄壁完整", gait: "跛行（右前）", nailPosition: "正钉", shoeType: "旧蹄铁",
      inspectedAt: t3, batchNo: b1, origin: "local", state: "local",
    },
  ];

  const remoteEdits: StoredInspection[] = [
    {
      id: "r4", horseId: "h2", hoof: "LH",
      hoofShape: "蹄壁完整", gait: "正常", nailPosition: "正钉", shoeType: "新蹄铁",
      inspectedAt: d1Remote, batchNo: b0, origin: "remote", state: "synced",
    },
    {
      id: "r2", horseId: "h1", hoof: "RF",
      hoofShape: "蹄壁完整", gait: "正常", nailPosition: "正钉", shoeType: "旧蹄铁",
      inspectedAt: t2, batchNo: b1, origin: "remote", state: "synced",
    },
    {
      id: "r1", horseId: "h3", hoof: "LF",
      hoofShape: "蹄壁完整", gait: "步态正常", nailPosition: "正钉", shoeType: "旧蹄铁",
      inspectedAt: t4, batchNo: b1, origin: "remote", state: "synced",
    },
    {
      id: "r3", horseId: "h2", hoof: "RH",
      hoofShape: "后蹄裂纹", gait: "正常", nailPosition: "正钉", shoeType: "加护蹄垫",
      inspectedAt: t5, batchNo: b1, origin: "remote", state: "synced",
    },
  ];

  const batches: Batch[] = [
    { no: b0, createdAt: d1, status: "synced", attempts: 1, itemIds: ["i1", "i2", "i3"] },
    { no: b1, createdAt: t1, status: "pending", attempts: 0, itemIds: ["i4", "i5"] },
  ];

  const conclusions: Conclusion[] = [
    {
      id: "c1", horseId: "h1", hoof: "LF",
      text: "左前蹄外侧磨耗已处理，蹄位稳定，按常规复查。",
      issuedAt: d1 + 3600_000, basedOn: "i1", state: "valid",
    },
    {
      id: "c2", horseId: "h3", hoof: "LF",
      text: "左前蹄轻微跛行，建议 14 天内复查步态。",
      issuedAt: t1 + 300_000, basedOn: "i4", state: "valid",
    },
  ];

  return { horses, inspections, remoteEdits, batches, conclusions };
}
