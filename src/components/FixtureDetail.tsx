import { useState } from "react";
import { FOCUS_ZONES, gelColor } from "../lighting/seed";
import {
  activeSubstitutions,
  cueStatus,
  cuesReferencingFixture,
  cuesUsingFixture,
} from "../lighting/rules";
import { useStore } from "../lighting/store";
import { ACTION_TEXT, CUE_STATUS_TEXT, FIXTURE_STATUS_TEXT, formatTime } from "../lighting/labels";
import type { MaintenanceRecord } from "../lighting/types";

interface FixtureDetailProps {
  fixtureId: string | null;
  onClose: () => void;
}

const ZONE_LABELS: Record<string, string> = Object.fromEntries(
  FOCUS_ZONES.map((zone) => [zone.id, zone.label]),
);

/** 灯具详情：故障闭环操作入口 + 替补/被替关系 + 维修记录（替补灯具同样保留记录） */
export function FixtureDetail({ fixtureId, onClose }: FixtureDetailProps) {
  const { state, reportFault, repairFixture, confirmReturn } = useStore();
  const [reason, setReason] = useState("");
  if (!fixtureId) return null;

  const fixture = state.fixtures.find((item) => item.id === fixtureId);
  if (!fixture) return null;

  // 作为原灯被替：originalId -> 替补
  const replacedIn = state.cues
    .map((cue) => ({ cue, sub: cue.substitutions[fixture.id] }))
    .filter((item): item is { cue: NonNullable<typeof item.cue>; sub: string } => Boolean(item.sub));
  // 作为替补登场
  const standingInFor = state.cues
    .flatMap((cue) =>
      activeSubstitutions(cue)
        .filter((s) => s.substituteId === fixture.id)
        .map((s) => ({ cue, originalId: s.originalId })),
    );

  const referencedCues = cuesReferencingFixture(state, fixture.id);
  const usingCues = cuesUsingFixture(state, fixture.id);

  const relatedRecords = state.records
    .filter((record) => record.originalId === fixture.id || record.substituteId === fixture.id)
    .sort((a, b) => b.at - a.at);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>{fixture.type} · CH {fixture.channel}</p>
            <h2>
              <i className="gel-swatch" style={{ background: gelColor(fixture.gel) }} />
              {fixture.id}
              <span className={`status-tag ${fixture.status}`}>
                {FIXTURE_STATUS_TEXT[fixture.status]}
              </span>
            </h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>

        <div className="detail-grid">
          <div>
            <dl className="detail-list">
              <dt>色片</dt>
              <dd>{fixture.gelLabel}（{fixture.gel}）</dd>
              <dt>焦点分区</dt>
              <dd>{ZONE_LABELS[fixture.zoneId] ?? fixture.zoneId}</dd>
              <dt>灯位坐标</dt>
              <dd>X {fixture.x} / Y {fixture.y}（接替不移动）</dd>
              <dt>设计引用</dt>
              <dd>
                {referencedCues.length === 0 && <span className="muted">无</span>}
                {referencedCues.map((cue) => (
                  <span key={cue.id} className="sub-chip">
                    {cue.id}（{CUE_STATUS_TEXT[cueStatus(state, cue)]}）
                  </span>
                ))}
              </dd>
              <dt>实际登场</dt>
              <dd>
                {usingCues.length === 0 && <span className="muted">无</span>}
                {usingCues.map((cue) => (
                  <span key={cue.id} className="sub-chip">{cue.id}</span>
                ))}
              </dd>
              {fixture.faultReason && (
                <>
                  <dt>故障现象</dt>
                  <dd className="fault-text">{fixture.faultReason}</dd>
                </>
              )}
            </dl>

            <div className="action-box">
              {fixture.status === "normal" && (
                <>
                  <input
                    placeholder="故障现象，如：触发不亮 / 色温漂移"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    className="danger"
                    onClick={() => {
                      reportFault(fixture.id, reason);
                      setReason("");
                    }}
                  >
                    报故障，引用 Cue 转待替换
                  </button>
                </>
              )}
              {fixture.status === "faulted" && (
                <button className="primary" onClick={() => repairFixture(fixture.id)}>
                  标记维修完成（进入待确认回切）
                </button>
              )}
              {fixture.status === "awaitingReturn" && (
                <button className="primary" onClick={() => confirmReturn(fixture.id)}>
                  确认回切原灯，撤下替补
                </button>
              )}
            </div>
          </div>

          <div className="record-col">
            <h3>替补关系</h3>
            {replacedIn.length === 0 && standingInFor.length === 0 && (
              <p className="muted small">当前没有替补关系。</p>
            )}
            {replacedIn.map(({ cue, sub }) => (
              <p key={cue.id} className="relation-line">
                在 {cue.id} 中由 <b>{sub}</b> 接替
              </p>
            ))}
            {standingInFor.map(({ cue, originalId }) => (
              <p key={cue.id} className="relation-line">
                作为替补在 {cue.id} 接替 <b>{originalId}</b>
              </p>
            ))}

            <h3>维修记录</h3>
            <ul className="record-list">
              {relatedRecords.length === 0 && <p className="muted small">暂无记录。</p>}
              {relatedRecords.map((record: MaintenanceRecord) => (
                <li key={record.id} className={`record-item ${record.action}`}>
                  <div className="record-head">
                    <span className={`record-action ${record.action}`}>
                      {ACTION_TEXT[record.action]}
                    </span>
                    <span className="muted small">{formatTime(record.at)}</span>
                  </div>
                  <p>{record.detail}</p>
                  <p className="muted small">
                    Cue：{record.cueIds.length > 0 ? record.cueIds.join("、") : "—"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
