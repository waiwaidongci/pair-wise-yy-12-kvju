import type { AppState, OnlineStatus, RemoteState } from "../core/types";

const STATE_KEY = "farrier.local.v1";
const REMOTE_KEY = "farrier.remote.v1";
const META_KEY = "farrier.meta.v1";

export interface RemoteMeta {
  online: boolean;
  /** 下一次整批写入是否强制失败（模拟网络恢复后写入失败） */
  failNextWrite: boolean;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const localArchive = {
  loadState(fallback: () => AppState): AppState {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw) as AppState;
    } catch {
      /* 存档损坏则回落种子 */
    }
    const s = fallback();
    this.saveState(s);
    return s;
  },
  saveState(state: AppState) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  },
  loadRemote(fallback: () => RemoteState): RemoteState {
    try {
      const raw = localStorage.getItem(REMOTE_KEY);
      if (raw) return JSON.parse(raw) as RemoteState;
    } catch {
      /* ignore */
    }
    const r = fallback();
    this.saveRemote(r);
    return r;
  },
  saveRemote(remote: RemoteState) {
    localStorage.setItem(REMOTE_KEY, JSON.stringify(remote));
  },
  loadMeta(): RemoteMeta {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw) as RemoteMeta;
    } catch {
      /* ignore */
    }
    return { online: true, failNextWrite: false };
  },
  saveMeta(meta: RemoteMeta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  },
  reset(seed: { state: AppState; remote: RemoteState }) {
    this.saveState(seed.state);
    this.saveRemote(seed.remote);
    this.saveMeta({ online: true, failNextWrite: false });
  },
};

/**
 * 模拟服务端：网络状态与故障注入都落在存档层，判定层对此一无所知。
 */
export class MockRemoteServer {
  meta: RemoteMeta;

  constructor() {
    this.meta = localArchive.loadMeta();
  }

  isOnline(): boolean {
    return this.meta.online;
  }

  resetMeta() {
    this.meta = { online: true, failNextWrite: false };
    localArchive.saveMeta(this.meta);
  }

  setStatus(status: OnlineStatus) {
    this.meta = { ...this.meta, online: status === "online" };
    localArchive.saveMeta(this.meta);
  }

  armWriteFailure() {
    this.meta = { ...this.meta, failNextWrite: true };
    localArchive.saveMeta(this.meta);
  }

  private async network<T>(fn: () => T): Promise<T> {
    await delay(350);
    if (!this.meta.online) {
      const err = new Error("网络不可达，批次未到达服务端");
      err.name = "OfflineError";
      throw err;
    }
    if (this.meta.failNextWrite) {
      this.meta = { ...this.meta, failNextWrite: false };
      localArchive.saveMeta(this.meta);
      const err = new Error("服务端写入中断（模拟批次写入失败，未提交任何蹄位）");
      err.name = "WriteFaultError";
      throw err;
    }
    return fn();
  }

  async pull(): Promise<RemoteState> {
    return this.network(() => localArchive.loadRemote(buildEmptyRemote));
  }

  /**
   * 整批原子写入：服务端在一次判定里完成 commitBatch，然后才落盘；
   * 判定抛错则不落盘，保证不会留下半条蹄位检查。
   */
  async push(
    apply: (remote: RemoteState) => { remote: RemoteState; conflicts: import("../core/types").ConflictRecord[]; idempotent: boolean; batchId: string },
  ): Promise<{ remote: RemoteState; conflicts: import("../core/types").ConflictRecord[]; idempotent: boolean; batchId: string }> {
    return this.network(() => {
      const remote = localArchive.loadRemote(buildEmptyRemote);
      const result = apply(remote);
      localArchive.saveRemote(result.remote);
      return result;
    });
  }

  /** 对端设备改动（即使本机离线也能发生，直接写服务端） */
  async peerApply(apply: (remote: RemoteState) => RemoteState): Promise<void> {
    await delay(200);
    const remote = localArchive.loadRemote(buildEmptyRemote);
    localArchive.saveRemote(apply(remote));
  }
}

function buildEmptyRemote(): RemoteState {
  return { current: {}, history: [], conclusions: [], batches: [] };
}
