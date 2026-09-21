import { useStore } from "../lighting/store";
import { ACTION_TEXT, formatTime } from "../lighting/labels";

/** 维修记录总表：故障、接替、拒绝、修复、回切全流程留档 */
export function MaintenanceLog() {
  const { state } = useStore();
  const records = state.records;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>维修记录</p>
          <h2>故障换灯闭环留档</h2>
        </div>
        <span className="muted">替补灯具同样保留接替与回切记录</span>
      </div>
      {records.length === 0 ? (
        <p className="empty-hint">暂无维修记录；灯具报故障后在此形成闭环。</p>
      ) : (
        <ul className="record-timeline">
          {records.map((record) => (
            <li key={record.id} className={`record-item ${record.action}`}>
              <div className="record-head">
                <span className={`record-action ${record.action}`}>
                  {ACTION_TEXT[record.action]}
                </span>
                <strong>{record.originalId}</strong>
                {record.substituteId && <span className="muted">替补 {record.substituteId}</span>}
                <span className="muted small">{formatTime(record.at)}</span>
              </div>
              <p>{record.detail}</p>
              <p className="muted small">
                Cue：{record.cueIds.length > 0 ? record.cueIds.join("、") : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
