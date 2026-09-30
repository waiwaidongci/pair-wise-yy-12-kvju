// 判定层：领域类型（纯数据，不依赖 React / 存储）

export type HoofPosition = "LF" | "RF" | "LH" | "RH";

export const HOOF_POSITIONS: HoofPosition[] = ["LF", "RF", "LH", "RH"];

export const HOOF_LABELS: Record<HoofPosition, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

/** 前蹄 / 后蹄分组 */
export const HOOF_GROUP: Record<HoofPosition, "front" | "hind"> = {
  LF: "front",
  RF: "front",
  LH: "hind",
  RH: "hind",
};

export type HorseStatus = "运动马" | "休养马";

export interface Horse {
  id: string;
  name: string;
  status: HorseStatus;
  /** 步态总评（异常步态标记会同时挂在单蹄上） */
  gaitNote: string;
  createdAt: string;
}

/** 一次蹄位检查：一匹马 × 一个蹄位 × 一个现场时间点 */
export interface HoofCheck {
  horseId: string;
  hoof: HoofPosition;
  /** 现场检查时间，断网合并时以它为准做 LWW，而不是写入时间 */
  inspectedAt: string;
  hoofShape: string;
  gait: string;
  abnormalGait: boolean;
  shoeType: string;
  nailPosition: string;
  nextReviewDays: number;
  photoNote: string;
  /** 本次检查随附的复查结论（可空） */
  conclusion?: ReviewConclusion;
}

export interface HoofHistoryEvent {
  id: string;
  hoofKey: string;
  inspectedAt: string;
  shoeType: string;
  hoofShape: string;
  nailPosition: string;
  /** 是否伴随蹄铁更换（相对上一条检查蹄铁类型变化） */
  shoeChanged: boolean;
  /** 该次检查是否参与过冲突合并，以及现场值是否被保留 */
  conflictWinner?: boolean;
  /** 合并时被较晚现场值顶掉的记录 */
  conflictDropped?: boolean;
  batchId: string;
  source: "local" | "peer";
}

export interface ConflictRecord {
  id: string;
  hoofKey: string;
  /** 新值批次 */
  batchId: string;
  incomingBatchId: string;
  incomingSource: "local" | "peer";
  inspectedAtWinner: string;
  inspectedAtLoser: string;
  winnerSide: "incoming" | "current";
  resolvedAt: string;
  /** 蹄铁师在界面上确认后消音，不改变判定结果 */
  acknowledged: boolean;
}

export type ReviewConclusionStatus = "issued" | "returned";

export interface ReviewConclusion {
  id: string;
  hoofKey: string;
  /** 结论基于的那次检查的现场时间 */
  basedOnInspectedAt: string;
  result: string;
  issuedAt: string;
  status: ReviewConclusionStatus;
  /** 退回原因（对应蹄位发生变化） */
  returnedReason?: string;
  returnedAt?: string;
  batchId: string;
}

export interface ReviewQueueItem {
  hoofKey: string;
  horseId: string;
  hoof: HoofPosition;
  dueDate: string;
  daysUntilDue: number;
  shoeType: string;
  abnormalGait: boolean;
  conclusion?: ReviewConclusion;
  /** 对应蹄位处于冲突状态 */
  inConflict: boolean;
}

export type BatchStatus = "open" | "pending" | "failed" | "synced";

/** 批次里的检查条目，附带离线保存时所基于的服务端现场时间（乐观并发用） */
export interface BatchCheckEntry {
  check: HoofCheck;
  /** 保存时该蹄位当前现场值的 inspectedAt；全新蹄位为 null */
  baseInspectedAt: string | null;
}

/** 服务端在批次上记录的合并冲突快照（幂等重试时原样返回） */
export interface StoredBatch {
  batchId: string;
  day: string;
  seq: number;
  status: BatchStatus;
  createdAt: string;
  lastAttemptAt?: string;
  attempts: number;
  /** 最后一次写入失败原因 */
  lastError?: string;
  checks: BatchCheckEntry[];
  /** 离线期间发出的复查结论随批次一起提交 */
  conclusions: ReviewConclusion[];
  /** 服务端记录的冲突（仅 synced 批次） */
  conflicts?: ConflictRecord[];
}

/** 冲突集合以 hoofKey 索引：一个蹄位同时只保留一条未消音冲突 */
export type ConflictMap = Record<string, ConflictRecord>;

export interface AppState {
  horses: Horse[];
  /** hoofKey -> 该蹄位当前（保留的现场值）检查 */
  current: Record<string, HoofCheck>;
  history: HoofHistoryEvent[];
  conflicts: ConflictMap;
  conclusions: ReviewConclusion[];
  batches: StoredBatch[];
  /** 当天批次序号，写入失败后沿用原编号重试，成功后再推进 */
  daySeq: Record<string, number>;
  /** 已提交过的批次号（幂等保护） */
  submittedBatchIds: string[];
  /** 还未挂进批次的离线复查结论发件箱 */
  conclusionOutbox: ReviewConclusion[];
}

export type OnlineStatus = "online" | "offline";

export interface RemoteState {
  current: Record<string, HoofCheck>;
  history: HoofHistoryEvent[];
  conclusions: ReviewConclusion[];
  batches: StoredBatch[];
}

export interface RemoteResult {
  state: RemoteState;
  /** 本批在服务端检测到的并发改动 */
  conflicts: ConflictRecord[];
  acceptedBatchId: string;
  /** 批次幂等命中（沿用原编号重试成功） */
  idempotent: boolean;
}
