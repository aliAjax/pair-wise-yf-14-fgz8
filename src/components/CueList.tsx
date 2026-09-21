import { useMemo, useState } from "react";
import type { Cue } from "../lighting/types";
import {
  activeSubstitutions,
  cueStatus,
  effectiveFixtureId,
  explainIneligible,
  faultSlotPlans,
  filterCues,
  getFixture,
  isFullyResolvable,
  validateProposal,
  type CueStatusFilter,
} from "../lighting/rules";
import { FOCUS_ZONES, gelColor } from "../lighting/seed";
import { useStore } from "../lighting/store";
import { CUE_STATUS_TEXT, FIXTURE_STATUS_TEXT } from "../lighting/labels";

/** 焦点分区 id -> 标签 */
const ZONE_LABELS: Record<string, string> = Object.fromEntries(
  FOCUS_ZONES.map((zone) => [zone.id, zone.label]),
);
const zoneLabel = (zoneId: string) => ZONE_LABELS[zoneId] ?? zoneId;

interface CueListProps {
  cueStatusFilter: CueStatusFilter;
  onOpenFixture: (id: string) => void;
}

export function CueList({ cueStatusFilter, onOpenFixture }: CueListProps) {
  const { state, setCurrentCue } = useStore();
  const [dialogCueId, setDialogCueId] = useState<string | null>(null);

  const cues = useMemo(() => filterCues(state, cueStatusFilter), [state, cueStatusFilter]);
  const dialogCue = dialogCueId ? state.cues.find((cue) => cue.id === dialogCueId) ?? null : null;

  return (
    <section className="panel cue-panel">
      <div className="heading">
        <div>
          <p>Cue 列表</p>
          <h2>触发顺序与待处理</h2>
        </div>
        <span className="muted">顺序、场景固定，故障仅换光源</span>
      </div>

      <div className="cue-cards">
        {cues.length === 0 && <p className="empty-hint">当前筛选下没有 Cue。</p>}
        {cues.map((cue) => {
          const status = cueStatus(state, cue);
          const isCurrent = state.currentCueId === cue.id;
          const subs = activeSubstitutions(cue);
          return (
            <article key={cue.id} className={`cue-card ${status} ${isCurrent ? "current" : ""}`}>
              <div className="cue-card-head">
                <button className="cue-title" title="设为当前场景" onClick={() => setCurrentCue(cue.id)}>
                  <b>{cue.id}</b>
                  <span>{cue.name}</span>
                  {isCurrent && <em className="current-flag">当前场景</em>}
                </button>
                <div className="cue-card-meta">
                  <span className="cue-order">#{cue.order}</span>
                  <span className={`cue-badge ${status}`}>{CUE_STATUS_TEXT[status]}</span>
                </div>
              </div>

              <p className="cue-scene">场景：{cue.scene}</p>
              {cue.note && <p className="cue-note">备注：{cue.note}</p>}

              <ul className="cue-fixtures">
                {cue.entries.map((entry) => {
                  const original = getFixture(state, entry.fixtureId);
                  const activeId = effectiveFixtureId(cue, entry);
                  const active = getFixture(state, activeId);
                  const isSub = activeId !== entry.fixtureId;
                  return (
                    <li key={entry.fixtureId} className={active?.status === "faulted" ? "fault-line" : ""}>
                      <i className="gel-swatch" style={{ background: gelColor(original?.gel ?? "") }} />
                      <button className="fixture-link" onClick={() => onOpenFixture(entry.fixtureId)}>
                        {entry.fixtureId}
                      </button>
                      <span className="muted">CH {original?.channel ?? "-"}</span>
                      <span>{original?.gelLabel}（{original?.gel}）</span>
                      <span>{entry.brightness}%</span>
                      {isSub && (
                        <span className="sub-pill">
                          → 替补
                          <button className="fixture-link sub" onClick={() => onOpenFixture(activeId)}>
                            {activeId}
                          </button>
                        </span>
                      )}
                      {active?.status === "faulted" && <span className="fault-flag">故障 · 待处理</span>}
                      {active?.status === "awaitingReturn" && (
                        <span className="return-flag">{FIXTURE_STATUS_TEXT.awaitingReturn}</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {subs.length > 0 && (
                <p className="sub-summary">
                  替补中 {subs.length} 路：
                  {subs.map(({ originalId, substituteId }) => (
                    <span key={originalId} className="sub-chip">
                      {originalId} ⇒ {substituteId}
                    </span>
                  ))}
                </p>
              )}

              {status === "pending" && (
                <div className="cue-actions">
                  <span className={isFullyResolvable(state, cue) ? "persist-hint" : "persist-hint danger"}>
                    {isFullyResolvable(state, cue)
                      ? "待处理：每个故障槽位均有合格替补"
                      : "待处理：存在无合格替补的槽位，整次换灯将被拒绝"}
                  </span>
                  <button className="primary small" onClick={() => setDialogCueId(cue.id)}>
                    处理替补
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {dialogCue && <ReplacementDialog cue={dialogCue} onClose={() => setDialogCueId(null)} />}
    </section>
  );
}

function ReplacementDialog({ cue, onClose }: { cue: Cue; onClose: () => void }) {
  const { state, replaceInCue, rejectCue } = useStore();
  const plans = faultSlotPlans(state, cue);
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    // 默认预选每个槽位的第一个合格替补，但灯光师必须显式确认才生效
    const initial: Record<string, string> = {};
    for (const slot of plans) if (slot.options[0]) initial[slot.entry.fixtureId] = slot.options[0].id;
    return initial;
  });
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rejects = validateProposal(state, cue, { picks });
  const canSubmit = plans.length > 0 && rejects.length === 0;

  const submit = () => {
    const ok = replaceInCue(cue.id, { picks });
    if (ok) onClose();
    else setError("整次换灯未通过资格校验，已全部拒绝写入。");
  };

  const rejectAll = () => {
    rejectCue(cue.id, rejectReason.trim() || "灯光师判定本次不换灯");
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>{cue.id} · {cue.scene}</p>
            <h2>整次替补判定</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>

        <p className="rule-note">
          替补须同时满足：未参与本 Cue（含已登场替补）、色片相同、焦点同区。
          任一槽位无合格替补则<strong>整次拒绝</strong>，灯位、顺序与场景保持原样。
        </p>

        <div className="slot-list">
          {plans.map((slot) => {
            const originalId = slot.entry.fixtureId;
            const picked = picks[originalId];
            const slotError = rejects.find((item) => item.originalId === originalId);
            const reasonText = slotError
              ? slotError.kind === "noOption"
                ? "未选择替补"
                : explainIneligible(slotError.reason)
              : null;
            return (
              <div key={originalId} className="slot-row">
                <div className="slot-original">
                  <b>{slot.faultedFixture.id}</b>
                  <span>CH {slot.faultedFixture.channel}</span>
                  <span>{slot.faultedFixture.gelLabel}（{slot.faultedFixture.gel}）</span>
                  <span className="muted">
                    {zoneLabel(slot.faultedFixture.zoneId)} · 亮度 {slot.entry.brightness}%
                  </span>
                </div>
                <div className="slot-options">
                  {slot.options.length === 0 && <span className="reject-text">无合格替补</span>}
                  <select
                    value={picked ?? ""}
                    onChange={(e) => setPicks((prev) => ({ ...prev, [originalId]: e.target.value }))}
                  >
                    <option value="" disabled>
                      {slot.options.length === 0 ? "不可接替" : "选择替补灯具…"}
                    </option>
                    {slot.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.id} · CH {option.channel} · {option.gelLabel} ·{" "}
                        {zoneLabel(option.zoneId)}
                      </option>
                    ))}
                  </select>
                  {reasonText && <span className="reject-text">{reasonText}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="persist-hint danger">{error}</p>}

        {!showReject ? (
          <div className="modal-actions">
            <button onClick={() => setShowReject(true)}>整次拒绝，保持原样</button>
            <button className="primary" disabled={!canSubmit} onClick={submit}>
              确认整次接替
            </button>
          </div>
        ) : (
          <div className="reject-box">
            <input
              placeholder="记录整次拒绝原因（如：等备件、不改变本场设计）"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={() => setShowReject(false)}>返回</button>
              <button className="danger" onClick={rejectAll}>确认拒绝并留档</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
