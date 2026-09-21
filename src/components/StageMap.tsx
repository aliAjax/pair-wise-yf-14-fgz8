import type { AppState, Fixture } from "../lighting/types";
import { FOCUS_ZONES, gelColor } from "../lighting/seed";
import { cueStatus, effectiveFixtureId } from "../lighting/rules";
import type { TypeFilter } from "../lighting/rules";
import { CUE_STATUS_TEXT } from "../lighting/labels";

interface StageMapProps {
  state: AppState;
  typeFilter: TypeFilter;
  selectedFixtureId: string | null;
  onSelectFixture: (id: string) => void;
}

/** 舞台平面灯位图：灯位固定，故障/替补以颜色与描边区分，筛选与当前 Cue 同步 */
export function StageMap({ state, typeFilter, selectedFixtureId, onSelectFixture }: StageMapProps) {
  const cue = state.cues.find((item) => item.id === state.currentCueId);
  const status = cue ? cueStatus(state, cue) : "normal";
  const zoneById = new Map(FOCUS_ZONES.map((zone) => [zone.id, zone]));

  const activeMap = new Map<string, number>();
  cue?.entries.forEach((entry) => {
    activeMap.set(effectiveFixtureId(cue, entry), entry.brightness);
  });

  const substituteIds = new Set<string>();
  state.cues.forEach((item) =>
    Object.values(item.substitutions).forEach((id) => substituteIds.add(id)),
  );

  const dimmed = (fixture: Fixture) => typeFilter !== "全部" && fixture.type !== typeFilter;

  return (
    <section className="panel stage-panel">
      <div className="heading">
        <div>
          <p>舞台平面图</p>
          <h2>灯位与焦点</h2>
        </div>
        {cue && (
          <span className={`cue-badge ${status}`}>
            {cue.id} · {CUE_STATUS_TEXT[status]}
          </span>
        )}
      </div>

      <svg className="stage-svg" viewBox="0 0 100 62" role="img" aria-label="舞台平面灯位图">
        {/* 舞台区域 */}
        <rect x="10" y="14" width="80" height="42" rx="3" className="stage-floor" />
        <line x1="10" y1="35" x2="90" y2="35" className="stage-centerline" />
        <text x="50" y="59.5" textAnchor="middle" className="stage-label">
          台口（观众席方向）
        </text>

        {/* 焦点分区 */}
        {FOCUS_ZONES.map((zone) => (
          <g key={zone.id} className="focus-zone">
            <circle cx={zone.x} cy={zone.y} r="3.4" className="zone-circle" />
            <text x={zone.x} y={zone.y + 0.9} textAnchor="middle" className="zone-initial">
              {zone.label.slice(0, 1)}
            </text>
          </g>
        ))}

        {/* 当前场景光束：从现役灯具（可能是替补）射向原槽位焦点，灯位不变 */}
        {cue?.entries.map((entry) => {
          const activeId = effectiveFixtureId(cue, entry);
          const fixture = state.fixtures.find((item) => item.id === activeId);
          if (!fixture) return null;
          const zone = zoneById.get(
            state.fixtures.find((item) => item.id === entry.fixtureId)?.zoneId ?? fixture.zoneId,
          );
          const target = zone ?? zoneById.get(fixture.zoneId)!;
          const broken = fixture.status === "faulted";
          const opacity = (entry.brightness / 100) * 0.55;
          const beamType = state.fixtures.find((item) => item.id === entry.fixtureId)?.type;
          const filteredOut = typeFilter !== "全部" && beamType !== typeFilter;
          return (
            <line
              key={`${cue.id}-${entry.fixtureId}`}
              x1={fixture.x}
              y1={fixture.y}
              x2={target.x}
              y2={target.y}
              className={broken ? "beam broken" : "beam"}
              stroke={broken ? "#ef4444" : gelColor(fixture.gel)}
              strokeOpacity={broken ? 0.8 : opacity}
              style={filteredOut ? { opacity: 0.12 } : undefined}
            />
          );
        })}

        {/* 灯具：位置固定 */}
        {state.fixtures.map((fixture) => {
          const brightness = activeMap.get(fixture.id);
          const isActive = brightness !== undefined;
          const selected = selectedFixtureId === fixture.id;
          return (
            <g
              key={fixture.id}
              className={`fixture-marker ${fixture.status} ${
                isActive ? "active" : ""
              } ${selected ? "selected" : ""} ${dimmed(fixture) ? "dimmed" : ""}`}
              onClick={() => onSelectFixture(fixture.id)}
            >
              <circle
                cx={fixture.x}
                cy={fixture.y}
                r={selected ? 3.4 : 2.7}
                className="fixture-dot"
                style={isActive ? { fill: gelColor(fixture.gel) } : undefined}
              />
              {substituteIds.has(fixture.id) && (
                <circle cx={fixture.x} cy={fixture.y} r="4.2" className="substitute-ring" />
              )}
              <text x={fixture.x} y={fixture.y - 4} textAnchor="middle" className="fixture-tag">
                {fixture.id}
              </text>
              {isActive && (
                <text x={fixture.x} y={fixture.y + 6.6} textAnchor="middle" className="brightness-tag">
                  {brightness}%
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="map-legend">
        <span><i className="legend-dot normal" />正常</span>
        <span><i className="legend-dot faulted" />故障·待替换</span>
        <span><i className="legend-dot awaitingReturn" />待确认回切</span>
        <span><i className="legend-ring" />替补灯具</span>
      </div>
    </section>
  );
}
