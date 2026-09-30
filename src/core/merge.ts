import {
  hoofKey,
  isAbnormalGait,
  reviewDueDate,
  validateBatch,
} from "./hoof";
import { batchIdOf, uid } from "./id";
import type {
  AppState,
  BatchCheckEntry,
  ConflictRecord,
  HoofCheck,
  HoofHistoryEvent,
  HoofPosition,
  RemoteResult,
  RemoteState,
  ReviewConclusion,
  StoredBatch,
} from "./types";

function eventId(batchId: string, horseId: string, hoof: HoofPosition): string {
  return `${batchId}:${horseId}#${hoof}`;
}

function makeHistoryEvent(
  batchId: string,
  check: HoofCheck,
  prevShoe: string | undefined,
  source: "local" | "peer",
  overrides: Partial<HoofHistoryEvent> = {},
): HoofHistoryEvent {
  const key = hoofKey(check.horseId, check.hoof);
  return {
    id: eventId(batchId, check.horseId, check.hoof),
    hoofKey: key,
    inspectedAt: check.inspectedAt,
    shoeType: check.shoeType,
    hoofShape: check.hoofShape,
    nailPosition: check.nailPosition,
    shoeChanged: prevShoe !== undefined && prevShoe !== check.shoeType,
    batchId,
    source,
    ...overrides,
  };
}

/** 仅退回指定蹄位集合中处于已发出状态的结论 */
function invalidateConclusionsFor(
  conclusions: ReviewConclusion[],
  hoofKeys: string[],
  at: string,
  reason: string,
): ReviewConclusion[] {
  const set = new Set(hoofKeys);
  return conclusions.map((c) =>
    set.has(c.hoofKey) && c.status === "issued"
      ? { ...c, status: "returned", returnedAt: at, returnedReason: reason }
      : c,
  );
}

/** 为同一蹄位换上新结论：旧的已发出结论标记退回留痕，新结论追加在后（队列取最后一条） */
function supersedeConclusion(
  list: ReviewConclusion[],
  next: ReviewConclusion,
  at: string,
  reason: string,
): ReviewConclusion[] {
  const marked = list.map((c) =>
    c.hoofKey === next.hoofKey && c.status === "issued"
      ? { ...c, status: "returned" as const, returnedAt: at, returnedReason: reason }
      : c,
  );
  return [...marked, next];
}

// ───────────────────────── 本机（离线）侧 ─────────────────────────

/**
 * 蹄铁师在本机保存一条蹄位检查：
 * - 先做原子性校验，缺字段直接拒绝（不写半条）
 * - 并入当天开放批次；无开放批次则按当天序号开新批次（序号只在批次成功提交后才被占用）
 * - 同一蹄位再改，替换批次内条目，沿用原批次编号，base 时间戳保持为首次保存时的基线
 * - 已经发出的复查结论，一旦对应蹄位变化立即失效退回
 */
