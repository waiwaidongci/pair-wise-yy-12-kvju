import { describe, expect, it } from "vitest";
import { hoofKey, addDays } from "./hoof";
import { selectReviewQueue } from "./selectors";
import {
  commitBatch,
  convergeAfterSync,
  ingestLocalCheck,
  issueConclusion,
  markBatchFailed,
  peerCommit,
} from "./merge";
import { buildSeed } from "./seed";
import type { HoofCheck, RemoteState } from "./types";

const TODAY = "2026-09-30";
const NOW = "2026-09-30T18:00";

function checkInput(over: Partial<HoofCheck> = {}) {
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

function emptyRemote(): RemoteState {
  return { current: {}, history: [], conclusions: [], batches: [] };
}

function openBatches(state: ReturnType<typeof buildSeed>["state"]) {
  return state.batches.filter((b) => b.status !== "synced");
}

describe("蹄位检查原子性", () => {
  it("缺字段的单条检查被拒绝，不写半条", () => {
    const { state } = buildSeed();
    const before = state.batches.length;
    const { state: next, error } = ingestLocalCheck(
      state,
      "HORSE-18",
      "LF",
      checkInput({ nailPosition: "" }),
      NOW,
    );
    expect(error).toContain("钉位");
    expect(next.batches.length).toBe(before);
    expect(next.current[hoofKey("HORSE-18", "LF")].nailPosition).toBe(
      state.current[hoofKey("HORSE-18", "LF")].nailPosition,
    );
  });

  it("批次内任一条不合法，commitBatch 整批抛错且服务端无任何蹄位落盘", () => {
    const remote = emptyRemote();
    const badBatch = {
      batchId: "B-20260930-01",
      day: "2026-09-30",
      seq: 1,
      status: "open" as const,
      createdAt: NOW,
      attempts: 0,
      checks: [
        {
          check: {
            ...checkInput(),
            horseId: "HORSE-18",
            hoof: "LF" as const,
            abnormalGait: false,
          },
          baseInspectedAt: null,
        },
        {
          check: {
            ...checkInput({ hoofShape: "" }),
            horseId: "HORSE-18",
            hoof: "RF" as const,
            abnormalGait: false,
          },
          baseInspectedAt: null,
        },
      ],
      conclusions: [],
    };
    expect(() => commitBatch(remote, badBatch, NOW)).toThrow(/整批拒绝/);
    expect(Object.keys(remote.current)).toHaveLength(0);
  });
});

describe("当天批次编号", () => {
  it("离线记录归入当天开放批次，同蹄位再改沿用原批次号", () => {
    const { state } = buildSeed();
    let s = ingestLocalCheck(state, "HORSE-18", "LF", checkInput(), NOW).state!;
    const firstId = openBatches(s)[0].batchId;
    expect(firstId).toBe("B-20260930-01");

    s = ingestLocalCheck(
      s,
      "HORSE-18",
      "LF",
      checkInput({ nailPosition: "外侧补钉 7 钉" }),
      NOW,
    ).state!;
    const open = openBatches(s);
    expect(open).toHaveLength(1);
    expect(open[0].batchId).toBe(firstId);
    expect(open[0].checks).toHaveLength(1);
    // 乐观基线保持为首次保存时的值（种子值），不被本机暂存值污染
    expect(open[0].checks[0].baseInspectedAt).toBe("2026-09-16T10:30");
  });
});

describe("两处同改：保留现场时间较晚的检查值", () => {
  it("本机值现场时间晚 → 本机值保留，冲突记录 winner=incoming", () => {
    const { state } = buildSeed();
    let remote: RemoteState = {
      current: { ...buildSeed().remote.current },
      history: [],
      conclusions: [],
      batches: [],
    };
    // 对端在服务端先改，现场时间 09:00
    const peerCheck: HoofCheck = {
      ...buildSeed().remote.current[hoofKey("HORSE-18", "LF")],
      inspectedAt: "2026-09-30T09:00",
      hoofShape: "对端较早修形",
      nailPosition: "对端 6 钉",
    };
    remote = peerCommit(remote, peerCheck, "PEER-3009-01", NOW).remote;

    // 本机 10:00 记录（基线为种子 09-16）
    const s = ingestLocalCheck(
      state,
      "HORSE-18",
      "LF",
      checkInput({ inspectedAt: "2026-09-30T10:00", hoofShape: "本机较晚修形", nailPosition: "本机 7 钉" }),
      NOW,
    ).state!;
    const batch = openBatches(s)[0];
    const result = commitBatch(remote, batch, NOW);
    const key = hoofKey("HORSE-18", "LF");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].winnerSide).toBe("incoming");
    expect(result.state.current[key].hoofShape).toBe("本机较晚修形");
  });

  it("对端值现场时间晚 → 对端值保留，本机记录落败留痕，队列按新值重算", () => {
    const seed = buildSeed();
    let remote: RemoteState = {
      current: { ...seed.remote.current },
      history: [],
      conclusions: [],
      batches: [],
    };
    const peerCheck: HoofCheck = {
      ...seed.remote.current[hoofKey("HORSE-18", "LF")],
      inspectedAt: "2026-09-30T11:00",
      hoofShape: "对端较晚修形",
      nailPosition: "对端 8 钉",
      nextReviewDays: 7,
    };
    remote = peerCommit(remote, peerCheck, "PEER-3009-02", NOW).remote;

    const s = ingestLocalCheck(
      seed.state,
      "HORSE-18",
      "LF",
      checkInput({ inspectedAt: "2026-09-30T10:00", hoofShape: "本机较早修形" }),
      NOW,
    ).state!;
    const result = commitBatch(remote, openBatches(s)[0], NOW);
    const key = hoofKey("HORSE-18", "LF");
    expect(result.state.current[key].hoofShape).toBe("对端较晚修形");
    expect(result.state.history.find((h) => h.hoofKey === key && h.conflictDropped)).toBeTruthy();

    const converged = convergeAfterSync(s, result.state, result.conflicts, [openBatches(s)[0].batchId]);
    const queue = selectReviewQueue(converged, TODAY);
    const item = queue.find((q) => q.hoofKey === key)!;
    // 新值 nextReviewDays=7，从 09-30 算 → 10-07
    expect(item.dueDate).toBe(addDays(TODAY, 7));
    expect(item.inConflict).toBe(true);
  });
});

