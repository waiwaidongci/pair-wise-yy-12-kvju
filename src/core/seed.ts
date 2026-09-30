import { hoofKey } from "./hoof";
import type {
  AppState,
  BatchCheckEntry,
  HoofCheck,
  HoofHistoryEvent,
  HoofPosition,
  RemoteState,
  ReviewConclusion,
  StoredBatch,
} from "./types";

interface SeedCheckSpec {
  hoof: HoofPosition;
  inspectedAt: string;
  hoofShape: string;
  gait: string;
  shoeType: string;
  nailPosition: string;
  nextReviewDays: number;
  photoNote?: string;
}

function makeCheck(horseId: string, spec: SeedCheckSpec): HoofCheck {
  return {
    horseId,
    hoof: spec.hoof,
    inspectedAt: spec.inspectedAt,
    hoofShape: spec.hoofShape,
    gait: spec.gait,
    abnormalGait: !/^(正常|良好|无异常)$/.test(spec.gait),
    shoeType: spec.shoeType,
    nailPosition: spec.nailPosition,
    nextReviewDays: spec.nextReviewDays,
    photoNote: spec.photoNote ?? "",
  };
}

function event(
  batchId: string,
  check: HoofCheck,
  prevShoe: string | undefined,
): HoofHistoryEvent {
  return {
    id: `${batchId}:${check.horseId}#${check.hoof}`,
    hoofKey: hoofKey(check.horseId, check.hoof),
    inspectedAt: check.inspectedAt,
    shoeType: check.shoeType,
    hoofShape: check.hoofShape,
    nailPosition: check.nailPosition,
    shoeChanged: prevShoe !== undefined && prevShoe !== check.shoeType,
    batchId,
    source: "local",
  };
}

const HORSES = [
  {
    id: "HORSE-18",
    name: "疾风 18 号",
    status: "运动马" as const,
    gaitNote: "右前蹄外侧磨耗，训练后偶有跛步",
  },
  {
    id: "HORSE-27",
    name: "栗火 27 号",
    status: "休养马" as const,
    gaitNote: "后蹄裂纹养护中，轻度步态拘谨",
  },
  {
    id: "HORSE-31",
    name: "银影 31 号",
    status: "运动马" as const,
    gaitNote: "步态轻微不稳，需教练复核",
  },
];

const BASE = "2026-08-19T09:00";
const RECENT = "2026-09-16T10:30";

