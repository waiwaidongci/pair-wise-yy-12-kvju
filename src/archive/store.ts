/**
 * 存档层（archive）：档案仓库 + 状态容器。
 * 界面层通过 useArchive 订阅；判定在 domain 层，本文件不写业务规则。
 */
import { useSyncExternalStore } from "react";
import type {
  Batch,
  Conclusion,
  HoofCode,
  StoredInspection,
} from "../domain/types";
import {
  mergeCurrents,
  nextBatchNo,
} from "../domain/rules";
import {
  ArchiveShape,
  clearArchive,
  loadArchive,
  saveArchive,
} from "./localArchive";
import { remoteGateway, setFailNextWrite } from "./remoteGateway";
import { runSync, type SyncSummary } from "./syncEngine";
import { buildSeed } from "./seed";

export interface ArchiveState extends ArchiveShape {
  /** 远端修改流（与本机检查流分开，合并视图派生） */
  remoteEdits: StoredInspection[];
  online: boolean;
  failNext: boolean;
  lastSyncAt: number | null;
  lastMessage: string | null;
}

export interface DraftInput {
  horseId: string;
  hoof: HoofCode;
  hoofShape: string;
  gait: string;
  nailPosition: string;
  shoeType: string;
}

class ArchiveStore {
  private state: ArchiveState;
  private listeners = new Set<() => void>();

  constructor() {
    const archive = loadArchive();
    this.state = {
      ...archive,
      remoteEdits: archive.remoteEdits ?? [],
      online: remoteGateway.isOnline(),
      failNext: false,
      lastSyncAt: null,
      lastMessage: null,
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.setOnline(true));
      window.addEventListener("offline", () => this.setOnline(false));
    }
  }

  getState = (): ArchiveState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private setState(
    updater: (s: ArchiveState) => ArchiveState,
    persist = true,
  ): void {
    this.state = updater(this.state);
    if (persist) {
      saveArchive({
        horses: this.state.horses,
        inspections: this.state.inspections,
        remoteEdits: this.state.remoteEdits,
        batches: this.state.batches,
        conclusions: this.state.conclusions,
      });
    }
    this.listeners.forEach((l) => l());
  }

  /** 断网也能记：检查值先落本机，归入当天批次（失败过的批次沿用原编号） */
  saveDraft(input: DraftInput): void {
    const now = Date.now();
    const id = `i${now}${Math.floor(Math.random() * 10000)}`;
    const openBatch = this.state.batches
      .filter((b) => b.status === "pending" || b.status === "failed")
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    let batchNo: string;
    let batches: Batch[];
    if (openBatch) {
      batchNo = openBatch.no;
      batches = this.state.batches.map((b) =>
        b.no === openBatch.no ? { ...b, itemIds: [...b.itemIds, id] } : b,
      );
    } else {
      batchNo = nextBatchNo(this.state.batches);
      batches = [
        ...this.state.batches,
        {
          no: batchNo,
          createdAt: now,
          status: "pending",
          attempts: 0,
          itemIds: [id],
        },
      ];
    }

    const inspection: StoredInspection = {
      id,
      horseId: input.horseId,
      hoof: input.hoof,
      hoofShape: input.hoofShape,
      gait: input.gait,
      nailPosition: input.nailPosition,
      shoeType: input.shoeType,
      inspectedAt: now,
      batchNo,
      origin: "local",
      state: "local",
    };

    this.setState((s) => ({
      ...s,
      inspections: [inspection, ...s.inspections],
      batches,
      lastMessage: openBatch
        ? `已记入本机并并入批次 ${batchNo}（失败重试沿用原编号）；联网后整批合并。`
        : `已记入本机，批次 ${batchNo}；联网后按当天批次编号整批合并。`,
    }));
  }

  setOnline(online: boolean): void {
    this.setState(
      (s) => ({
        ...s,
        online,
        lastMessage: online
          ? "网络已恢复：可立即同步当天批次。"
          : "已进入断网模式：蹄位检查继续保存在本机，不影响巡诊。",
      }),
      false,
    );
  }

  setFailNext(fail: boolean): void {
    setFailNextWrite(fail);
    this.setState(
      (s) => ({
        ...s,
        failNext: fail,
        lastMessage: fail
          ? "已开启「下次写入模拟失败」：批次将整批回滚，可原号重试。"
          : null,
      }),
      false,
    );
  }

  /** 同步：推送批次 → 合并 → 重算队列 → 结论失效退回 */
  async sync(): Promise<SyncSummary> {
    this.setState((s) => ({ ...s, lastMessage: null }), false);
    const summary = await runSync({
      getState: this.getState,
      patchBatch: (no, patch) => {
        this.setState((s) => ({
          ...s,
          batches: s.batches.map((b) =>
            b.no === no ? { ...b, ...patch } : b,
          ),
        }));
      },
      commitSync: ({ remoteEdits, syncedLocalIds }) => {
        const syncedSet = new Set(syncedLocalIds);
        this.setState((s) => ({
          ...s,
          remoteEdits,
          inspections: s.inspections.map((ins) =>
            syncedSet.has(ins.id) ? { ...ins, state: "synced" } : ins,
          ),
          lastSyncAt: Date.now(),
        }));
      },
    });
    this.setState((s) => ({ ...s, lastMessage: summary.message }), false);
    return summary;
  }

  /** 发出复查结论：基于该蹄位当前检查值；蹄位再变即失效退回 */
  issueConclusion(horseId: string, hoof: HoofCode, text: string): void {
    const current = mergeCurrents(
      this.state.inspections,
      this.state.remoteEdits,
    ).find((c) => c.horseId === horseId && c.hoof === hoof);
    if (!current) return;
    const conclusion: Conclusion = {
      id: `c${Date.now()}`,
      horseId,
      hoof,
      text,
      issuedAt: Date.now(),
      basedOn: current.current.id,
      state: "valid",
    };
    this.setState((s) => ({
      ...s,
      conclusions: [conclusion, ...s.conclusions],
      lastMessage: "复查结论已发出；对应蹄位若再变化，结论自动失效退回。",
    }));
  }

  /** 重置演示数据（本机 + 远端） */
  resetDemo(): void {
    clearArchive();
    remoteGateway.reset();
    const seed = buildSeed();
    this.setState((s) => ({
      ...s,
      horses: seed.horses,
      inspections: seed.inspections,
      remoteEdits: [],
      batches: seed.batches,
      conclusions: seed.conclusions,
      online: remoteGateway.isOnline(),
      failNext: false,
      lastSyncAt: null,
      lastMessage: "演示数据已重置：可重新体验断网记录、批次合并与冲突退回。",
    }));
  }
}

export const archiveStore = new ArchiveStore();

export function useArchive(): ArchiveState {
  return useSyncExternalStore(
    archiveStore.subscribe,
    archiveStore.getState,
  );
}
