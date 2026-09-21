import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./lighting/store";
import {
  getCounts,
  sortedCuesForWorkbench,
  cueStatus,
  type CueStatusFilter,
  type TypeFilter,
} from "./lighting/rules";
import { CUE_STATUS_TEXT } from "./lighting/labels";
import { FilterBar } from "./components/FilterBar";
import { StageMap } from "./components/StageMap";
import { CueList } from "./components/CueList";
import { FixtureDetail } from "./components/FixtureDetail";
import { MaintenanceLog } from "./components/MaintenanceLog";
import { Archive } from "./components/Archive";

function Metrics() {
  const { state } = useStore();
  const counts = getCounts(state);
  const metrics = [
    { label: "灯具数量", value: counts.fixtureTotal },
    { label: "故障待处理", value: counts.faulted, tone: "danger" },
    { label: "待替换 Cue", value: counts.pendingCues, tone: "danger" },
    { label: "替补中 / 待回切", value: `${counts.replacedCues} / ${counts.awaitingReturn}` },
  ];
  return (
    <section className="metrics">
      {metrics.map((metric) => (
        <article key={metric.label} className={metric.tone === "danger" ? "alert" : ""}>
          <small>{metric.label}</small>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}

/** 待替换 Cue 持续置顶提示，直到闭环结束 */
function PendingBanner({ onJump }: { onJump: (status: CueStatusFilter) => void }) {
  const { state } = useStore();
  const pending = sortedCuesForWorkbench(state).filter((cue) => cue.status === "pending");
  const awaiting = sortedCuesForWorkbench(state).filter((cue) => cue.status === "awaitingReturn");
  if (pending.length === 0 && awaiting.length === 0) return null;

  return (
    <section className="pending-banner">
      {pending.length > 0 && (
        <div className="pending-line danger" onClick={() => onJump("pending")}>
          <b>待处理 · {pending.length} 个 Cue 待替换</b>
          <span>
            {pending.map((cue) => `${cue.id}（${CUE_STATUS_TEXT[cueStatus(state, cue)]}）`).join("、")}
          </span>
        </div>
      )}
      {awaiting.length > 0 && (
        <div className="pending-line warn" onClick={() => onJump("awaitingReturn")}>
          <b>{awaiting.length} 个 Cue 待确认回切</b>
          <span>原灯已修复，须灯光师确认后才可回切</span>
        </div>
      )}
    </section>
  );
}

function Workspace() {
  const { state } = useStore();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("全部");
  const [cueStatusFilter, setCueStatusFilter] = useState<CueStatusFilter>("全部");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);

  const currentCue = state.cues.find((cue) => cue.id === state.currentCueId);

  return (
    <>
      <PendingBanner onJump={setCueStatusFilter} />

      <section className="workspace three-col">
        <FilterBar
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          cueStatusFilter={cueStatusFilter}
          onCueStatusFilter={setCueStatusFilter}
        />
        <StageMap
          state={state}
          typeFilter={typeFilter}
          selectedFixtureId={selectedFixtureId}
          onSelectFixture={setSelectedFixtureId}
        />
        <section className="panel scene-panel">
          <p>当前场景预览</p>
          {currentCue ? (
            <>
              <h2>{currentCue.id} · {currentCue.name}</h2>
              <p className="cue-scene">{currentCue.scene}</p>
              <span className={`cue-badge ${cueStatus(state, currentCue)}`}>
                {CUE_STATUS_TEXT[cueStatus(state, currentCue)]}
              </span>
              <ul className="scene-channels">
                {currentCue.entries.map((entry) => {
                  const fx = state.fixtures.find((item) => item.id === entry.fixtureId);
                  const activeId = currentCue.substitutions[entry.fixtureId] ?? entry.fixtureId;
                  const isSub = activeId !== entry.fixtureId;
                  const active = state.fixtures.find((item) => item.id === activeId);
                  return (
                    <li
                      key={entry.fixtureId}
                      className={active?.status === "faulted" ? "fault-line" : ""}
                      style={
                        typeFilter !== "全部" && fx?.type !== typeFilter
                          ? { opacity: 0.25 }
                          : undefined
                      }
                    >
                      <button className="fixture-link" onClick={() => setSelectedFixtureId(activeId)}>
                        {activeId}
                      </button>
                      {isSub && <span className="sub-pill inline">替 {entry.fixtureId}</span>}
                      <span className="muted">{fx?.gelLabel}</span>
                      <div className="level-bar">
                        <i style={{ width: `${entry.brightness}%` }} />
                      </div>
                      <span>{entry.brightness}%</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="empty-hint">未选择 Cue。</p>
          )}
        </section>
      </section>

      <CueList cueStatusFilter={cueStatusFilter} onOpenFixture={setSelectedFixtureId} />

      <FixtureDetail fixtureId={selectedFixtureId} onClose={() => setSelectedFixtureId(null)} />

      <MaintenanceLog />
      <Archive />
    </>
  );
}

function App() {
  const { state } = useStore();
  return (
    <main className="app">
      <section className="hero compact">
        <p>hxyfront-62002 · 剧场灯光 · 故障换灯闭环</p>
        <h1>{state.showName} · Cue 表管理</h1>
        <span>{state.versionNote}</span>
      </section>
      <Metrics />
      <Workspace />
    </main>
  );
}

export default function Root() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