const SPECS_BASE: Record<string, SeedCheckSpec[]> = {
  "HORSE-18": [
    { hoof: "LF", inspectedAt: BASE, hoofShape: "蹄形对称", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RF", inspectedAt: BASE, hoofShape: "外侧轻度磨耗", gait: "右前运步稍短", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "LH", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RH", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
  ],
  "HORSE-27": [
    { hoof: "LF", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "树脂蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RF", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "树脂蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "LH", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "树脂蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RH", inspectedAt: BASE, hoofShape: "后蹄裂纹初现", gait: "后运步拘谨", shoeType: "树脂蹄铁", nailPosition: "避裂纹 5 钉", nextReviewDays: 28, photoNote: "裂纹长度约 8mm，拍照归档" },
  ],
  "HORSE-31": [
    { hoof: "LF", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RF", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "LH", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RH", inspectedAt: BASE, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
  ],
};

const SPECS_RECENT: Record<string, SeedCheckSpec[]> = {
  "HORSE-18": [
    { hoof: "LF", inspectedAt: RECENT, hoofShape: "蹄形对称", gait: "正常", shoeType: "铝蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 21 },
    { hoof: "RF", inspectedAt: RECENT, hoofShape: "外侧磨耗明显，已修形", gait: "右前运步仍稍短", shoeType: "铝蹄铁", nailPosition: "外侧补钉 7 钉", nextReviewDays: 14, photoNote: "外侧壁照片已存" },
    { hoof: "LH", inspectedAt: RECENT, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RH", inspectedAt: RECENT, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
  ],
  "HORSE-27": [
    { hoof: "LF", inspectedAt: RECENT, hoofShape: "正常", gait: "正常", shoeType: "树脂蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RF", inspectedAt: RECENT, hoofShape: "正常", gait: "正常", shoeType: "树脂蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "LH", inspectedAt: RECENT, hoofShape: "正常", gait: "轻度拘谨", shoeType: "加护蹄垫", nailPosition: "标准 6 钉", nextReviewDays: 21 },
    { hoof: "RH", inspectedAt: RECENT, hoofShape: "裂纹稳定未扩展", gait: "后运步改善", shoeType: "加护蹄垫", nailPosition: "避裂纹 5 钉", nextReviewDays: 21, photoNote: "复查照片对比 8 月基线" },
  ],
  "HORSE-31": [
    { hoof: "LF", inspectedAt: RECENT, hoofShape: "正常", gait: "轻微不稳", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 21 },
    { hoof: "RF", inspectedAt: RECENT, hoofShape: "正常", gait: "轻微不稳", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 21 },
    { hoof: "LH", inspectedAt: RECENT, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
    { hoof: "RH", inspectedAt: RECENT, hoofShape: "正常", gait: "正常", shoeType: "钢蹄铁", nailPosition: "标准 6 钉", nextReviewDays: 28 },
  ],
};

export function buildSeed(): { state: AppState; remote: RemoteState } {
  const current: AppState["current"] = {};
  const history: HoofHistoryEvent[] = [];
  const batch1Checks: BatchCheckEntry[] = [];
  const batch2Checks: BatchCheckEntry[] = [];

  for (const horseId of Object.keys(SPECS_BASE)) {
    for (const spec of SPECS_BASE[horseId]) {
      const check = makeCheck(horseId, spec);
      current[hoofKey(horseId, spec.hoof)] = check;
      history.push(event("B-20260819-01", check, undefined));
      batch1Checks.push({ check, baseInspectedAt: null });
    }
  }
  for (const horseId of Object.keys(SPECS_RECENT)) {
    for (const spec of SPECS_RECENT[horseId]) {
      const check = makeCheck(horseId, spec);
      const prev = current[hoofKey(horseId, spec.hoof)];
      current[hoofKey(horseId, spec.hoof)] = check;
      history.push(event("B-20260916-01", check, prev?.shoeType));
      batch2Checks.push({
        check,
        baseInspectedAt: prev?.inspectedAt ?? null,
      });
    }
  }
  // 时间倒序：最近在前
  history.sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt));

  const conclusions: ReviewConclusion[] = [
    {
      id: "con-seed-18rf",
      hoofKey: "HORSE-18#RF",
      basedOnInspectedAt: RECENT,
      result: "右前蹄修形后观察 14 天，若外侧仍磨耗需加楔形垫",
      issuedAt: "2026-09-16T11:00",
      status: "issued",
      batchId: "B-20260916-01",
    },
    {
      id: "con-seed-27rh-old",
      hoofKey: "HORSE-27#RH",
      basedOnInspectedAt: BASE,
      result: "裂纹初现，两周后复查（已被 9 月检查替代）",
      issuedAt: "2026-08-19T10:00",
      status: "returned",
      returnedAt: RECENT,
      returnedReason: "对应蹄位发生变化（合并批次 B-20260916-01），复查结论失效退回",
      batchId: "B-20260819-01",
    },
  ];

  const batch1: StoredBatch = {
    batchId: "B-20260819-01",
    day: "2026-08-19",
    seq: 1,
    status: "synced",
    createdAt: BASE,
    attempts: 1,
    checks: batch1Checks,
    conclusions: [],
  };
  const batch2: StoredBatch = {
    batchId: "B-20260916-01",
    day: "2026-09-16",
    seq: 1,
    status: "synced",
    createdAt: RECENT,
    attempts: 1,
    checks: batch2Checks,
    conclusions: [conclusions[0], conclusions[1]],
  };

  const state: AppState = {
    horses: HORSES.map(({ id, name, status, gaitNote }) => ({
      id,
      name,
      status,
      gaitNote,
      createdAt: "2026-08-19T08:30",
    })),
    current,
    history,
    conflicts: {},
    conclusions,
    batches: [batch2, batch1],
    daySeq: { "2026-08-19": 1, "2026-09-16": 1 },
    submittedBatchIds: ["B-20260819-01", "B-20260916-01"],
    conclusionOutbox: [],
  };

  const remote: RemoteState = {
    current,
    history,
    conclusions,
    batches: [batch2, batch1],
  };

  return { state, remote };
}
