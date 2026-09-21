import { useMemo, useState } from "react";
import type {
  AppState,
  Cue,
  CueFixtureEntry,
  CueStatus,
  EffectiveFixtureStatus,
  Fixture,
} from "./types";
import { FIXTURE_TYPES } from "./seed";
import {
  CUE_STATUS_LABEL,
  EFFECTIVE_STATUS_LABEL,
  cueDisplacedEntries,
  cuePendingEntries,
  cueStatus,
  effectiveStatus,
  eligibleReplacement,
  entryFixture,
  findEligibleReplacements,
  fixtureById,
  INELIGIBLE_REASON_TEXT,
  isEntryDisplaced,
  pendingCueCount,
  selectVisibleCues,
  selectVisibleFixtures,
} from "./rules";
import {
  confirmSwitchback,
  exportArchive,
  markFixtureRepaired,
  reportFixtureFault,
  resetDemo,
  setCueStatusFilter,
  setCurrentCue,
  setFixtureStatusFilter,
  submitSubstitution,
  toggleTypeFilter,
  updateShowInfo,
  useAppState,
} from "./store";

const STATUS_COLOR: Record<EffectiveFixtureStatus, string> = {
  normal: "#06b6d4",
  faulty: "#dc2626",
  restoredPending: "#f59e0b",
  substituting: "#7c3aed",
};

const CUE_STATUS_COLOR: Record<CueStatus, string> = {
  normal: "#0e9f6e",
  pending: "#dc2626",
  substituting: "#7c3aed",
};

function gelColor(gel: string): string {
  if (gel.includes("冷蓝")) return "#2563eb";
  if (gel.includes("暖")) return "#f59e0b";
  return "#94a3b8";
}

// ---------- 顶部信息 + 指标 ----------

function Hero({ state }: { state: AppState }) {
  const counts = useMemo(() => {
    const c = { normal: 0, faulty: 0, restoredPending: 0, substituting: 0 };
    for (const f of state.fixtures) c[effectiveStatus(state, f)]++;
    return c;
  }, [state]);

  const currentCue = state.cues.find((c) => c.id === state.currentCueId);

  return (
    <section className="hero">
      <p>hxyfront-62002 · 故障换灯闭环 · Port 62002</p>
      <input
        className="show-name"
        value={state.showName}
        onChange={(e) => updateShowInfo({ showName: e.target.value })}
        aria-label="演出名称"
      />
      <input
        className="version-note"
        value={state.versionNote}
        onChange={(e) => updateShowInfo({ versionNote: e.target.value })}
        aria-label="演出版本备注"
      />
      <div className="metric-row">
        <Metric label="灯具总数" value={state.fixtures.length} />
        <Metric label="故障" value={counts.faulty} tone="#dc2626" />
        <Metric label="待替换Cue" value={pendingCueCount(state)} tone="#dc2626" />
        <Metric label="当前场景" value={currentCue?.id ?? "—"} small />
      </div>
    </section>
  );
}

function Metric({ label, value, tone, small }: { label: string; value: string | number; tone?: string; small?: boolean }) {
  return (
    <div className="metric">
      <small>{label}</small>
      <strong style={tone ? { color: tone } : undefined} className={small ? "metric-small" : undefined}>
        {value}
      </strong>
    </div>
  );
}

// ---------- 筛选模块（灯具筛选 + Cue 状态筛选，随存档持久化） ----------

