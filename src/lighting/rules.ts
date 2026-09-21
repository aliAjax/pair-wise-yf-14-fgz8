import type {
  AppState,
  Cue,
  CueFixtureEntry,
  CueStatus,
  EffectiveFixtureStatus,
  Fixture,
} from "./types";

// 判定模块：全部为纯函数，不含 React、不含存档。
// 换灯三条件：①未参与该 Cue ②色片相同 ③焦点同区；任一不满足即不合格。

export function fixtureById(state: AppState, id: string): Fixture | undefined {
  return state.fixtures.find((f) => f.id === id);
}

/** 灯位当前顶上的灯具 */
export function entryFixture(state: AppState, entry: CueFixtureEntry): Fixture | undefined {
  return fixtureById(state, entry.fixtureId);
}

export function isEntryDisplaced(entry: CueFixtureEntry): boolean {
  return entry.fixtureId !== entry.originalId;
}

/**
 * 有效状态：在存档状态之上叠加 substituting 派生。
 * 一台被任何 Cue 借作替补的灯具，显示为"替补中"。
 */
export function effectiveStatus(state: AppState, fixture: Fixture): EffectiveFixtureStatus {
  const usedAsSubstitute = state.cues.some((cue) =>
    cue.entries.some((e) => isEntryDisplaced(e) && e.fixtureId === fixture.id),
  );
  if (usedAsSubstitute) return "substituting";
  return fixture.status;
}

export function cueStatus(state: AppState, cue: Cue): CueStatus {
  // 有待处理故障灯位 => 待替换（持续显示，直到回切完成）
  const hasPending = cue.entries.some((entry) => {
    if (isEntryDisplaced(entry)) return false;
    const f = fixtureById(state, entry.fixtureId);
    return !!f && f.status !== "normal";
  });
  if (hasPending) return "pending";
  const hasSubstitute = cue.entries.some(isEntryDisplaced);
  return hasSubstitute ? "substituting" : "normal";
}

export const CUE_STATUS_LABEL: Record<CueStatus, string> = {
  normal: "正常",
  pending: "待替换",
  substituting: "替补中·待回切",
};

export function cuePendingEntries(state: AppState, cue: Cue): CueFixtureEntry[] {
  return cue.entries.filter((entry) => {
    if (isEntryDisplaced(entry)) return false;
    const f = fixtureById(state, entry.fixtureId);
    return !!f && f.status !== "normal";
  });
}

export function cueDisplacedEntries(cue: Cue): CueFixtureEntry[] {
  return cue.entries.filter(isEntryDisplaced);
}

/**
 * 候选替补判定：灯必须 ①不在该 Cue 的任何灯位上 ②色片相同 ③焦点同区。
 * 故障灯、已恢复待确认灯、正在替补的灯均不可用。
 */
export type IneligibleReason = "inCue" | "gel" | "zone" | "unavailable";

export function eligibleReplacement(
  state: AppState,
  cue: Cue,
  original: Fixture,
  candidate: Fixture,
): { ok: boolean; reason?: IneligibleReason } {
  const status = effectiveStatus(state, candidate);
  if (status !== "normal") return { ok: false, reason: "unavailable" };
  if (cue.entries.some((e) => e.fixtureId === candidate.id)) {
    return { ok: false, reason: "inCue" };
  }
  if (candidate.gel !== original.gel) return { ok: false, reason: "gel" };
  if (candidate.zone !== original.zone) return { ok: false, reason: "zone" };
  return { ok: true };
}

export const INELIGIBLE_REASON_TEXT: Record<IneligibleReason, string> = {
  unavailable: "灯具当前不可用（故障/待回切/替补中）",
  inCue: "已参与该 Cue",
  gel: "色片不同",
  zone: "焦点不同区",
};

export function findEligibleReplacements(
  state: AppState,
  cue: Cue,
  original: Fixture,
): Fixture[] {
  return state.fixtures.filter((c) => eligibleReplacement(state, cue, original, c).ok);
}

/**
 * 整批提交判定：全部待处理灯位都必须选了合格替补，否则整次拒绝。
 * selections: 原灯 id -> 选中的候选 id
 */
export function validateSubstitution(
  state: AppState,
  cue: Cue,
  selections: Record<string, string>,
): { ok: true } | { ok: false; failures: { original: Fixture; candidate?: Fixture; reason: IneligibleReason | "missing" }[] } {
  const pending = cuePendingEntries(state, cue);
  const failures: { original: Fixture; candidate?: Fixture; reason: IneligibleReason | "missing" }[] = [];

  for (const entry of pending) {
    const original = fixtureById(state, entry.originalId);
    if (!original) continue;
    const candidateId = selections[entry.originalId];
    if (!candidateId) {
      failures.push({ original, reason: "missing" });
      continue;
    }
    const candidate = fixtureById(state, candidateId);
    if (!candidate) {
      failures.push({ original, reason: "missing" });
      continue;
    }
    const result = eligibleReplacement(state, cue, original, candidate);
    if (!result.ok) failures.push({ original, candidate, reason: result.reason! });
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

// ---------- 筛选判定 ----------

export function selectVisibleFixtures(state: AppState): Fixture[] {
  const { types, fixtureStatus } = state.filters.fixtures;
  return state.fixtures.filter((f) => {
    if (!types.includes(f.type)) return false;
    if (fixtureStatus !== "all" && effectiveStatus(state, f) !== fixtureStatus) return false;
    return true;
  });
}

export function selectVisibleCues(state: AppState): Cue[] {
  const sorted = [...state.cues].sort((a, b) => a.order - b.order);
  if (state.filters.cueStatus === "all") return sorted;
  return sorted.filter((c) => cueStatus(state, c) === state.filters.cueStatus);
}

// ---------- 统计 ----------

export function countByStatus(state: AppState): Record<EffectiveFixtureStatus, number> {
  const counts: Record<EffectiveFixtureStatus, number> = {
    normal: 0,
    faulty: 0,
    restoredPending: 0,
    substituting: 0,
  };
  for (const f of state.fixtures) counts[effectiveStatus(state, f)]++;
  return counts;
}

export function pendingCueCount(state: AppState): number {
  return state.cues.filter((c) => cueStatus(state, c) === "pending").length;
}

export const EFFECTIVE_STATUS_LABEL: Record<EffectiveFixtureStatus, string> = {
  normal: "正常",
  faulty: "故障",
  restoredPending: "已恢复·待确认",
  substituting: "替补中",
};
