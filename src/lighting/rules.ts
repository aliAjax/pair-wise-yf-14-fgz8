import type { AppState, Cue, CueEntry, Fixture, FixtureType } from "./types";

// ---------------------------------------------------------------------------
// 判定模块：全部为纯函数。业务状态（store）与界面（组件）都不在这里。
// 规则：
//  1) 灯具故障后，引用它的 Cue 进入「待替换」；
//  2) 替补只有在「未参与该 Cue（含替补登场）」「色片相同」「焦点同区」时才能接替；
//  3) 任一槽位找不到合格替补，则整次拒绝，不允许部分替换；
//  4) 灯位、Cue 顺序、场景始终以原槽位为准，替补只改变光源。
// ---------------------------------------------------------------------------

export function getFixture(state: AppState, id: string): Fixture | undefined {
  return state.fixtures.find((item) => item.id === id);
}

export function getCue(state: AppState, cueId: string): Cue | undefined {
  return state.cues.find((item) => item.id === cueId);
}

/** 一个 Cue 中某槽位当前实际出光的灯具（可能是替补） */
export function effectiveFixtureId(cue: Cue, entry: CueEntry): string {
  return cue.substitutions[entry.fixtureId] ?? entry.fixtureId;
}

/** 该 Cue 中所有实际登场灯具编号（原灯未参与判定 + 替补登场判定均用它） */
export function cueParticipantIds(cue: Cue): Set<string> {
  const ids = new Set<string>();
  for (const entry of cue.entries) ids.add(effectiveFixtureId(cue, entry));
  return ids;
}

/** 已故障且尚未被替补覆盖的槽位（原灯）列表 */
export function unresolvedFaults(state: AppState, cue: Cue): CueEntry[] {
  return cue.entries.filter((entry) => {
    const active = getFixture(state, effectiveFixtureId(cue, entry));
    return active?.status === "faulted";
  });
}

/** 该 Cue 生效中的替补槽位 */
export function activeSubstitutions(cue: Cue): Array<{ originalId: string; substituteId: string }> {
  return Object.entries(cue.substitutions).map(([originalId, substituteId]) => ({
    originalId,
    substituteId,
  }));
}

export type CueStatus = "normal" | "pending" | "replaced" | "awaitingReturn";

/**
 * Cue 业务状态：
 * - pending        待替换：有故障槽位尚未处理，持续显示「待处理」
 * - awaitingReturn 待回切：替补全部在岗，且被替原灯均已修复，等人工确认
 * - replaced       替换中：替补在岗，原灯仍在维修
 * - normal         正常
 */
export function cueStatus(state: AppState, cue: Cue): CueStatus {
  if (unresolvedFaults(state, cue).length > 0) return "pending";

  const subs = activeSubstitutions(cue);
  if (subs.length === 0) return "normal";

  const ready = subs.every(({ originalId }) => {
    const original = getFixture(state, originalId);
    return original?.status === "awaitingReturn";
  });
  return ready ? "awaitingReturn" : "replaced";
}

/** 所有受某灯具影响的 Cue（作为原灯或作为现役替补） */
export function cuesUsingFixture(state: AppState, fixtureId: string): Cue[] {
  return state.cues.filter((cue) =>
    cue.entries.some((entry) => effectiveFixtureId(cue, entry) === fixtureId),
  );
}

/** 原灯被哪些 Cue 引用（按设计槽位） */
export function cuesReferencingFixture(state: AppState, fixtureId: string): Cue[] {
  return state.cues.filter((cue) => cue.entries.some((entry) => entry.fixtureId === fixtureId));
}

// ---------------------------------------------------------------------------
// 替补资格判定
// ---------------------------------------------------------------------------

export type IneligibleReason =
  | "missing"
  | "faulted"
  | "awaitingReturn"
  | "self"
  | "inCue"
  | "gelMismatch"
  | "zoneMismatch";

export function explainIneligible(reason: IneligibleReason): string {
  switch (reason) {
    case "missing":
      return "灯具不存在";
    case "faulted":
      return "该灯具处于故障状态";
    case "awaitingReturn":
      return "该灯具是待确认回切的原灯，暂不可调作替补";
    case "self":
      return "不能用故障灯接替自身";
    case "inCue":
      return "该灯具已参与本 Cue（含替补登场）";
    case "gelMismatch":
      return "色片不一致";
    case "zoneMismatch":
      return "焦点不在同一区域";
  }
}

/** 判定某候选灯具能否在指定 Cue 接替指定原灯；null 表示合格 */
export function checkCandidate(
  state: AppState,
  cue: Cue,
  originalId: string,
  candidateId: string,
): IneligibleReason | null {
  const original = getFixture(state, originalId);
  const candidate = getFixture(state, candidateId);
  if (!original) return "missing";
  if (!candidate) return "missing";
  if (candidateId === originalId) return "self";
  if (candidate.status === "faulted") return "faulted";
  if (candidate.status === "awaitingReturn") return "awaitingReturn";
  if (cueParticipantIds(cue).has(candidateId)) return "inCue";
  if (candidate.gel !== original.gel) return "gelMismatch";
  if (candidate.zoneId !== original.zoneId) return "zoneMismatch";
  return null;
}