function FilterPanel({ state }: { state: AppState }) {
  const { filters } = state;
  return (
    <aside className="panel filter-panel">
      <h2>灯具筛选</h2>
      <p className="panel-sub">同时作用于舞台图与灯具清单</p>
      <div className="filter-group">
        <span>灯位类型</span>
        <div className="chips">
          {FIXTURE_TYPES.map((type) => (
            <button
              key={type}
              className={filters.fixtures.types.includes(type) ? "chip-on" : "chip-off"}
              onClick={() => toggleTypeFilter(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span>灯具状态</span>
        <div className="chips">
          {(["all", "normal", "faulty", "restoredPending", "substituting"] as const).map((s) => (
            <button
              key={s}
              className={filters.fixtures.fixtureStatus === s ? "chip-on" : "chip-off"}
              onClick={() => setFixtureStatusFilter(s)}
            >
              {s === "all" ? "全部" : EFFECTIVE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span>Cue 状态</span>
        <div className="chips">
          {(["all", "pending", "substituting", "normal"] as const).map((s) => (
            <button
              key={s}
              className={filters.cueStatus === s ? "chip-on cue-chip" : "chip-off"}
              onClick={() => setCueStatusFilter(s)}
            >
              {s === "all" ? "全部" : CUE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="archive-box">
        <h3>本地存档</h3>
        <p>所有状态自动写入浏览器 localStorage，刷新页面后故障、待替换、筛选均保留。</p>
        <div className="btn-row">
          <button onClick={exportArchive}>导出存档</button>
          <button className="danger-ghost" onClick={resetDemo}>重置演示</button>
        </div>
      </div>
    </aside>
  );
}

// ---------- 舞台平面图 ----------

const ZONE_LAYOUT: { zone: string; style: React.CSSProperties }[] = [
  { zone: "台口（面光桥）", style: { left: "0%", top: "0%", width: "100%", height: "22%" } },
  { zone: "前场区", style: { left: "12%", top: "22%", width: "76%", height: "20%" } },
  { zone: "中区", style: { left: "12%", top: "42%", width: "76%", height: "24%" } },
  { zone: "侧台", style: { left: "0%", top: "22%", width: "12%", height: "60%" } },
  { zone: "侧台", style: { left: "88%", top: "22%", width: "12%", height: "60%" } },
  { zone: "后区", style: { left: "12%", top: "66%", width: "76%", height: "34%" } },
];

function StageMap({
  state,
  selectedId,
  onSelect,
}: {
  state: AppState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const visible = new Set(selectVisibleFixtures(state).map((f) => f.id));
  const currentCue = state.cues.find((c) => c.id === state.currentCueId);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>舞台平面灯位图</p>
          <h2>灯位固定 · 当前场景 {currentCue?.id}</h2>
        </div>
      </div>
      <div className="stage">
        {ZONE_LAYOUT.map((z, i) => (
          <div key={i} className="stage-zone" style={z.style}>
            <span>{z.zone}</span>
          </div>
        ))}
        {state.fixtures.map((f) => {
          const status = effectiveStatus(state, f);
          const dim = !visible.has(f.id);
          const selected = selectedId === f.id;
          const inCurrent = currentCue?.entries.some((e) => e.fixtureId === f.id);
          return (
            <button
              key={f.id}
              className={"lamp" + (dim ? " lamp-dim" : "") + (selected ? " lamp-selected" : "")}
              style={{ left: `${f.x}%`, top: `${f.y}%`, borderColor: STATUS_COLOR[status] }}
              onClick={() => onSelect(f.id)}
              title={`${f.id} CH${f.channel} ${f.type} ${f.gel} ${f.zone} · ${EFFECTIVE_STATUS_LABEL[status]}`}
            >
              <span className="lamp-dot" style={{ background: gelColor(f.gel) }} />
              <span className="lamp-id">{f.id}</span>
              {status === "faulty" && <span className="lamp-flag">✕</span>}
              {status === "restoredPending" && <span className="lamp-flag">↩</span>}
              {status === "substituting" && <span className="lamp-flag">替</span>}
              {inCurrent && <span className="lamp-cue-ring" style={{ borderColor: STATUS_COLOR[status] }} />}
            </button>
          );
        })}
      </div>
      <div className="legend">
        {(["normal", "faulty", "restoredPending", "substituting"] as const).map((s) => (
          <span key={s} className="legend-item">
            <i style={{ background: STATUS_COLOR[s] }} />
            {EFFECTIVE_STATUS_LABEL[s]}
          </span>
        ))}
        <span className="legend-tip">圆点为色片（蓝=冷蓝 / 橙=暖色 / 灰=中性），圆环表示当前场景使用中</span>
      </div>
    </section>
  );
}

// ---------- 当前场景预览 ----------

function ScenePreview({ state }: { state: AppState }) {
  const cue = state.cues.find((c) => c.id === state.currentCueId);
  if (!cue) return null;
  const status = cueStatus(state, cue);
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>当前场景预览</p>
          <h2>{cue.id} · {cue.name}</h2>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="scene-line">场景：{cue.scene}</p>
      <div className="scene-lamps">
        {cue.entries.map((entry) => {
          const f = entryFixture(state, entry);
          const displaced = isEntryDisplaced(entry);
          const original = fixtureById(state, entry.originalId);
          return (
            <div key={entry.originalId} className={"scene-lamp" + (!f || f.status !== "normal" ? " scene-lamp-warn" : "")}>
              <span className="scene-beam" style={{ opacity: entry.brightness / 100, background: f ? gelColor(f.gel) : "#475569" }} />
              <div>
                <strong>{displaced ? `${entry.fixtureId} → 灯位 ${entry.originalId}` : entry.originalId}</strong>
                <small>
                  CH{f?.channel ?? "?"} · {f?.gel} · {f?.zone} · 亮度 {entry.brightness}%
                </small>
                {displaced && (
                  <small className="sub-line">替补原灯 {original?.id}（{original ? EFFECTIVE_STATUS_LABEL[effectiveStatus(state, original)] : "—"}）</small>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="btn-row">
        {[...state.cues].sort((a, b) => a.order - b.order).map((c) => (
          <button
            key={c.id}
            className={c.id === cue.id ? "chip-on" : "chip-off"}
            onClick={() => setCurrentCue(c.id)}
          >
            {c.id}
          </button>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: CueStatus }) {
  return (
    <span className="status-badge" style={{ background: CUE_STATUS_COLOR[status] }}>
      {CUE_STATUS_LABEL[status]}
    </span>
  );
}

// ---------- Cue 列表 ----------

function CueList({
  state,
  onReplace,
}: {
  state: AppState;
  onReplace: (cue: Cue) => void;
}) {
  const cues = selectVisibleCues(state);
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>Cue 触发顺序</p>
          <h2>Cue 列表</h2>
        </div>
      </div>
      <div className="cue-list">
        {cues.length === 0 && <p className="empty">当前筛选下没有 Cue。</p>}
        {cues.map((cue) => {
          const status = cueStatus(state, cue);
          const pending = cuePendingEntries(state, cue);
          const displaced = cueDisplacedEntries(cue);
          return (
            <article key={cue.id} className={"cue-card cue-" + status}>
              <div className="cue-main">
                <div className="cue-title">
                  <b>{cue.order}</b>
                  <div>
                    <h3>{cue.id} · {cue.name}</h3>
                    <small>场景：{cue.scene} · {cue.entries.length} 个灯位（顺序/场景保持原样）</small>
                  </div>
                </div>
                <StatusBadge status={status} />
              </div>
              <div className="cue-entries">
                {cue.entries.map((entry) => (
                  <EntryPill key={entry.originalId} state={state} entry={entry} />
                ))}
              </div>
              {status === "pending" && (
                <div className="cue-action pending-bar">
                  <span>
                    待处理：{pending.map((e) => e.originalId).join("、")} 故障，需选择合格替补（未参与本 Cue · 色片相同 · 焦点同区）
                  </span>
                  <button className="primary" onClick={() => onReplace(cue)}>
                    安排替补
                  </button>
                </div>
              )}
              {status === "substituting" && (
                <div className="cue-action substituting-bar">
                  <span>
                    替补中：{displaced.map((e) => `${e.fixtureId} 接替 ${e.originalId}`).join("；")}。原灯恢复并确认后才回切。
                  </span>
                </div>
              )}
              {state.currentCueId !== cue.id && (
                <button className="inline-link" onClick={() => setCurrentCue(cue.id)}>
                  设为当前场景
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EntryPill({ state, entry }: { state: AppState; entry: CueFixtureEntry }) {
  const f = entryFixture(state, entry);
  const displaced = isEntryDisplaced(entry);
  const faulty = f && f.status !== "normal" && !displaced;
  const original = fixtureById(state, entry.originalId);
  return (
    <span className={"entry-pill" + (displaced ? " entry-sub" : "") + (faulty ? " entry-fault" : "")}>
      <i className="gel-dot" style={{ background: f ? gelColor(f.gel) : "#475569" }} />
      {displaced ? (
        <>
          <strong>{entry.fixtureId}</strong>
          <em>接替 {entry.originalId}</em>
        </>
      ) : (
        <strong>{entry.fixtureId}</strong>
      )}
      <em>
        CH{f?.channel ?? "?"} · {f?.gel} · {f?.zone} · {entry.brightness}%
      </em>
      {displaced && original && (
        <em className="pill-status">原灯：{EFFECTIVE_STATUS_LABEL[effectiveStatus(state, original)]}</em>
      )}
    </span>
  );
}

// ---------- 换灯弹窗（整批提交，任一不合格即整次拒绝） ----------

function SubstitutionDialog({
  state,
  cue,
  onClose,
}: {
  state: AppState;
  cue: Cue;
  onClose: () => void;
}) {
  const pending = useMemo(() => cuePendingEntries(state, cue), [state, cue]);
  const eligibleMap = useMemo(() => {
    const m: Record<string, Fixture[]> = {};
    for (const entry of pending) {
      const original = fixtureById(state, entry.originalId);
      if (original) m[entry.originalId] = findEligibleReplacements(state, cue, original);
    }
    return m;
  }, [state, cue, pending]);

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const entry of pending) {
      const list = eligibleMap[entry.originalId];
      if (list && list.length > 0) init[entry.originalId] = list[0].id;
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  if (pending.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{cue.id} 没有待处理灯位</h3>
          <div className="btn-row">
            <button className="primary" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = () => {
    const result = submitSubstitution(cue.id, selections);
    if (result.ok) {
      onClose();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>安排替补 · {cue.id}</p>
            <h3>{cue.name}（{cue.scene}）</h3>
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <p className="rule-note">
          替补条件：未参与该 Cue、色片相同、焦点同区。所有待处理灯位都选到合格替补才能提交，否则整次拒绝、不改动任何灯位。
        </p>
        {error && <div className="reject-banner">整次拒绝：{error}</div>}
        <div className="replace-rows">
          {pending.map((entry) => {
            const original = fixtureById(state, entry.originalId)!;
            const choice = selections[entry.originalId];
            const choiceFixture = choice ? fixtureById(state, choice) : undefined;
            const check: { ok: boolean; reason?: keyof typeof INELIGIBLE_REASON_TEXT | "missing" } =
              choiceFixture
                ? eligibleReplacement(state, cue, original, choiceFixture)
                : { ok: false, reason: "missing" };
            return (
              <div key={entry.originalId} className="replace-row">
                <div className="replace-original">
                  <strong>{original.id}</strong>
                  <small>
                    CH{original.channel} · {original.type} · {original.gel} · 焦点{original.zone}
                  </small>
                  <small className="fault-text">故障待替换</small>
                </div>
                <span className="replace-arrow">→</span>
                <div className="replace-choice">
                  <select
                    value={choice ?? ""}
                    onChange={(e) =>
                      setSelections((s) => ({ ...s, [original.id]: e.target.value }))
                    }
                  >
                    <option value="" disabled>
                      选择替补灯具…
                    </option>
                    {state.fixtures.map((candidate) => {
                      const r = eligibleReplacement(state, cue, original, candidate);
                      return (
                        <option key={candidate.id} value={candidate.id} disabled={!r.ok}>
                          {candidate.id}
                          {r.ok ? "（合格）" : `（不可：${candidate.gel !== original.gel ? "色片不同" : candidate.zone !== original.zone ? "焦点不同区" : "已参与本Cue或不可用"}）`}
                        </option>
                      );
                    })}
                  </select>
                  {choiceFixture && check.ok ? (
                    <small className="ok-text">
                      ✓ 合格：未参与本 Cue · 色片 {choiceFixture.gel} 相同 · 焦点 {choiceFixture.zone} 同区
                    </small>
                  ) : (
                    <small className="fault-text">
                      ✗ {choice && check.reason && check.reason !== "missing"
                        ? INELIGIBLE_REASON_TEXT[check.reason]
                        : "请选择合格替补灯具"}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="btn-row end">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={handleSubmit}>
            整批提交换灯
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 灯具清单 + 维修记录 ----------

const ACTION_LABEL: Record<string, string> = {
  faultReported: "报修",
  substituted: "替补/接替",
  rejected: "换灯被拒",
  repaired: "维修完成",
  switchedBack: "确认回切",
};

function FixturePanel({
  state,
  selectedId,
  onSelect,
}: {
  state: AppState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const fixtures = selectVisibleFixtures(state);
  const [faultDetail, setFaultDetail] = useState("");
  const [repairDetail, setRepairDetail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const selected = selectedId ? state.fixtures.find((f) => f.id === selectedId) : undefined;

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>灯具清单与维修闭环</p>
          <h2>灯具档案</h2>
        </div>
        {notice && <span className="notice">{notice}</span>}
      </div>
      <div className="fixture-grid">
        <div className="fixture-rows">
          {fixtures.length === 0 && <p className="empty">当前筛选下没有灯具。</p>}
          {fixtures.map((f) => {
            const status = effectiveStatus(state, f);
            return (
              <button
                key={f.id}
                className={"fixture-row" + (selectedId === f.id ? " fixture-row-on" : "")}
                onClick={() => onSelect(f.id)}
              >
                <i className="gel-dot" style={{ background: gelColor(f.gel) }} />
                <strong>{f.id}</strong>
                <em>CH{f.channel} · {f.type}</em>
                <em>{f.gel} · {f.zone}</em>
                <span className="mini-badge" style={{ background: STATUS_COLOR[status] }}>
                  {EFFECTIVE_STATUS_LABEL[status]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="fixture-detail">
          {!selected && <p className="empty">点击灯具查看档案、报修或确认回切。</p>}
          {selected && (
            <FixtureDetail
              key={selected.id}
              state={state}
              fixture={selected}
              faultDetail={faultDetail}
              repairDetail={repairDetail}
              setFaultDetail={setFaultDetail}
              setRepairDetail={setRepairDetail}
              flash={flash}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function FixtureDetail({
  state,
  fixture,
  faultDetail,
  repairDetail,
  setFaultDetail,
  setRepairDetail,
  flash,
}: {
  state: AppState;
  fixture: Fixture;
  faultDetail: string;
  repairDetail: string;
  setFaultDetail: (v: string) => void;
  setRepairDetail: (v: string) => void;
  flash: (msg: string) => void;
}) {
  const status = effectiveStatus(state, fixture);
  const records = state.records.filter((r) => r.fixtureId === fixture.id).reverse();
  const referencedCues = state.cues.filter((c) =>
    c.entries.some((e) => e.originalId === fixture.id),
  );

  return (
    <div className="detail-body">
      <div className="detail-head">
        <h3>{fixture.id}</h3>
        <span className="status-badge" style={{ background: STATUS_COLOR[status] }}>
          {EFFECTIVE_STATUS_LABEL[status]}
        </span>
      </div>
      <dl className="detail-meta">
        <div><dt>通道</dt><dd>CH {fixture.channel}</dd></div>
        <div><dt>类型</dt><dd>{fixture.type}</dd></div>
        <div><dt>色片</dt><dd>{fixture.gel}</dd></div>
        <div><dt>焦点</dt><dd>{fixture.zone}</dd></div>
        <div><dt>灯位</dt><dd>{fixture.x}%, {fixture.y}%（固定）</dd></div>
        <div><dt>引用 Cue</dt><dd>{referencedCues.map((c) => c.id).join("、") || "无"}</dd></div>
      </dl>

      {status === "normal" && (
        <div className="action-box">
          <input
            placeholder="故障现象（选填，如：通道无输出）"
            value={faultDetail}
            onChange={(e) => setFaultDetail(e.target.value)}
          />
          <button
            className="danger"
            onClick={() => {
              const r = reportFixtureFault(fixture.id, faultDetail);
              flash(r.message);
              setFaultDetail("");
            }}
          >
            报修（引用 Cue 进入待替换）
          </button>
        </div>
      )}

      {fixture.status === "faulty" && (
        <div className="action-box">
          <input
            placeholder="维修说明（选填）"
            value={repairDetail}
            onChange={(e) => setRepairDetail(e.target.value)}
          />
          <button
            onClick={() => {
              const r = markFixtureRepaired(fixture.id, repairDetail);
              flash(r.message);
              setRepairDetail("");
            }}
          >
            登记维修完成
          </button>
          <p className="hint">维修完成后灯具进入"已恢复·待确认"，不会自动回切。</p>
        </div>
      )}

      {fixture.status === "restoredPending" && (
        <div className="action-box">
          <button
            className="primary"
            onClick={() => flash(confirmSwitchback(fixture.id).message)}
          >
            确认回切到原灯位
          </button>
          <p className="hint">确认后所有替补灯位切回原灯，替补灯具退场，Cue 恢复正常。</p>
        </div>
      )}

      <div className="records-box">
        <h4>维修记录（{records.length}）</h4>
        {records.length === 0 && <p className="empty">暂无记录。</p>}
        <ul>
          {records.map((r) => (
            <li key={r.id}>
              <span className="rec-tag">{ACTION_LABEL[r.action] ?? r.action}</span>
              <span>{r.detail}</span>
              <small>{r.at}{r.cueIds?.length ? ` · ${r.cueIds.join("、")}` : ""}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- 顶层组装（界面模块只负责渲染与交互编排） ----------

export default function Workspace() {
  const state = useAppState();
  const [selectedId, setSelectedId] = useState<string | null>("SL-01");
  const [replacingCue, setReplacingCue] = useState<Cue | null>(null);

  // 弹窗始终渲染当前存档里的同一 Cue，保证提交判定拿到最新状态
  const liveReplacing = replacingCue ? state.cues.find((c) => c.id === replacingCue.id) ?? null : null;

  return (
    <main className="app">
      <Hero state={state} />
      <div className="workspace">
        <FilterPanel state={state} />
        <div className="main-col">
          <StageMap state={state} selectedId={selectedId} onSelect={setSelectedId} />
          <ScenePreview state={state} />
        </div>
      </div>
      <div className="lower-grid">
        <CueList state={state} onReplace={setReplacingCue} />
        <FixturePanel state={state} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      {liveReplacing && (
        <SubstitutionDialog state={state} cue={liveReplacing} onClose={() => setReplacingCue(null)} />
      )}
    </main>
  );
}