export function ingestLocalCheck(
  state: AppState,
  horseId: string,
  hoof: HoofPosition,
  input: Omit<HoofCheck, "horseId" | "hoof" | "abnormalGait">,
  now: string,
): { state: AppState; error?: string } {
  const check: HoofCheck = {
    ...input,
    horseId,
    hoof,
    abnormalGait: isAbnormalGait(input.gait),
  };
  const errors = validateBatch([check]);
  if (errors.length > 0) return { state, error: errors.join("；") };

  const key = hoofKey(horseId, hoof);
  const day = input.inspectedAt.slice(0, 10);
  const existingOpen = state.batches.find((b) => b.day === day && b.status === "open");

  let batch: StoredBatch;
  if (existingOpen) {
    batch = existingOpen;
  } else {
    const seq = (state.daySeq[day] ?? 0) + 1;
    batch = {
      batchId: batchIdOf(day, seq),
      day,
      seq,
      status: "open",
      createdAt: now,
      attempts: 0,
      checks: [],
      conclusions: [],
    };
  }

  const previousEntry = batch.checks.find(
    (e) => hoofKey(e.check.horseId, e.check.hoof) === key,
  );
  // 沿用首次保存时的基线：本机暂存值不能污染乐观并发基线
  const base: string | null =
    previousEntry?.baseInspectedAt ?? state.current[key]?.inspectedAt ?? null;
  const entry: BatchCheckEntry = { check, baseInspectedAt: base };
  const others = batch.checks.filter((e) => e !== previousEntry);
  const nextChecks = [...others, entry];

  const prev = state.current[key];
  // 本机历史始终反映该批次该蹄位的最新一次保存（按 批次+蹄位 去重）
  const nextHistory = [
    makeHistoryEvent(batch.batchId, check, prev?.shoeType, "local"),
    ...state.history.filter(
      (h) => !(h.hoofKey === key && h.batchId === batch.batchId),
    ),
  ];

  // 发件箱里的离线结论并入（已存在的）当天批次随批提交
  const mergedOutbox = state.conclusionOutbox;
  const nextBatch: StoredBatch = {
    ...batch,
    checks: nextChecks,
    conclusions: existingOpen
      ? batch.conclusions
      : [...batch.conclusions, ...mergedOutbox],
  };

  let nextState: AppState = {
    ...state,
    current: { ...state.current, [key]: check },
    history: nextHistory,
    conclusionOutbox: existingOpen ? state.conclusionOutbox : [],
    batches: state.batches.some((b) => b.batchId === batch.batchId)
      ? state.batches.map((b) => (b.batchId === batch.batchId ? nextBatch : b))
      : [...state.batches, nextBatch],
    daySeq: existingOpen ? state.daySeq : { ...state.daySeq, [day]: batch.seq },
  };

  const changedLocally =
    prev !== undefined &&
    (prev.inspectedAt !== check.inspectedAt ||
      prev.hoofShape !== check.hoofShape ||
      prev.gait !== check.gait ||
      prev.shoeType !== check.shoeType ||
      prev.nailPosition !== check.nailPosition);

  if (prev && changedLocally) {
    nextState = {
      ...nextState,
      conclusions: invalidateConclusionsFor(
        nextState.conclusions,
        [key],
        now,
        "对应蹄位在本机被重新检查，复查结论失效退回",
      ),
      conclusionOutbox: invalidateConclusionsFor(
        nextState.conclusionOutbox,
        [key],
        now,
        "对应蹄位在本机被重新检查，复查结论失效退回",
      ),
    };
  }
  return { state: nextState };
}

/** 离线发出复查结论；挂到当天开放批次随批提交（没有批次则进入发件箱，下批自动带上） */
export function issueConclusion(
  state: AppState,
  horseId: string,
  hoof: HoofPosition,
  result: string,
  now: string,
): { state: AppState; error?: string } {
  const key = hoofKey(horseId, hoof);
  const based = state.current[key];
  if (!based) return { state, error: "该蹄位还没有检查记录，无法发出复查结论" };
  const day = now.slice(0, 10);
  const conclusion: ReviewConclusion = {
    id: uid("con"),
    hoofKey: key,
    basedOnInspectedAt: based.inspectedAt,
    result: result.trim() || "复查通过",
    issuedAt: now,
    status: "issued",
    batchId: "",
  };

  const open = state.batches.find((b) => b.day === day && b.status === "open");
  if (open) {
    return {
      state: {
        ...state,
        conclusions: supersedeConclusion(state.conclusions, conclusion, now, "同一蹄位发出了新的复查结论"),
        batches: state.batches.map((b) =>
          b.batchId === open.batchId
            ? { ...b, conclusions: supersedeConclusion(b.conclusions, conclusion, now, "同一蹄位发出了新的复查结论") }
            : b,
        ),
      },
    };
  }
  return {
    state: {
      ...state,
      conclusions: supersedeConclusion(state.conclusions, conclusion, now, "同一蹄位发出了新的复查结论"),
      conclusionOutbox: supersedeConclusion(state.conclusionOutbox, conclusion, now, "同一蹄位发出了新的复查结论"),
    },
  };
}

// ───────────────────────── 服务端侧：整批原子提交 ─────────────────────────

/**
 * 把一个批次写入服务端，要么整批成功，要么整批失败（无半条）。
 * 沿用原批次号重试时命中幂等，直接返回首次结果。
 * 冲突判定：批次条目保存时的 baseInspectedAt 与服务端现值不同 → 两处都改过该蹄位，
 * 保留现场时间（inspectedAt）较晚的值。
 */
