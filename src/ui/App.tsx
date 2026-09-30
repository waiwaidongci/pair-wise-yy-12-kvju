import { useState } from "react";
import { StoreProvider, useStore } from "./state";
import { selectMetrics } from "../core/selectors";
import { HorseList } from "./tabs/HorseList";
import { ShoeHistory } from "./tabs/ShoeHistory";
import { ReviewQueue } from "./tabs/ReviewQueue";
import { SyncCenter } from "./tabs/SyncCenter";
import "./app.css";

type Tab = "horses" | "history" | "reviews" | "sync";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "horses", label: "马匹列表 · 四蹄对比" },
  { key: "history", label: "蹄铁更换历史" },
  { key: "reviews", label: "复查队列 / 结论" },
  { key: "sync", label: "当天批次与同步" },
];

function Toast() {
  const { toast, clearToast } = useStore();
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} onClick={clearToast}>
      {toast.kind === "error" ? "⚠ " : "✓ "}
      {toast.text}
      <small>（点击关闭）</small>
    </div>
  );
}

function Metrics() {
  const { state, today } = useStore();
  const m = selectMetrics(state, today);
  const cards = [
    { label: "待复查（14 天内）", value: m.pendingReview, tone: "blue" },
    { label: "异常步态蹄位", value: m.abnormalGait, tone: "amber" },
    { label: "蹄铁更换记录", value: m.shoeChanges, tone: "green" },
    { label: "马匹档案", value: m.horses, tone: "brown" },
    { label: "未消音冲突", value: m.conflicts, tone: "red" },
    { label: "待同步批次", value: m.pendingBatches, tone: "brown" },
  ];
  return (
    <section className="metrics">
      {cards.map((c) => (
        <article key={c.label} className={`tone-${c.tone} ${c.label.includes("冲突") && c.value > 0 ? "pulse" : ""}`}>
          <small>{c.label}</small>
          <strong>{c.value}</strong>
        </article>
      ))}
    </section>
  );
}

function NetworkBar() {
  const { online, setOnline, armFailure, busy, sync, resetAll } = useStore();
  return (
    <section className="netbar panel">
      <div className={`net-dot ${online ? "on" : "off"}`}>
        {online ? "网络已恢复" : "巡诊断网中"}
      </div>
      <div className="net-actions">
        <button onClick={() => setOnline(online ? "offline" : "online")}>
          {online ? "切换为断网" : "切换为联网"}
        </button>
        <button onClick={armFailure} title="让下一次整批写入在服务端中断">
          注入一次写入故障
        </button>
        <button className="primary" onClick={sync} disabled={busy || !online}>
          {busy ? "同步中…" : "网络恢复 · 按当天批次合并"}
        </button>
        <button onClick={resetAll}>重置演示数据</button>
      </div>
    </section>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>("horses");
  const { state } = useStore();
  const activeConflicts = Object.values(state.conflicts).filter((c) => !c.acknowledged).length;
  return (
    <main className="app">
      <header className="hero">
        <p>hxyfront-62011 · 马房巡诊离线档案 · Port 62011</p>
        <h1>马术蹄铁修整档案</h1>
        <span>
          断网时蹄形、步态、钉位先记本机；网络恢复后按当天批次编号整批合并。两处同改同一蹄位时，
          保留<strong>现场检查时间较晚</strong>的值；批次写入失败沿用原编号幂等重试，不留下半条蹄位检查；
          已发出的复查结论随蹄位变化自动失效退回。判定 / 存档 / 界面三层分离。
        </span>
      </header>

      <NetworkBar />
      <Metrics />

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "reviews" && activeConflicts > 0 && (
              <i className="tab-badge">{activeConflicts}</i>
            )}
          </button>
        ))}
      </nav>

      {tab === "horses" && <HorseList />}
      {tab === "history" && <ShoeHistory />}
      {tab === "reviews" && <ReviewQueue />}
      {tab === "sync" && <SyncCenter />}

      <Toast />
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
