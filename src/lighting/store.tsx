import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  AppState,
  Fixture,
  MaintenanceAction,
  MaintenanceRecord,
  PersistShape,
} from "./types";
import { buildInitialState } from "./seed";
import {
  cuesReferencingFixture,
  cuesUsingFixture,
  effectiveFixtureId,
  validateProposal,
  type ReplacementProposal,
} from "./rules";

// ---------------------------------------------------------------------------
// 业务状态模块：灯具/Cue/替补关系/维修记录的唯一写入入口，
// 并负责本地存档（localStorage）。判定逻辑在 rules.ts，界面在 components/。
// ---------------------------------------------------------------------------

const STORAGE_KEY = "hxyfront-62002-lighting-v1";

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildInitialState();
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed.version !== 1) return buildInitialState();
    return { ...buildInitialState(), ...parsed };
  } catch {
    return buildInitialState();
  }
}

type Action =
  | { type: "REPORT_FAULT"; fixtureId: string; reason: string; at: number }
  | { type: "REPAIR"; fixtureId: string; at: number }
  | { type: "REPLACE"; cueId: string; proposal: ReplacementProposal; at: number }
  | { type: "REJECT"; cueId: string; detail: string; at: number }
  | { type: "RETURN"; originalId: string; at: number }
  | { type: "SET_SHOW_NAME"; value: string; at: number }
  | { type: "SET_VERSION_NOTE"; value: string; at: number }
  | { type: "SET_CURRENT_CUE"; cueId: string; at: number }
  | { type: "IMPORT"; state: AppState }
  | { type: "RESET" };

let recordSeq = 0;
function newRecord(
  action: MaintenanceAction,
  originalId: string,
  detail: string,
  at: number,
  cueIds: string[],
  substituteId?: string,
): MaintenanceRecord {
  recordSeq += 1;
  return {
    id: `rec-${at.toString(36)}-${recordSeq}`,
    at,
    action,
    originalId,
    substituteId,
    cueIds,
    detail,
  };
}

function mapFixture(fixtures: Fixture[], id: string, fn: (item: Fixture) => Fixture): Fixture[] {
  return fixtures.map((fixture) => (fixture.id === id ? fn(fixture) : fixture));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "REPORT_FAULT": {
      const fixture = state.fixtures.find((item) => item.id === action.fixtureId);
      if (!fixture || fixture.status === "faulted") return state;
      const affected = cuesUsingFixture(state, action.fixtureId)
        .map((cue) => cue.id)
        .sort();
      return {
        ...state,
        savedAt: action.at,
        fixtures: mapFixture(state.fixtures, action.fixtureId, (item) => ({
          ...item,
          status: "faulted",
          faultReason: action.reason || "未填写故障现象",
        })),
        records: [
          newRecord(
            "fault",
            action.fixtureId,
            `报故障：${action.reason || "未填写故障现象"}。引用它的 ${affected.length} 个 Cue 进入待替换`,
            action.at,
            affected,
          ),
          ...state.records,
        ],
      };
    }

    case "REPAIR": {
      const fixture = state.fixtures.find((item) => item.id === action.fixtureId);
      if (!fixture || fixture.status !== "faulted") return state;
      return {
        ...state,
        savedAt: action.at,
        fixtures: mapFixture(state.fixtures, action.fixtureId, (item) => ({
          ...item,
          status: "awaitingReturn",
        })),
        records: [
          newRecord(
            "repair",
            action.fixtureId,
            "维修完成，等待灯光师确认后回切",
            action.at,
            cuesReferencingFixture(state, action.fixtureId).map((cue) => cue.id),
          ),
          ...state.records,
        ],
      };
    }

    case "REPLACE": {
      const cue = state.cues.find((item) => item.id === action.cueId);
      if (!cue) return state;
      // 整次校验：任何一个槽位不合格 -> 整次拒绝，不写入任何替补
      const rejects = validateProposal(state, cue, action.proposal);
      if (rejects.length > 0) return state;

      const picks = action.proposal.picks;
      const nextCues = state.cues.map((item) =>
        item.id === cue.id ? { ...item, substitutions: { ...item.substitutions, ...picks } } : item,
      );
      const nextState: AppState = { ...state, cues: nextCues, savedAt: action.at };

      const added: MaintenanceRecord[] = Object.entries(picks).map(([originalId, substituteId]) => {
        const sub = state.fixtures.find((item) => item.id === substituteId);
        return {
          id: `rec-${action.at.toString(36)}-${originalId}`,
          at: action.at,
          action: "replace",
          originalId,
          substituteId,
          cueIds: [cue.id],
          detail: `${substituteId}（CH ${sub?.channel ?? "-"}，${sub?.gelLabel ?? sub?.gel}）接替 ${originalId}；灯位、顺序、场景保持原样`,
        };
      });

      return { ...nextState, records: [...added, ...state.records] };
    }

    case "REJECT": {
      const cue = state.cues.find((item) => item.id === action.cueId);
      if (!cue) return state;
      const faultedIds = cue.entries
        .filter((entry) => {
          const active = state.fixtures.find(
            (item) => item.id === effectiveFixtureId(cue, entry),
          );
          return active?.status === "faulted";
        })
        .map((entry) => entry.fixtureId);
      const added = faultedIds.map((originalId) => ({
        id: `rec-${action.at.toString(36)}-rej-${originalId}`,
        at: action.at,
        action: "reject" as const,
        originalId,
        cueIds: [cue.id],
        detail: `${cue.id} 整次拒绝：${action.detail}。原灯位与 Cue 不动，持续待处理`,
      }));
      return { ...state, savedAt: action.at, records: [...added, ...state.records] };
    }

    case "RETURN": {
      const fixture = state.fixtures.find((item) => item.id === action.originalId);
      if (!fixture || fixture.status !== "awaitingReturn") return state;
      // 回切：从所有 Cue 的替补映射中移除该原灯，原灯位恢复出光
      const substituteId = state.cues.find((cue) => action.originalId in cue.substitutions)
        ?.substitutions[action.originalId];
      const affectedCueIds: string[] = [];
      const nextCues = state.cues.map((cue) => {
        if (!(action.originalId in cue.substitutions)) return cue;
        affectedCueIds.push(cue.id);
        const substitutions = { ...cue.substitutions };
        delete substitutions[action.originalId];
        return { ...cue, substitutions };
      });
      return {
        ...state,
        savedAt: action.at,
        fixtures: mapFixture(state.fixtures, action.originalId, (item) => ({
          ...item,
          status: "normal",
          faultReason: undefined,
        })),
        cues: nextCues,
        records: [
          newRecord(
            "return",
            action.originalId,
            `已确认回切原灯${substituteId ? `，替补 ${substituteId} 撤下` : ""}；相关 ${affectedCueIds.length} 个 Cue 恢复原灯位`,
            action.at,
            affectedCueIds,
            substituteId,
          ),
          ...state.records,
        ],
      };
    }

    case "SET_SHOW_NAME":
      return { ...state, showName: action.value, savedAt: action.at };

    case "SET_VERSION_NOTE":
      return { ...state, versionNote: action.value, savedAt: action.at };

    case "SET_CURRENT_CUE":
      return { ...state, currentCueId: action.cueId, savedAt: action.at };

    case "IMPORT":
      return { ...action.state };

    case "RESET":
      return buildInitialState();

    default:
      return state;
  }
}