export function commitBatch(
  remote: RemoteState,
  batch: StoredBatch,
  now: string,
): RemoteResult {
  const existing = remote.batches.find((b) => b.batchId === batch.batchId);
  if (existing) {
    return {
      state: remote,
      conflicts: existing.conflicts ?? [],
      acceptedBatchId: batch.batchId,
      idempotent: true,
    };
  }

  const errors = validateBatch(batch.checks.map((e) => e.check));
  if (errors.length > 0) {
    throw new Error(`批次 ${batch.batchId} 校验失败，整批拒绝：${errors.join("；")}`);
  }

  let current = { ...remote.current };
  let history = [...remote.history];
  let conclusions = [...remote.conclusions];
  const conflicts: ConflictRecord[] = [];
  const changedKeys: string[] = [];
  /** 本批各蹄位最终保留的现场值 */
  const keptByKey = new Map<string, string>();

  for (const entry of batch.checks) {
    const { check } = entry;
    const key = hoofKey(check.horseId, check.hoof);
    const remotePrev = current[key];
    const diverged =
      remotePrev !== undefined && remotePrev.inspectedAt !== entry.baseInspectedAt;
    const incomingWins =
      remotePrev === undefined || check.inspectedAt >= remotePrev.inspectedAt;

    if (diverged) {
      conflicts.push({
        id: uid("cfl"),
        hoofKey: key,
        batchId: batch.batchId,
        incomingBatchId: batch.batchId,
        incomingSource: "local",
        inspectedAtWinner: incomingWins
          ? check.inspectedAt
          : remotePrev.inspectedAt,
        inspectedAtLoser: incomingWins
          ? remotePrev.inspectedAt
          : check.inspectedAt,
        winnerSide: incomingWins ? "incoming" : "current",
        resolvedAt: now,
        acknowledged: false,
      });
    }

    if (remotePrev === undefined || incomingWins) {
      current[key] = check;
      keptByKey.set(key, check.inspectedAt);
      if (remotePrev === undefined || remotePrev.inspectedAt !== check.inspectedAt) {
        changedKeys.push(key);
      }
      history = [
        makeHistoryEvent(batch.batchId, check, remotePrev?.shoeType, "local", {
          conflictWinner: diverged ? incomingWins : undefined,
        }),
        ...history,
      ];
    } else {
      // 现场值较旧 → 不覆盖当前值，批次检查仍留痕，标记为冲突落败
      keptByKey.set(key, remotePrev.inspectedAt);
      history = [
        makeHistoryEvent(batch.batchId, check, remotePrev.shoeType, "local", {
          conflictWinner: false,
          conflictDropped: true,
        }),
        ...history,
      ];
    }
  }

  // 本批随附的复查结论上送（保留稳定 id，保证幂等重试结果一致）
  const stampedBatchConclusions = batch.conclusions.map((c) => ({
    ...c,
    id: c.id || uid("con"),
    batchId: batch.batchId,
  }));
  for (const c of stampedBatchConclusions) {
    conclusions = supersedeConclusion(
      conclusions,
      c,
      now,
      "同一蹄位随新批次提交了新的复查结论",
    );
  }

  // 已发出的复查结论一旦对应蹄位发生变化就失效退回（冲突落败、蹄位没变则不退）。
  // 本批随附结论不参与这一步，由下一步按其基于的检查值是否被保留单独判定。
  const batchConclusionIds = new Set(stampedBatchConclusions.map((c) => c.id));
  conclusions = conclusions.map((c) => {
    if (batchConclusionIds.has(c.id)) return c;
    if (c.status !== "issued" || !changedKeys.includes(c.hoofKey)) return c;
    return {
      ...c,
      status: "returned",
      returnedAt: now,
      returnedReason:
        "对应蹄位发生变化（合并批次 " + batch.batchId + "），复查结论失效退回",
    };
  });
  // 本批结论仅当基于合并后实际保留的新值时才保持有效，否则退回
  for (const c of stampedBatchConclusions) {
    if (keptByKey.get(c.hoofKey) !== c.basedOnInspectedAt) {
      conclusions = conclusions.map((x) =>
        x.id === c.id
          ? {
              ...x,
              status: "returned",
              returnedAt: now,
              returnedReason: "对应蹄位的保留值晚于结论所依据的检查值，结论失效退回",
            }
          : x,
      );
    }
  }

  const storedBatch: StoredBatch = {
    ...batch,
    status: "synced",
    conflicts,
  };

  return {
    state: {
      current,
      history,
      conclusions,
      batches: [...remote.batches, storedBatch],
    },
    conflicts,
    acceptedBatchId: batch.batchId,
    idempotent: false,
  };
}

