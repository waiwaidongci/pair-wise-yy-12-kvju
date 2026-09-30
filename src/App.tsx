import { useMemo, useState } from "react";
import "./styles.css";
import { useArchive } from "./archive/store";
import SyncBar from "./ui/SyncBar";
import HorseList from "./ui/HorseList";
import InspectionForm from "./ui/InspectionForm";
import HoofGrid from "./ui/HoofGrid";
import RecheckQueue from "./ui/RecheckQueue";
import Conclusions from "./ui/Conclusions";
import ShoeHistory from "./ui/ShoeHistory";
import { useQueue } from "./ui/selectors";

export default function App() {
  const { horses } = useArchive();
  const queue = useQueue();
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);

  const horseId = selectedHorse ?? horses[0]?.id ?? null;
  const selected = horses.find((h) => h.id === horseId);

  const metrics = useMemo(
    () => ({
      queue: queue.length,
      gait: queue.filter((q) => q.reasons.includes("异常步态")).length,
      shoe: queue.filter((q) => q.reasons.includes("蹄铁更换后复查")).length,
      horses: horses.length,
    }),
    [queue, horses],
  );

  return (
    <main className="app">
      <section className="hero">
        <p>马术蹄铁修整档案 · 离线巡诊</p>
        <h1>蹄位巡诊同步台</h1>
        <span>
          马房巡诊常遇断网：蹄形、步态、钉位先记本机，恢复联网后按当天批次编号合并；
          同一蹄位两处都修改时保留现场时间较晚的检查值，复查队列按新值重算；
          批次写入失败沿用原编号整批重试，已发结论随蹄位变化自动失效退回。
        </span>
      </section>

      <SyncBar />

      <section className="metrics">
        <article>
          <small>待复查</small>
          <strong>{metrics.queue}</strong>
        </article>
        <article>
          <small>异常步态</small>
          <strong>{metrics.gait}</strong>
        </article>
        <article>
          <small>更换蹄铁</small>
          <strong>{metrics.shoe}</strong>
        </article>
        <article>
          <small>马匹档案</small>
          <strong>{metrics.horses}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <div className="heading">
            <div>
              <p>马匹列表</p>
              <h2>在栏马匹</h2>
            </div>
          </div>
          <HorseList selectedId={horseId} onSelect={setSelectedHorse} />
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>断网可记录</p>
              <h2>新增蹄位检查</h2>
            </div>
          </div>
          <InspectionForm key={horseId} defaultHorseId={horseId} />
        </section>
      </section>

      {selected && (
        <section className="panel">
          <div className="heading">
            <div>
              <p>左右前后蹄对比</p>
              <h2>
                {selected.code} · {selected.name}
              </h2>
            </div>
            <span className={`horse-status status-${selected.status}`}>
              {selected.status === "active" ? "运动马" : "休养马"}
            </span>
          </div>
          <HoofGrid horseId={selected.id} />
        </section>
      )}

      <section className="panel">
        <div className="heading">
          <div>
            <p>合并后重算</p>
            <h2>复查队列</h2>
          </div>
        </div>
        <RecheckQueue />
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>蹄位变化即退回</p>
            <h2>复查结论</h2>
          </div>
        </div>
        <Conclusions />
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>同步显示冲突</p>
            <h2>蹄铁更换历史</h2>
          </div>
        </div>
        <ShoeHistory />
      </section>
    </main>
  );
}
