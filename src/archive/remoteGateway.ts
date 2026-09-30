/**
 * 存档层（archive）：远端网关（演示环境用 localStorage 模拟服务器）。
 * 关键语义：
 * 1. 批次原子写入——一个批次的全部蹄位检查在一次事务里整批落库，
 *    失败则整批回滚，「不能留下半条蹄位检查」；
 * 2. 写入失败后批次编号不变，由同步引擎原号重试；
 * 3. 收到的批次与远端自己的修改分开存放，避免把本机推回的值
 *    误当成「远端又改了一次」；
 * 4. 本机值按 LWW 胜出后，远端那条过时修改即被取代，下次合并不再冲突。
 */
import type { Batch, StoredInspection } from "../domain/types";
import { hoofKey } from "../domain/rules";
import { buildSeed } from "./seed";

const REMOTE_KEY = "hxyfront62011.remote.v1";
const LATENCY_MS = 450;

interface RemoteShape {
  /** 远端医生/其他蹄铁师在远端写入的检查（合并对象） */
  edits: StoredInspection[];
  /** 本机批次推送上来、已被远端接收的检查（服务器留档） */
  received: StoredInspection[];
}

/** 演示用：强制下一次批次写入失败（验证原子回滚 + 原号重试） */
let failNextWrite = false;
export function setFailNextWrite(v: boolean): void {
  failNextWrite = v;
}
export function getFailNextWrite(): boolean {
  return failNextWrite;
}

function readRemote(): RemoteShape {
  try {
    const raw = localStorage.getItem(REMOTE_KEY);
    if (raw) return JSON.parse(raw) as RemoteShape;
  } catch {
    // 远端数据损坏时重建种子
  }
  const seed = buildSeed();
  const fresh: RemoteShape = { edits: seed.remoteEdits, received: [] };
  localStorage.setItem(REMOTE_KEY, JSON.stringify(fresh));
  return fresh;
}

function writeRemote(data: RemoteShape): void {
  localStorage.setItem(REMOTE_KEY, JSON.stringify(data));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PushResult {
  ok: boolean;
  error?: string;
}

export const remoteGateway = {
  /** 远端是否可达（演示环境由浏览器在线状态 + 手动断网开关决定） */
  isOnline(): boolean {
    return typeof navigator === "undefined" ? true : navigator.onLine;
  },

  /** 拉取远端修改（不含已接收的本机批次） */
  async fetchEdits(): Promise<StoredInspection[]> {
    await delay(LATENCY_MS);
    return readRemote().edits;
  },

  /** 同步读取远端修改（用于首屏直接派生合并视图） */
  peekEdits(): StoredInspection[] {
    return readRemote().edits;
  },

  /**
   * 批次整批原子写入：全部成功或全部不落库。
   * 失败时抛出异常且不写入任何一条，由调用方沿用原批次编号重试。
   */
  async pushBatch(batch: Batch, items: StoredInspection[]): Promise<PushResult> {
    await delay(LATENCY_MS);
    if (failNextWrite) {
      failNextWrite = false; // 失败只生效一次
      return {
        ok: false,
        error: `批次 ${batch.no} 写入被远端拒绝：整批未确认，已回滚（无半条蹄位检查落库）`,
      };
    }
    const remote = readRemote();
    const received = new Map(remote.received.map((i) => [i.id, i]));
    for (const item of items) received.set(item.id, item); // 整批 upsert，一次写入
    writeRemote({ ...remote, received: [...received.values()] });
    return { ok: true };
  },

  /**
   * 本机值按 LWW 胜出后，远端对应蹄位的旧修改即被取代，
   * 后续合并不再报冲突（冲突收敛）。
   */
  supersedeEdits(keys: string[]): void {
    if (keys.length === 0) return;
    const remote = readRemote();
    const superseded = new Set(keys);
    writeRemote({
      ...remote,
      edits: remote.edits.filter(
        (e) => !superseded.has(hoofKey(e.horseId, e.hoof)),
      ),
    });
  },

  /** 已接收留档数量（调试/展示用） */
  receivedCount(): number {
    return readRemote().received.length;
  },

  /** 清空远端演示数据 */
  reset(): void {
    localStorage.removeItem(REMOTE_KEY);
    failNextWrite = false;
  },
};
