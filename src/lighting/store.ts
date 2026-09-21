import { useSyncExternalStore } from "react";
import type {
  AppState,
  Cue,
  CueFixtureEntry,
  CueStatus,
  EffectiveFixtureStatus,
  Filters,
  Fixture,
  FixtureType,
  MaintenanceAction,
  MaintenanceRecord,
} from "./types";
import { SEED_STATE } from "./seed";
import { cueStatus, effectiveStatus, fixtureById, validateSubstitution } from "./rules";

// 业务状态模块：故障换灯闭环的全部状态流转 + localStorage 本地存档。
// 结构（灯位、顺序、场景）永不修改，只切换灯位上当前的灯具。

const STORAGE_KEY = "lighting-cue-archive-v1";

function nowText(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function rid(): string {
  return "rec-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === 1 && Array.isArray(parsed.fixtures) && Array.isArray(parsed.cues)) {
        return parsed;
      }
    }
  } catch {
    // 存档损坏时回落到种子数据
  }
  return structuredClone(SEED_STATE);
}

let state: AppState = load();
const listeners = new Set<() => void>();

function persist(next: AppState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 存储不可用时仅保留内存状态
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}

function addRecord(
  records: MaintenanceRecord[],
  fixtureId: string,
  action: MaintenanceAction,
  detail: string,
  cueIds?: string[],
): MaintenanceRecord[] {
  return [...records, { id: rid(), fixtureId, action, at: nowText(), detail, cueIds }];
}

// ---------- 动作 ----------

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** 灯具报修：引用它的 Cue 自动进入待替换；灯位、顺序、场景不变 */
export function reportFixtureFault(fixtureId: string, detail: string): ActionResult {
  const fixture = fixtureById(state, fixtureId);
  if (!fixture) return { ok: false, message: "灯具不存在" };
  if (fixture.status === "faulty") return { ok: false, message: "该灯具已处于故障状态" };
  if (effectiveStatus(state, fixture) === "substituting") {
    return { ok: false, message: "该灯具正在替补中，需先完成回切" };
  }

  const affectedCueIds = state.cues
    .filter((cue) => cue.entries.some((e) => e.originalId === fixtureId && e.fixtureId === fixtureId))
    .map((c) => c.id);

  const fixtures = state.fixtures.map((f) =>
    f.id === fixtureId ? { ...f, status: "faulty" as const } : f,
  );
  const records = addRecord(
    state.records,
    fixtureId,
    "faultReported",
    detail.trim() || "现场报修",
    affectedCueIds,
  );
  persist({ ...state, fixtures, records });
  return {
    ok: true,
    message:
      affectedCueIds.length > 0
        ? `已报修，${affectedCueIds.join("、")} 进入待替换`
        : "已报修，当前没有 Cue 引用该灯具",
  };
}

/**
 * 提交换灯：所有待处理灯位必须选到合格替补，否则整次拒绝、不做任何改动。
 */
export function submitSubstitution(
  cueId: string,
  selections: Record<string, string>,
): ActionResult {
  const cue = state.cues.find((c) => c.id === cueId);
  if (!cue) return { ok: false, message: "Cue 不存在" };

  const result = validateSubstitution(state, cue, selections);
  if (!result.ok) {
    // 拒绝也留痕：便于在维修记录里复盘
    let records = state.records;
    for (const failure of result.failures) {
      const reasonText =
        failure.reason === "missing"
          ? "未选择替补"
          : `${failure.candidate?.id ?? ""}不满足条件（${failure.reason}）`;
      records = addRecord(
        records,
        failure.original.id,
        "rejected",
        `${cue.id} 换灯被整次拒绝：${reasonText}`,
        [cue.id],
      );
    }
    persist({ ...state, records });
    return {
      ok: false,
      message:
        "整次拒绝：存在不合格或未选择的替补（要求未参与该 Cue、色片相同、焦点同区），未改动任何灯位",
    };
  }

  // 全部合格才一次性切换：只改 fixtureId，originalId/亮度/顺序/场景原样
  const cues = state.cues.map((c): Cue => {
    if (c.id !== cueId) return c;
    return {
      ...c,
      entries: c.entries.map((entry: CueFixtureEntry): CueFixtureEntry => {
        const replacement = selections[entry.originalId];
        return replacement ? { ...entry, fixtureId: replacement } : entry;
      }),
    };
  });

  // 替补灯具保留维修记录（原灯、替补灯各一条）
  let records = state.records;
  for (const [originalId, substituteId] of Object.entries(selections)) {
    const original = fixtureById(state, originalId);
    const substitute = fixtureById(state, substituteId);
    records = addRecord(
      records,
      originalId,
      "substituted",
      `故障待修，${cue.id} 灯位由 ${substituteId} 接替（色片${substitute?.gel ?? "?"}/${substitute?.zone ?? "?"}，亮度顺序不变）`,
      [cueId],
    );
    records = addRecord(
      records,
      substituteId,
      "substituted",
      `接替 ${originalId}：${cue.id}（${original?.type ?? ""}灯位，色片/焦点一致）`,
      [cueId],
    );
  }

  persist({ ...state, cues, records });
  return { ok: true, message: `换灯完成：${cue.id} 已由替补灯具接替，灯位与顺序保持原样` };
}

