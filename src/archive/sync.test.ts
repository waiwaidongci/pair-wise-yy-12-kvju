// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { localArchive, MockRemoteServer } from "./storage";
import { peerEdit, syncAll } from "./sync";
import { ingestLocalCheck, issueConclusion } from "../core/merge";
import { buildSeed } from "../core/seed";
import { selectReviewQueue } from "../core/selectors";
import { hoofKey } from "../core/hoof";

const NOW = "2026-09-30T18:00";
const TODAY = "2026-09-30";

function input(over: Record<string, unknown> = {}) {
  return {
    inspectedAt: "2026-09-30T10:00",
    hoofShape: "蹄形对称",
    gait: "正常",
    shoeType: "铝蹄铁",
    nailPosition: "标准 6 钉",
    nextReviewDays: 14,
    photoNote: "",
    ...over,
  };
}

describe("存档 + 同步引擎端到端", () => {
  beforeEach(() => {
    localStorage.clear();
    const seed = buildSeed();
    localArchive.saveState(seed.state);
    localArchive.saveRemote(seed.remote);
    localArchive.saveMeta({ online: true, failNextWrite: false });
  });

  it("断网本机记录 → 写入失败沿用原编号不留半条 → 重试合并 LWW → 结论退回、队列重算", async () => {
    const server = new MockRemoteServer();
    let state = localArchive.loadState(() => buildSeed().state);
    const key = hoofKey("HORSE-18", "RF");

    // 1) 断网：本机先对 RF 发结论（基于 09-16 值），再重新检查该蹄位
    server.setStatus("offline");
    state = issueConclusion(state, "HORSE-18", "RF", "断网前发出的结论", NOW).state;
    state = ingestLocalCheck(
      state,
      "HORSE-18",
      "RF",
      input({ inspectedAt: "2026-09-30T10:00", hoofShape: "本机修形 A", nailPosition: "本机 7 钉", nextReviewDays: 10 }),
      NOW,
    ).state;
    localArchive.saveState(state);

    const batchId = state.batches.find((b) => b.status === "open")!.batchId;
    expect(batchId).toBe("B-20260930-01");

    // 断网时同步直接失败，批次保持 open（尝试次数不增加，因为根本没到服务端）
    let res = await syncAll(server, state, NOW);
    expect(res.report.ok).toBe(false);
    expect(res.report.failure!.batchId).toBe(batchId);

    // 2) 恢复网络但注入一次写入故障：失败必须沿用原编号，服务端无半条
    server.setStatus("online");
    server.armWriteFailure();
    res = await syncAll(server, res.state, NOW);
    expect(res.report.ok).toBe(false);
    expect(res.report.failure!.batchId).toBe(batchId);
    const failedBatch = res.state.batches.find((b) => b.batchId === batchId)!;
    expect(failedBatch.status).toBe("failed");
    expect(failedBatch.attempts).toBe(1);
    expect(failedBatch.checks).toHaveLength(1);
    // 服务端没有该批次的任何痕迹
    const remoteAfterFault = localArchive.loadRemote(() => ({
      current: {},
      history: [],
      conclusions: [],
      batches: [],
    }));
    expect(remoteAfterFault.batches.some((b) => b.batchId === batchId)).toBe(false);
    expect(remoteAfterFault.current[key].nailPosition).toBe("外侧补钉 7 钉"); // 仍是种子值

    // 3) 重试之前，对端在服务端写入更晚的现场值（两处同改）
    const peerCheck = {
      ...localArchive.loadRemote(() => ({ current: {}, history: [], conclusions: [], batches: [] })).current[key],
      inspectedAt: "2026-09-30T15:00",
      hoofShape: "对端更晚修形 B",
      nailPosition: "对端 8 钉",
      nextReviewDays: 5,
    };
    await peerEdit(server, peerCheck, "PEER-20260930-777", NOW);

    // 4) 重试成功：原编号提交，LWW 判定对端较晚保留
    res = await syncAll(server, res.state, NOW);
    expect(res.report.ok).toBe(true);
    expect(res.report.retriedBatchIds).toContain(batchId);
    expect(res.report.conflicts).toHaveLength(1);
    state = res.state;
    expect(state.current[key].hoofShape).toBe("对端更晚修形 B");
    expect(state.current[key].nailPosition).toBe("对端 8 钉");
    const synced = state.batches.find((b) => b.batchId === batchId)!;
    expect(synced.status).toBe("synced");

    // 5) 三处视图共享冲突状态
    expect(state.conflicts[key]).toBeTruthy();
    const queue = selectReviewQueue(state, TODAY);
    const item = queue.find((q) => q.hoofKey === key)!;
    expect(item.inConflict).toBe(true);
    // 队列按对端新值重算：09-30 + 5 天
    expect(item.dueDate).toBe("2026-10-05");
    // 已发出的结论失效退回
    const conclusion = item.conclusion;
    expect(conclusion?.status).toBe("returned");
    expect(conclusion?.returnedReason).toContain("失效退回");

    // 6) 再同步一次：全部已提交，无新增冲突，幂等不重复落盘
    res = await syncAll(server, state, NOW);
    expect(res.report.ok).toBe(true);
    expect(res.report.acceptedBatchIds).toHaveLength(0);
  });

  it("本机现场值较晚时本机值保留，随批新结论保持有效", async () => {
    const server = new MockRemoteServer();
    let state = localArchive.loadState(() => buildSeed().state);
    const key = hoofKey("HORSE-27", "RH");

    server.setStatus("offline");
    state = ingestLocalCheck(
      state,
      "HORSE-27",
      "RH",
      input({ inspectedAt: "2026-09-30T16:00", hoofShape: "本机最晚值", nextReviewDays: 12 }),
      NOW,
    ).state;
    state = issueConclusion(state, "HORSE-27", "RH", "基于本机最晚值的结论", NOW).state;
    localArchive.saveState(state);

    server.setStatus("online");
    // 对端较早的改动
    const remote = localArchive.loadRemote(() => ({ current: {}, history: [], conclusions: [], batches: [] }));
    await peerEdit(
      server,
      { ...remote.current[key], inspectedAt: "2026-09-30T08:00", hoofShape: "对端较早值" },
      "PEER-20260930-100",
      NOW,
    );

    const res = await syncAll(server, state, NOW);
    expect(res.report.conflicts[0].winnerSide).toBe("incoming");
    expect(res.state.current[key].hoofShape).toBe("本机最晚值");
    const queue = selectReviewQueue(res.state, TODAY);
    const item = queue.find((q) => q.hoofKey === key)!;
    expect(item.conclusion?.status).toBe("issued");
    expect(item.dueDate).toBe("2026-10-12");
  });
});