/**
 * 对端（另一台设备）在服务端直接写入一个蹄位改动，用于模拟断网期间的两处同改。
 */
export function peerCommit(
  remote: RemoteState,
  check: HoofCheck,
  batchId: string,
  now: string,
): { remote: RemoteState } {
  const errors = validateBatch([check]);
  if (errors.length > 0) throw new Error(errors.join("；"));
  const key = hoofKey(check.horseId, check.hoof);
  const prev = remote.current[key];
  const next: RemoteState = {
    ...remote,
    current: { ...remote.current, [key]: check },
    history: [
      makeHistoryEvent(batchId, check, prev?.shoeType, "peer"),
      ...remote.history,
    ],
    conclusions: invalidateConclusionsFor(
      remote.conclusions,
      prev && prev.inspectedAt !== check.inspectedAt ? [key] : [],
      now,
      "对端设备改动了对应蹄位（批次 " + batchId + "），复查结论失效退回",
    ),
    batches: [
      ...remote.batches,
      {
        batchId,
        day: check.inspectedAt.slice(0, 10),
        seq: 0,
        status: "synced",
        createdAt: now,
        attempts: 1,
        checks: [{ check, baseInspectedAt: prev?.inspectedAt ?? null }],
        conclusions: [],
      },
    ],
  };
  return { remote: next };
}

// ───────────────────────── 合并收敛：网络恢复后按当天批次合并 ─────────────────────────

/**
 * 推送成功后拉取服务端全量并收敛本机：
 * - 当前值、历史、结论以服务端为准（冲突已在 commitBatch 判定完）
 * - 本批冲突并入本机冲突视图，马匹列表 / 更换历史 / 复查队列共用该状态
 * - 成功提交的批次沿用编号标记 synced；当天序号不回收，下一批用新序号
 * - 复查队列按新值重算由 selectors 负责
 */
export function convergeAfterSync(
  state: AppState,
  remote: RemoteState,
  serverConflicts: ConflictRecord[],
  acceptedIds: string[],
): AppState {
  const conflictMap: AppState["conflicts"] = { ...state.conflicts };
  for (const c of serverConflicts) {
    conflictMap[c.hoofKey] = c;
  }
  // 已随批提交成功的结论不再留在发件箱（按 hoofKey 清理）
  const submittedHoofs = new Set(
    state.batches
      .filter((b) => acceptedIds.includes(b.batchId))
      .flatMap((b) => b.conclusions.map((c) => c.hoofKey)),
  );
  return {
    ...state,
    current: remote.current,
    history: remote.history,
    conclusions: remote.conclusions,
    conflicts: conflictMap,
    batches: state.batches.map((b) =>
      acceptedIds.includes(b.batchId) ? { ...b, status: "synced" as const } : b,
    ),
    submittedBatchIds: Array.from(
      new Set([...state.submittedBatchIds, ...acceptedIds]),
    ),
    conclusionOutbox: state.conclusionOutbox.filter(
      (c) => !submittedHoofs.has(c.hoofKey),
    ),
  };
}

/** 批次写入失败：保持原编号、原内容，仅记录尝试次数与原因，等待重试 */
export function markBatchFailed(
  state: AppState,
  batchId: string,
  reason: string,
  now: string,
): AppState {
  return {
    ...state,
    batches: state.batches.map((b) =>
      b.batchId === batchId
        ? {
            ...b,
            status: "failed",
            attempts: b.attempts + 1,
            lastAttemptAt: now,
            lastError: reason,
          }
        : b,
    ),
  };
}

export function acknowledgeConflict(state: AppState, hoofKeyStr: string): AppState {
  const c = state.conflicts[hoofKeyStr];
  if (!c) return state;
  return {
    ...state,
    conflicts: { ...state.conflicts, [hoofKeyStr]: { ...c, acknowledged: true } },
  };
}

export function dueOf(check: HoofCheck): string {
  return reviewDueDate(check);
}