/** 列出某 Cue 中可接替某故障槽位的全部合格替补 */
export function eligibleSubstitutes(
  state: AppState,
  cue: Cue,
  originalId: string,
): Fixture[] {
  const original = getFixture(state, originalId);
  if (!original) return [];
  const participants = cueParticipantIds(cue);
  return state.fixtures.filter(
    (candidate) =>
      candidate.status === "normal" &&
      candidate.id !== originalId &&
      !participants.has(candidate.id) &&
      candidate.gel === original.gel &&
      candidate.zoneId === original.zoneId,
  );
}

export interface FaultSlotPlan {
  entry: CueEntry;
  faultedFixture: Fixture;
  options: Fixture[];
}

/** 待替换 Cue 中每个故障槽位及可选替补，供界面与整次判定共用 */
export function faultSlotPlans(state: AppState, cue: Cue): FaultSlotPlan[] {
  return unresolvedFaults(state, cue).map((entry) => {
    const activeId = effectiveFixtureId(cue, entry);
    const faultedFixture = getFixture(state, activeId)!;
    return {
      entry,
      faultedFixture,
      options: eligibleSubstitutes(state, cue, entry.fixtureId),
    };
  });
}

export type SlotReject =
  | { kind: "unresolved"; originalId: string; reason: IneligibleReason }
  | { kind: "noOption"; originalId: string };

export interface ReplacementProposal {
  /** 原灯槽位 -> 选中的替补灯具 */
  picks: Record<string, string>;
}

/**
 * 整次校验：所有故障槽位都必须给出合格替补，否则整次拒绝。
 * 不做任何部分写入，保证原子性。
 */
export function validateProposal(
  state: AppState,
  cue: Cue,
  proposal: ReplacementProposal,
): SlotReject[] {
  const rejects: SlotReject[] = [];
  for (const slot of faultSlotPlans(state, cue)) {
    const originalId = slot.entry.fixtureId;
    const picked = proposal.picks[originalId];
    if (!picked) {
      rejects.push({ kind: "noOption", originalId });
      continue;
    }
    const reason = checkCandidate(state, cue, originalId, picked);
    if (reason) rejects.push({ kind: "unresolved", originalId, reason });
  }
  return rejects;
}

/** 快速判定：每个故障槽位是否都至少存在一个合格替补（界面预提示「整次将被拒绝」） */
export function isFullyResolvable(state: AppState, cue: Cue): boolean {
  return faultSlotPlans(state, cue).every((slot) => slot.options.length > 0);
}

// ---------------------------------------------------------------------------
// 列表与统计（供筛选、舞台图、指标共用同一份判定）
// ---------------------------------------------------------------------------

export type TypeFilter = FixtureType | "全部";
export type CueStatusFilter = "全部" | CueStatus;

export function filterFixtures(
  fixtures: Fixture[],
  typeFilter: TypeFilter,
): Fixture[] {
  if (typeFilter === "全部") return fixtures;
  return fixtures.filter((fixture) => fixture.type === typeFilter);
}

export function filterCues(
  state: AppState,
  statusFilter: CueStatusFilter,
): Cue[] {
  const sorted = [...state.cues].sort((a, b) => a.order - b.order);
  if (statusFilter === "全部") return sorted;
  return sorted.filter((cue) => cueStatus(state, cue) === statusFilter);
}

/** 待替换 Cue 排在最前，其余按触发顺序；待替换 Cue 持续可见 */
export function sortedCuesForWorkbench(state: AppState): Array<Cue & { status: CueStatus }> {
  return [...state.cues]
    .map((cue) => ({ ...cue, status: cueStatus(state, cue) }))
    .sort((a, b) => {
      const rank = (s: CueStatus) => (s === "pending" ? 0 : s === "awaitingReturn" ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return a.order - b.order;
    });
}

export interface Counts {
  fixtureTotal: number;
  faulted: number;
  pendingCues: number;
  replacedCues: number;
  awaitingReturn: number;
}

export function getCounts(state: AppState): Counts {
  const statuses = state.cues.map((cue) => cueStatus(state, cue));
  return {
    fixtureTotal: state.fixtures.length,
    faulted: state.fixtures.filter((fixture) => fixture.status === "faulted").length,
    pendingCues: statuses.filter((status) => status === "pending").length,
    replacedCues: statuses.filter((status) => status === "replaced").length,
    awaitingReturn: state.fixtures.filter(
      (fixture) => fixture.status === "awaitingReturn",
    ).length,
  };
}
