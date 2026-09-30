/**
 * 存档层（archive）：本机档案库。
 * 断网时所有蹄位检查先落本机 localStorage，恢复后再与远端合并。
 * 这里只负责存取，不含判定规则（规则在 domain 层）。
 */
import type {
  Batch,
  Conclusion,
  Horse,
  StoredInspection,
} from "../domain/types";
import { buildSeed } from "./seed";

const ARCHIVE_KEY = "hxyfront62011.archive.v1";

export interface ArchiveShape {
  horses: Horse[];
  inspections: StoredInspection[];
  /** 远端修改流（合并视图派生用，持久化以保留跨刷新的冲突状态） */
  remoteEdits: StoredInspection[];
  batches: Batch[];
  conclusions: Conclusion[];
}

export function loadArchive(): ArchiveShape {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArchiveShape>;
      if (
        Array.isArray(parsed.horses) &&
        Array.isArray(parsed.inspections) &&
        Array.isArray(parsed.remoteEdits) &&
        Array.isArray(parsed.batches) &&
        Array.isArray(parsed.conclusions)
      ) {
        return parsed as ArchiveShape;
      }
    }
  } catch {
    // 存档损坏时重建，避免坏档阻断巡诊
  }
  const seed = buildSeed();
  const fresh: ArchiveShape = {
    horses: seed.horses,
    inspections: seed.inspections,
    remoteEdits: [],
    batches: seed.batches,
    conclusions: seed.conclusions,
  };
  saveArchive(fresh);
  return fresh;
}

export function saveArchive(data: ArchiveShape): void {
  try {
    localStorage.setItem(
      ARCHIVE_KEY,
      JSON.stringify({
        horses: data.horses,
        inspections: data.inspections,
        remoteEdits: data.remoteEdits,
        batches: data.batches,
        conclusions: data.conclusions,
      }),
    );
  } catch {
    // 存储写满或不可用时静默失败：内存中的当次巡诊仍可继续
  }
}

export function clearArchive(): void {
  localStorage.removeItem(ARCHIVE_KEY);
}
