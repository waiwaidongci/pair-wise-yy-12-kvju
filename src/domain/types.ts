/**
 * 判定层（domain）：纯类型定义。
 * 不依赖存储、网络与 React，只描述蹄铁巡诊领域里的实体与状态。
 */

/** 蹄位：左前 / 右前 / 左后 / 右后 */
export type HoofCode = "LF" | "RF" | "LH" | "RH";

/** 马匹状态：运动马 / 休养马 */
export type HorseStatus = "active" | "rest";

/** 检查值来源：本机现场记录 / 远端合并回来 */
export type Origin = "local" | "remote";

/** 蹄位当前值的同步状态：仅本机 / 已同步 / 冲突（两处都改过） */
export type SyncState = "local" | "synced" | "conflict";

/** 批次状态：待同步 / 同步中 / 失败 / 已同步 */
export type BatchStatus = "pending" | "syncing" | "failed" | "synced";

/** 复查结论状态：有效 / 已退回（对应蹄位变化，结论失效） */
export type ConclusionState = "valid" | "invalidated";

/** 马匹档案 */
export interface Horse {
  id: string;
  /** 马匹编号，如 HORSE-18 */
  code: string;
  name: string;
  status: HorseStatus;
}

/**
 * 蹄位检查记录：蹄形、步态、钉位、蹄铁类型。
 * inspectedAt 为现场时间，是两处修改冲突时的判定依据。
 */
export interface Inspection {
  id: string;
  horseId: string;
  hoof: HoofCode;
  /** 蹄形评估 */
  hoofShape: string;
  /** 步态问题 */
  gait: string;
  /** 钉位 */
  nailPosition: string;
  /** 蹄铁类型 */
  shoeType: string;
  /** 现场时间（毫秒），LWW 判定依据 */
  inspectedAt: number;
  /** 当天批次编号，合并与重试都沿用它 */
  batchNo: string;
  origin: Origin;
}

/** 存档中的检查记录，额外带同步状态 */
export interface StoredInspection extends Inspection {
  state: SyncState;
}

/**
 * 当天批次。断网期间的记录归入同一批次，
 * 写入失败后沿用原编号重试，不产生半条蹄位检查。
 */
export interface Batch {
  /** 批次编号，如 20260930-001 */
  no: string;
  createdAt: number;
  status: BatchStatus;
  /** 已尝试写入次数 */
  attempts: number;
  /** 本批次包含的蹄位检查 id（整批原子写入） */
  itemIds: string[];
  lastError?: string;
}

/** 已经发出的复查结论；结论基于发出时的那条蹄位检查 */
export interface Conclusion {
  id: string;
  horseId: string;
  hoof: HoofCode;
  text: string;
  issuedAt: number;
  /** 结论发出时依据的蹄位检查 id */
  basedOn: string;
  state: ConclusionState;
}