/** 维修完成：原灯进入"已恢复·待确认"，不会自动回切 */
export function markFixtureRepaired(fixtureId: string, detail: string): ActionResult {
  const fixture = fixtureById(state, fixtureId);
  if (!fixture) return { ok: false, message: "灯具不存在" };
  if (fixture.status !== "faulty") return { ok: false, message: "仅故障灯具可登记维修完成" };

  const fixtures = state.fixtures.map((f) =>
    f.id === fixtureId ? { ...f, status: "restoredPending" as const } : f,
  );
  const records = addRecord(
    state.records,
    fixtureId,
    "repaired",
    detail.trim() || "维修完成，等待灯光师确认回切",
  );
  persist({ ...state, fixtures, records });
  return { ok: true, message: `${fixtureId} 已恢复，确认后才可回切到原灯位` };
}

/**
 * 确认回切：原灯恢复后须人工确认。把该灯所有"替补中"灯位切回原灯，
 * 并解除替补占用；无替补灯位时仅解除待确认状态。
 */
export function confirmSwitchback(fixtureId: string): ActionResult {
  const fixture = fixtureById(state, fixtureId);
  if (!fixture) return { ok: false, message: "灯具不存在" };
  if (fixture.status !== "restoredPending") {
    return { ok: false, message: "只有已恢复待确认的灯具可以回切" };
  }

  const switchedCueIds: string[] = [];
  const cues = state.cues.map((cue): Cue => {
    const involved = cue.entries.some(
      (e) => e.originalId === fixtureId && e.fixtureId !== fixtureId,
    );
    if (!involved) return cue;
    switchedCueIds.push(cue.id);
    return {
      ...cue,
      entries: cue.entries.map((e) =>
        e.originalId === fixtureId && e.fixtureId !== fixtureId
          ? { ...e, fixtureId: e.originalId }
          : e,
      ),
    };
  });

  const fixtures = state.fixtures.map((f) =>
    f.id === fixtureId ? { ...f, status: "normal" as const } : f,
  );

  const detail =
    switchedCueIds.length > 0
      ? `确认回切：${switchedCueIds.join("、")} 恢复使用原灯，替补退场`
      : "确认恢复正常（无替补灯位需要回切）";
  const records = addRecord(state.records, fixtureId, "switchedBack", detail, switchedCueIds);

  persist({ ...state, cues, fixtures, records });
  return { ok: true, message: switchedCueIds.length > 0 ? detail : `${fixtureId} 已恢复正常` };
}

// ---------- 演出信息 / 筛选 / 当前场景 ----------

export function updateShowInfo(patch: Partial<Pick<AppState, "showName" | "versionNote">>): void {
  persist({ ...state, ...patch });
}

export function setCurrentCue(cueId: string): void {
  persist({ ...state, currentCueId: cueId });
}

export function toggleTypeFilter(type: FixtureType): void {
  const types = state.filters.fixtures.types;
  const nextTypes = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
  setFilters({ ...state.filters, fixtures: { ...state.filters.fixtures, types: nextTypes } });
}

export function setFixtureStatusFilter(value: EffectiveFixtureStatus | "all"): void {
  setFilters({ ...state.filters, fixtures: { ...state.filters.fixtures, fixtureStatus: value } });
}

export function setCueStatusFilter(value: CueStatus | "all"): void {
  setFilters({ ...state.filters, cueStatus: value });
}

function setFilters(filters: Filters): void {
  persist({ ...state, filters });
}

export function resetDemo(): void {
  persist(structuredClone(SEED_STATE));
}

/** 本地存档 JSON 导出（与 localStorage 内容一致） */
export function exportArchive(): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lighting-cue-archive-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 供界面直接读取的便捷选择器
export function selectCueStatus(cue: Cue): CueStatus {
  return cueStatus(state, cue);
}

export function selectFixture(fixtureId: string): Fixture | undefined {
  return fixtureById(state, fixtureId);
}
