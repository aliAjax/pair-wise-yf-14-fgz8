// 业务领域类型：灯具、Cue、维修记录
// 灯位、触发顺序、场景在 Cue 中固定保存，替换只改灯位当前指向的灯具，不改结构。

export type FixtureType = "面光" | "侧光" | "逆光" | "效果光";

export type Zone = "台口" | "前场区" | "中区" | "后区" | "侧台";

/** 存档内的灯具状态；substituting 由 Cue 引用派生，见 rules.effectiveStatus */
export type StoredFixtureStatus = "normal" | "faulty" | "restoredPending";

export type EffectiveFixtureStatus =
  | StoredFixtureStatus
  | "substituting";

export interface Fixture {
  id: string;
  channel: number;
  type: FixtureType;
  gel: string;
  zone: Zone;
  /** 舞台图坐标（百分比 0-100），灯位固定 */
  x: number;
  y: number;
  status: StoredFixtureStatus;
}

/** 一个灯位：originalId 永不变（灯位/顺序保持原样），fixtureId 是当前顶上的灯具 */
export interface CueFixtureEntry {
  originalId: string;
  fixtureId: string;
  brightness: number;
}

export interface Cue {
  id: string;
  name: string;
  order: number;
  scene: string;
  entries: CueFixtureEntry[];
}

export type CueStatus = "normal" | "pending" | "substituting";

export type MaintenanceAction =
  | "faultReported"
  | "substituted"
  | "rejected"
  | "repaired"
  | "switchedBack";

export interface MaintenanceRecord {
  id: string;
  fixtureId: string;
  action: MaintenanceAction;
  at: string;
  detail: string;
  cueIds?: string[];
}

export interface FixtureFilters {
  types: FixtureType[];
  fixtureStatus: "all" | EffectiveFixtureStatus;
}

export interface Filters {
  fixtures: FixtureFilters;
  cueStatus: "all" | CueStatus;
}

export interface AppState {
  version: 1;
  showName: string;
  versionNote: string;
  fixtures: Fixture[];
  cues: Cue[];
  records: MaintenanceRecord[];
  currentCueId: string;
  filters: Filters;
}