describe("批次写入失败沿用原编号重试", () => {
  it("失败后编号与内容不变；重试成功走正常提交，再重放命中幂等", () => {
    const seed = buildSeed();
    const s1 = ingestLocalCheck(
      seed.state,
      "HORSE-31",
      "RH",
      checkInput({ inspectedAt: "2026-09-30T10:00", shoeType: "树脂蹄铁" }),
      NOW,
    ).state!;
    const batch = openBatches(s1)[0];
    const failed = markBatchFailed(s1, batch.batchId, "网络中断", NOW);
    const failedBatch = failed.batches.find((b) => b.batchId === batch.batchId)!;
    expect(failedBatch.status).toBe("failed");
    expect(failedBatch.attempts).toBe(1);
    expect(failedBatch.checks).toEqual(batch.checks);

    let remote = emptyRemote();
    const r1 = commitBatch(remote, failedBatch, NOW);
    expect(r1.idempotent).toBe(false);
    remote = r1.state;
    // 用同一编号再重放（模拟重试请求实际已到达）
    const r2 = commitBatch(remote, failedBatch, NOW);
    expect(r2.idempotent).toBe(true);
    expect(r2.state.batches.filter((b) => b.batchId === batch.batchId)).toHaveLength(1);
  });
});

describe("复查结论失效退回", () => {
  it("已发结论对应蹄位变化后退回；本批结论基于落败值也退回", () => {
    const seed = buildSeed();
    // 先在本机对 HORSE-31#LH 发结论
    let s = issueConclusion(seed.state, "HORSE-31", "LH", "旧结论：按 9 月值复查", NOW).state!;
    const oldConclusion = s.conclusions.find((c) => c.hoofKey === hoofKey("HORSE-31", "LH"))!;
    expect(oldConclusion.status).toBe("issued");

    // 本机重新检查该蹄位（更晚现场值）→ 旧结论立即退回
    s = ingestLocalCheck(
      s,
      "HORSE-31",
      "LH",
      checkInput({ inspectedAt: "2026-09-30T10:00", hoofShape: "新修形" }),
      NOW,
    ).state!;
    expect(
      s.conclusions.find((c) => c.id === oldConclusion.id)!.status,
    ).toBe("returned");

    // 对端以更晚时间再改，本批结论（随批的旧结论已退回，不带新结论）提交后对端值保留
    let remote: RemoteState = {
      current: { ...seed.remote.current },
      history: [],
      conclusions: [],
      batches: [],
    };
    const peerCheck: HoofCheck = {
      ...seed.remote.current[hoofKey("HORSE-31", "LH")],
      inspectedAt: "2026-09-30T15:00",
      hoofShape: "对端最晚修形",
    };
    remote = peerCommit(remote, peerCheck, "PEER-3009-09", NOW).remote;
    const result = commitBatch(remote, openBatches(s)[0], NOW);
    const converged = convergeAfterSync(s, result.state, result.conflicts, [openBatches(s)[0].batchId]);
    const key = hoofKey("HORSE-31", "LH");
    expect(converged.current[key].hoofShape).toBe("对端最晚修形");
    const returned = converged.conclusions.filter((c) => c.hoofKey === key && c.status === "returned");
    expect(returned.length).toBeGreaterThan(0);
  });

  it("冲突落败（服务端值未变化）不误伤服务端原有结论", () => {
    const seed = buildSeed();
    // 服务端已有一条 issued 结论（基于 09-16 的 RF 值）
    const key = hoofKey("HORSE-18", "RF");
    const based = seed.remote.current[key];
    let remote: RemoteState = {
      current: { ...seed.remote.current },
      history: [],
      conclusions: [
        {
          id: "con-srv",
          hoofKey: key,
          basedOnInspectedAt: based.inspectedAt,
          result: "服务端既有结论",
          issuedAt: "2026-09-16T11:00",
          status: "issued",
          batchId: "B-20260916-01",
        },
      ],
      batches: [],
    };
    // 本机基线仍是 08 月值（模拟基于旧快照），提交更早的现场值 → 落败，且服务端值未变
    const s = ingestLocalCheck(
      seed.state,
      "HORSE-18",
      "RF",
      checkInput({ inspectedAt: "2026-09-10T08:00", hoofShape: "本机旧值" }),
      NOW,
    ).state!;
    // 人为把基线改成 08 月以制造 diverged
    const batch = openBatches(s)[0];
    batch.checks[0].baseInspectedAt = "2026-08-19T09:00";
    const result = commitBatch(remote, batch, NOW);
    expect(result.conflicts).toHaveLength(1);
    expect(result.state.conclusions.find((c) => c.id === "con-srv")!.status).toBe("issued");
  });
});
