// 业务领域类型：灯具、Cue、替补关系与维修记录

export type FixtureType = "面光" | "侧光" | "逆光" | "效果光";

/** normal 正常 / faulted 故障待替换 / awaitingReturn 已修复，待人工确认回切 */
export type FixtureStatus = "normal" | "faulted" | "awaitingReturn";

export interface FocusZone {
  id: string;
  label: string;
  /** 舞台图坐标（viewBox 100 x 62） */
  x: number;
  y: number;
}

export interface Fixture {
  /** 灯具编号，如 FOH-03 */
  id: string;
  channel: number;
  type: FixtureType;
  /** 色片编号，如 L241 */
  gel: string;
  /** 色片名称，如 冷蓝 */
  gelLabel: string;
  /** 焦点所在区域 id */
  zoneId: string;
  /** 灯位坐标（接替后灯位保持原样，不移动） */
  x: number;
  y: number;
  status: FixtureStatus;
  faultReason?: string;
}

export interface CueEntry {
  /** 设计槽位指向的原灯（灯位归属始终不变） */
  fixtureId: string;
  /** 亮度预设 0-100 */
  brightness: number;
}

export interface Cue {
  /** Cue 编号，如 "Cue 18" */
  id: string;
  /** 触发顺序，越小越早 */
  order: number;
  name: string;
  scene: string;
  note?: string;
  entries: CueEntry[];
  /** 生效中的替补：原灯编号 -> 替补灯具编号（顺序与场景不变，仅换光源） */
  substitutions: Record<string, string>;
}

export type MaintenanceAction =
  | "fault" // 报故障
  | "replace" // 替补接替
  | "reject" // 整次拒绝
  | "repair" // 维修完成
  | "return"; // 确认回切

export interface MaintenanceRecord {
  id: string;
  at: number;
  action: MaintenanceAction;
  /** 原灯（槽位灯具） */
  originalId: string;
  /** 涉及的替补灯具（替补保留维修记录） */
  substituteId?: string;
  cueIds: string[];
  detail: string;
}

export interface AppState {
  showName: string;
  versionNote: string;
  currentCueId: string;
  fixtures: Fixture[];
  cues: Cue[];
  records: MaintenanceRecord[];
  savedAt: number;
}

export interface PersistShape extends AppState {
  version: 1;
}
