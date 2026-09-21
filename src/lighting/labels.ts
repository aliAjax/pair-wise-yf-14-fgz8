import type { FixtureStatus, MaintenanceAction } from "./types";
import type { CueStatus } from "./rules";

export const CUE_STATUS_TEXT: Record<CueStatus, string> = {
  normal: "正常",
  pending: "待替换",
  replaced: "替补中",
  awaitingReturn: "待回切",
};

export const FIXTURE_STATUS_TEXT: Record<FixtureStatus, string> = {
  normal: "正常",
  faulted: "故障",
  awaitingReturn: "待回切",
};

export const ACTION_TEXT: Record<MaintenanceAction, string> = {
  fault: "报故障",
  replace: "替补接替",
  reject: "整次拒绝",
  repair: "维修完成",
  return: "确认回切",
};

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}
