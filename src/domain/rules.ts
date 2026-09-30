/**
 * 判定层（domain）：纯业务规则。
 * 全部是无副作用的纯函数——给定存档，给出合并结果、复查队列与结论状态。
 * 「判定」只在这里发生：存档层负责存取，界面层负责展示。
 */
import type {
  Batch,
  Conclusion,
  HoofCode,
  Inspection,
  StoredInspection,
} from "./types";

/** 蹄位元信息：判定层只认这四个蹄位 */
export const HOOVES: { code: HoofCode; label: string; short: string }[] = [
  { code: "LF", label: "左前蹄", short: "左前" },
  { code: "RF", label: "右前蹄", short: "右前" },
  { code: "LH", label: "左后蹄", short: "左后" },
  { code: "RH", label: "右后蹄", short: "右后" },
];

export const hoofLabel = (code: HoofCode): string =>
  HOOVES.find((h) => h.code === code)?.label ?? code;

/** 蹄位归属键：同一匹马的同一个蹄位 */
export function hoofKey(horseId: string, hoof: HoofCode): string {
  return `${horseId}|${hoof}`;
}

const DAY = 24 * 60 * 60 * 1000;

/** 批次编号：yyyyMMdd-三位序号，按当天编号 */
export function batchNoFor(date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}-${String(seq).padStart(3, "0")}`;
}

/** 取当天批次前缀，如 20260930- */
export function dayPrefix(now: Date = new Date()): string {
  return batchNoFor(now, 0).slice(0, 9);
}

/** 下一个批次序号：同一天内序号顺延，跨天重新从 001 开始 */
export function nextBatchNo(batches: Batch[], now: Date = new Date()): string {
  const prefix = dayPrefix(now);
  const seq = batches.filter((b) => b.no.startsWith(prefix)).length + 1;
  return batchNoFor(now, seq);
}

/** 一批记录里每个蹄位的最新一条（按现场时间） */
export function latestPerHoof<T extends Inspection>(list: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const ins of list) {
    const key = hoofKey(ins.horseId, ins.hoof);
    const prev = map.get(key);
    if (!prev || ins.inspectedAt > prev.inspectedAt) map.set(key, ins);
  }
  return map;
}

/** 两处检查值是否不同（蹄形、步态、钉位、蹄铁类型任一字段不一致即冲突） */
export function valuesDiffer(a: Inspection, b: Inspection): boolean {
  return (
    a.hoofShape !== b.hoofShape ||
    a.gait !== b.gait ||
    a.nailPosition !== b.nailPosition ||
    a.shoeType !== b.shoeType
  );
}

/** 合并后的蹄位当前值 */
export interface HoofCurrent {
  key: string;
  horseId: string;
  hoof: HoofCode;
  /** 合并后保留的检查值：两处都改过时保留现场时间较晚的 */
  current: StoredInspection;
  localLatest?: StoredInspection;
  remoteLatest?: StoredInspection;
  /** 同一蹄位两处都改过且值不一致 */
  conflict: boolean;
}

/**
 * 合并本机与远端的检查记录（LWW, Last-Write-Wins by 现场时间）。
 * 同一蹄位两处都改过时，保留 inspectedAt 较晚的检查值，并标记冲突。
 */
export function mergeCurrents(
  local: StoredInspection[],
  remote: StoredInspection[],
): HoofCurrent[] {
  const l = latestPerHoof(local);
  const r = latestPerHoof(remote);
  const keys = new Set([...l.keys(), ...r.keys()]);
  const out: HoofCurrent[] = [];
  for (const key of keys) {
    const lv = l.get(key);
    const rv = r.get(key);
    let current: StoredInspection;
    let conflict = false;
    if (lv && rv) {
      conflict = valuesDiffer(lv, rv);
      // 现场时间较晚者胜；时间相同则保留本机值
      current = lv.inspectedAt >= rv.inspectedAt ? lv : rv;
    } else {
      current = (lv ?? rv)!;
    }
    out.push({
      key,
      horseId: current.horseId,
      hoof: current.hoof,
      current,
      localLatest: lv,
      remoteLatest: rv,
      conflict,
    });
  }
  out.sort((a, b) =>
    a.horseId === b.horseId
      ? a.hoof.localeCompare(b.hoof)
      : a.horseId.localeCompare(b.horseId),
  );
  return out;
}

/** 从存档（本机视角）直接取每个蹄位的当前值与冲突状态 */
export function selectCurrents(inspections: StoredInspection[]): HoofCurrent[] {
  const winners = latestPerHoof(inspections);
  return [...winners.values()]
    .map((current) => ({
      key: hoofKey(current.horseId, current.hoof),
      horseId: current.horseId,
      hoof: current.hoof,
      current,
      conflict: current.state === "conflict",
    }))
    .sort((a, b) =>
      a.horseId === b.horseId
        ? a.hoof.localeCompare(b.hoof)
        : a.horseId.localeCompare(b.horseId),
    );
}

/** 复查队列条目：由蹄位当前值按规则重算得出 */
export interface RecheckItem {
  key: string;
  horseId: string;
  hoof: HoofCode;
  reasons: string[];
  dueAt: number;
  latestInspectionId: string;
  conflict: boolean;
}

/**
 * 复查队列判定规则（纯函数）：
 * - 异常步态（跛/不稳/异常/瘸/晃）→ 14 天内复查
 * - 蹄形裂纹 → 7 天内复查
 * - 更换/新钉蹄铁 → 14 天内复查
 * 队列完全由当前值重算，合并后旧值消失则条目一并消失。
 */
export function recomputeQueue(currents: HoofCurrent[]): RecheckItem[] {
  const items: RecheckItem[] = [];
  for (const c of currents) {
    const ins = c.current;
    const reasons: string[] = [];
    let days = 30;
    if (/跛|不稳|异常|瘸|晃/.test(ins.gait)) {
      reasons.push("异常步态");
      days = Math.min(days, 14);
    }
    if (/裂/.test(ins.hoofShape)) {
      reasons.push("蹄形裂纹");
      days = Math.min(days, 7);
    }
    if (/新蹄铁|更换|重钉|铝蹄铁|钢蹄铁/.test(ins.shoeType)) {
      reasons.push("蹄铁更换后复查");
      days = Math.min(days, 14);
    }
    if (reasons.length === 0) continue;
    items.push({
      key: c.key,
      horseId: ins.horseId,
      hoof: ins.hoof,
      reasons,
      dueAt: ins.inspectedAt + days * DAY,
      latestInspectionId: ins.id,
      conflict: c.conflict,
    });
  }
  return items.sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * 复查结论判定：结论基于发出时的蹄位检查 id，
 * 一旦该蹄位的当前检查不再是它（值变了/被合并掉了），结论即失效退回。
 */
export function refreshConclusions(
  conclusions: Conclusion[],
  currents: HoofCurrent[],
): Conclusion[] {
  const byKey = new Map(currents.map((c) => [c.key, c.current.id]));
  return conclusions.map((c) => {
    const currentId = byKey.get(hoofKey(c.horseId, c.hoof));
    const state: Conclusion["state"] =
      currentId && currentId === c.basedOn ? "valid" : "invalidated";
    return { ...c, state };
  });
}

/** 蹄铁更换历史：凡登记了蹄铁类型（且不是「未换/无」）的检查都算一次更换 */
export function shoeChanges(inspections: StoredInspection[]): StoredInspection[] {
  return inspections
    .filter((i) => i.shoeType && i.shoeType !== "无" && i.shoeType !== "未换")
    .sort((a, b) => b.inspectedAt - a.inspectedAt);
}

/** 统计每匹马的冲突蹄位数（供马匹列表同步显示冲突状态） */
export function conflictCountByHorse(currents: HoofCurrent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of currents) {
    if (c.conflict) map.set(c.horseId, (map.get(c.horseId) ?? 0) + 1);
  }
  return map;
}

/**
 * 蹄位检查时间线：本机检查流 + 远端修改流（按 id 去重），
 * 供蹄位历史与蹄铁更换历史使用；当前值上的冲突状态由调用方结合 currents 判定。
 */
export function timeline(
  local: StoredInspection[],
  remote: StoredInspection[],
): StoredInspection[] {
  const byId = new Map<string, StoredInspection>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) byId.set(l.id, l);
  return [...byId.values()].sort((a, b) => b.inspectedAt - a.inspectedAt);
}