export interface StoreApi {
  state: AppState;
  reportFault: (fixtureId: string, reason: string) => void;
  repairFixture: (fixtureId: string) => void;
  replaceInCue: (cueId: string, proposal: ReplacementProposal) => boolean;
  rejectCue: (cueId: string, detail: string) => void;
  confirmReturn: (originalId: string) => void;
  setShowName: (value: string) => void;
  setVersionNote: (value: string) => void;
  setCurrentCue: (cueId: string) => void;
  exportArchive: () => string;
  importArchive: (json: string) => boolean;
  resetAll: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  // 本地存档：任意业务变更后写入，刷新页面保留
  useEffect(() => {
    try {
      const payload: PersistShape = { ...state, version: 1 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 存储不可用时静默降级，内存状态仍可用
    }
  }, [state]);

  const api = useMemo<StoreApi>(
    () => ({
      state,
      reportFault: (fixtureId, reason) =>
        dispatch({ type: "REPORT_FAULT", fixtureId, reason, at: Date.now() }),
      repairFixture: (fixtureId) => dispatch({ type: "REPAIR", fixtureId, at: Date.now() }),
      replaceInCue: (cueId, proposal) => {
        // 再做一次纯判定，双保险；reducer 内部同样整次校验
        const cue = state.cues.find((item) => item.id === cueId);
        if (!cue) return false;
        if (validateProposal(state, cue, proposal).length > 0) return false;
        dispatch({ type: "REPLACE", cueId, proposal, at: Date.now() });
        return true;
      },
      rejectCue: (cueId, detail) =>
        dispatch({ type: "REJECT", cueId, detail, at: Date.now() }),
      confirmReturn: (originalId) =>
        dispatch({ type: "RETURN", originalId, at: Date.now() }),
      setShowName: (value) => dispatch({ type: "SET_SHOW_NAME", value, at: Date.now() }),
      setVersionNote: (value) =>
        dispatch({ type: "SET_VERSION_NOTE", value, at: Date.now() }),
      setCurrentCue: (cueId) => dispatch({ type: "SET_CURRENT_CUE", cueId, at: Date.now() }),
      exportArchive: () => JSON.stringify({ ...state, version: 1 } satisfies PersistShape, null, 2),
      importArchive: (json) => {
        try {
          const parsed = JSON.parse(json) as PersistShape;
          if (parsed.version !== 1 || !Array.isArray(parsed.fixtures) || !Array.isArray(parsed.cues)) {
            return false;
          }
          dispatch({ type: "IMPORT", state: parsed });
          return true;
        } catch {
          return false;
        }
      },
      resetAll: () => dispatch({ type: "RESET" }),
    }),
    [state],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const api = useContext(StoreContext);
  if (!api) throw new Error("useStore 必须在 StoreProvider 内使用");
  return api;
}
