import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  acknowledgeConflict as acknowledgeConflictPure,
  ingestLocalCheck,
  issueConclusion as issueConclusionPure,
} from "../core/merge";
import { nowMinute, todayISO } from "../core/id";
import type {
  AppState,
  HoofCheck,
  HoofPosition,
  OnlineStatus,
} from "../core/types";
import { buildSeed } from "../core/seed";
import { localArchive, MockRemoteServer } from "../archive/storage";
import { peerEdit, syncAll, type SyncReport } from "../archive/sync";

interface StoreValue {
  state: AppState;
  online: boolean;
  busy: boolean;
  today: string;
  lastReport: SyncReport | null;
  toast: { kind: "ok" | "error"; text: string } | null;
  saveCheck: (
    horseId: string,
    hoof: HoofPosition,
    input: Omit<HoofCheck, "horseId" | "hoof" | "abnormalGait">,
  ) => void;
  issueConclusion: (horseId: string, hoof: HoofPosition, result: string) => void;
  sync: () => Promise<void>;
  setOnline: (s: OnlineStatus) => void;
  armFailure: () => void;
  peerEdit: (horseId: string, hoof: HoofPosition, mode: "earlier" | "later") => Promise<void>;
  acknowledge: (hoofKey: string) => void;
  resetAll: () => void;
  clearToast: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function shiftInspected(base: string, minutes: number): string {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const seedRef = useRef(buildSeed());
  const serverRef = useRef<MockRemoteServer | null>(null);
  if (!serverRef.current) serverRef.current = new MockRemoteServer();

  const [state, setState] = useState<AppState>(() =>
    localArchive.loadState(() => seedRef.current.state),
  );
  const [online, setOnlineState] = useState<boolean>(() => serverRef.current!.isOnline());
  const [busy, setBusy] = useState(false);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [toast, setToast] = useState<StoreValue["toast"]>(null);

  const persist = useCallback((next: AppState) => {
    localArchive.saveState(next);
    setState(next);
  }, []);

  const flash = useCallback((kind: "ok" | "error", text: string) => {
    setToast({ kind, text });
  }, []);

  const saveCheck = useCallback<StoreValue["saveCheck"]>(
    (horseId, hoof, input) => {
      const { state: next, error } = ingestLocalCheck(
        state,
        horseId,
        hoof,
        input,
        nowMinute(),
      );
      if (error) {
        flash("error", `未保存：${error}`);
        return;
      }
      persist(next);
      flash("ok", `已记入当天批次（本机暂存）：${horseId} ${hoof}`);
    },
    [state, persist, flash],
  );

  const issueConclusion = useCallback<StoreValue["issueConclusion"]>(
    (horseId, hoof, result) => {
      const { state: next, error } = issueConclusionPure(
        state,
        horseId,
        hoof,
        result,
        nowMinute(),
      );
      if (error) {
        flash("error", error);
        return;
      }
      persist(next);
      flash("ok", "复查结论已发出，随当天批次同步");
    },
    [state, persist, flash],
  );

  const sync = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { state: next, report } = await syncAll(
        serverRef.current!,
        state,
        nowMinute(),
      );
      persist(next);
      setLastReport(report);
      if (report.ok) {
        const conflictText =
          report.conflicts.length > 0
            ? `，检测到 ${report.conflicts.length} 处蹄位两处同改，已按现场时间较晚者保留`
            : "";
        const retryText =
          report.retriedBatchIds.length > 0
            ? `（沿用原编号重试 ${report.retriedBatchIds.length} 批）`
            : "";
        flash(
          report.conflicts.length > 0 ? "error" : "ok",
          `批次 ${report.acceptedBatchIds.join("、") || "无待同步"} 已合并${retryText}${conflictText}`,
        );
      } else {
        flash(
          "error",
          `批次 ${report.failure!.batchId} 写入失败，已保留原编号待重试，未提交任何蹄位`,
        );
      }
    } finally {
      setBusy(false);
    }
  }, [busy, state, persist, flash]);

  const setOnline = useCallback((s: OnlineStatus) => {
    serverRef.current!.setStatus(s);
    setOnlineState(s === "online");
  }, []);

  const armFailure = useCallback(() => {
    serverRef.current!.armWriteFailure();
    flash("ok", "已注入：下一次整批写入会失败（之后恢复）");
  }, [flash]);

  const peerEditAction = useCallback<StoreValue["peerEdit"]>(
    async (horseId, hoof, mode) => {
      const current = state.current[`${horseId}#${hoof}`];
      if (!current) {
        flash("error", "该蹄位还没有本机检查，先在本机做一次检查");
        return;
      }
      const delta = mode === "later" ? 90 : -120;
      const check: HoofCheck = {
        ...current,
        inspectedAt: shiftInspected(current.inspectedAt, delta),
        hoofShape:
          mode === "later"
            ? current.hoofShape + "（对端修形更新）"
            : current.hoofShape + "（对端较早记录）",
        nailPosition:
          mode === "later" ? "对端重钉 7 钉" : "对端旧钉位 6 钉",
        photoNote: "来自另一台设备的并发改动",
      };
      const day = check.inspectedAt.slice(0, 10);
      const batchId = `PEER-${day.replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
      setBusy(true);
      try {
        await peerEdit(serverRef.current!, check, batchId, nowMinute());
        flash(
          "ok",
          `对端设备已在服务端改动 ${horseId} ${hoof}（现场时间 ${check.inspectedAt}），${
            online ? "点“立即同步”拉取合并" : "当前断网，恢复后同步即可触发冲突"
          }`,
        );
      } finally {
        setBusy(false);
      }
    },
    [state, online, flash],
  );

  const acknowledge = useCallback(
    (key: string) => persist(acknowledgeConflictPure(state, key)),
    [state, persist],
  );

  const resetAll = useCallback(() => {
    const seed = buildSeed();
    seedRef.current = seed;
    localArchive.reset(seed);
    serverRef.current!.resetMeta();
    setOnlineState(true);
    setState(seed.state);
    setLastReport(null);
    flash("ok", "已重置为演示种子数据");
  }, [flash]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      online,
      busy,
      today: todayISO(new Date("2026-09-30T12:00:00")),
      lastReport,
      toast,
      saveCheck,
      issueConclusion,
      sync,
      setOnline,
      armFailure,
      peerEdit: peerEditAction,
      acknowledge,
      resetAll,
      clearToast: () => setToast(null),
    }),
    [
      state,
      online,
      busy,
      lastReport,
      toast,
      saveCheck,
      issueConclusion,
      sync,
      setOnline,
      armFailure,
      peerEditAction,
      acknowledge,
      resetAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
