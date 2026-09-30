/**
 * 界面层（ui）：派生选择器。
 * 本机检查流与远端修改流在存档层分开保存，界面统一从合并视图派生：
 * 当前蹄位、复查队列、检查时间线都由 domain 层纯函数计算。
 */
import { useMemo } from "react";
import { useArchive } from "../archive/store";
import {
  HoofCurrent,
  mergeCurrents,
  recomputeQueue,
  timeline,
} from "../domain/rules";
import type { StoredInspection } from "../domain/types";

/** 合并后的蹄位当前值（含冲突标记） */
export function useCurrents(): HoofCurrent[] {
  const { inspections, remoteEdits } = useArchive();
  return useMemo(
    () => mergeCurrents(inspections, remoteEdits),
    [inspections, remoteEdits],
  );
}

/** 复查队列（由当前值重算） */
export function useQueue() {
  const currents = useCurrents();
  return useMemo(() => recomputeQueue(currents), [currents]);
}

/** 蹄位检查时间线（本机 + 远端） */
export function useTimeline(): StoredInspection[] {
  const { inspections, remoteEdits } = useArchive();
  return useMemo(
    () => timeline(inspections, remoteEdits),
    [inspections, remoteEdits],
  );
}
