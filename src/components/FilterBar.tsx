import { FIXTURE_TYPES, FOCUS_ZONES } from "../lighting/seed";
import type { TypeFilter, CueStatusFilter } from "../lighting/rules";
import { CUE_STATUS_TEXT } from "../lighting/labels";

interface FilterBarProps {
  typeFilter: TypeFilter;
  onTypeFilter: (value: TypeFilter) => void;
  cueStatusFilter: CueStatusFilter;
  onCueStatusFilter: (value: CueStatusFilter) => void;
}

const CUE_FILTERS: CueStatusFilter[] = [
  "全部",
  "pending",
  "awaitingReturn",
  "replaced",
  "normal",
];

/** 灯具筛选：灯光类型 + Cue 业务状态，结果同步到 Cue 列表与舞台图 */
export function FilterBar({
  typeFilter,
  onTypeFilter,
  cueStatusFilter,
  onCueStatusFilter,
}: FilterBarProps) {
  return (
    <aside className="panel filter-panel">
      <h2>灯具筛选</h2>

      <p className="filter-group-label">灯光类型</p>
      <div className="chips">
        {(["全部", ...FIXTURE_TYPES] as TypeFilter[]).map((item) => (
          <button
            key={item}
            className={typeFilter === item ? "chip active" : "chip"}
            onClick={() => onTypeFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <p className="filter-group-label">Cue 业务状态</p>
      <div className="chips">
        {CUE_FILTERS.map((item) => (
          <button
            key={item}
            className={cueStatusFilter === item ? "chip active" : "chip"}
            onClick={() => onCueStatusFilter(item)}
          >
            {item === "全部" ? "全部状态" : CUE_STATUS_TEXT[item]}
          </button>
        ))}
      </div>

      <p className="filter-group-label">焦点分区图例</p>
      <ul className="zone-legend">
        {FOCUS_ZONES.map((zone) => (
          <li key={zone.id}>
            <span className="zone-dot" style={{ left: zone.x / 4, top: zone.y / 4 }} />
            {zone.label}
          </li>
        ))}
      </ul>
      <p className="filter-hint">筛选结果在 Cue 列表、舞台图与当前场景预览中同步。</p>
    </aside>
  );
}
