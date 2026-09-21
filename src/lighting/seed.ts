import type { AppState, FocusZone, Fixture, Cue } from "./types";

/** 焦点分区：替补灯具须与原灯焦点同区 */
export const FOCUS_ZONES: FocusZone[] = [
  { id: "upstage-left", label: "上场门", x: 26, y: 26 },
  { id: "upstage-center", label: "台口中央", x: 50, y: 24 },
  { id: "upstage-right", label: "下场门", x: 74, y: 26 },
  { id: "downstage-center", label: "台中前区", x: 50, y: 40 },
  { id: "left-wing", label: "左表演区", x: 33, y: 38 },
  { id: "right-wing", label: "右表演区", x: 67, y: 38 },
];

export const FIXTURE_TYPES = ["面光", "侧光", "逆光", "效果光"] as const;

/** 色片在舞台图中的光束颜色 */
export const GEL_COLORS: Record<string, string> = {
  L241: "#3b82f6", // 冷蓝
  L152: "#f59e0b", // 浅金
  L201: "#7c3aed", // 艳紫
  L006: "#fb7185", // 暖粉
  L117: "#ef4444", // 深红
  L132: "#22c55e", // 翠绿
};

export function gelColor(gel: string): string {
  return GEL_COLORS[gel] ?? "#94a3b8";
}

const f = (
  id: string,
  channel: number,
  type: Fixture["type"],
  gel: string,
  gelLabel: string,
  zoneId: string,
  x: number,
  y: number,
): Fixture => ({ id, channel, type, gel, gelLabel, zoneId, x, y, status: "normal" });

const cue = (
  id: string,
  order: number,
  name: string,
  scene: string,
  note: string | undefined,
  entries: Array<[string, number]>,
): Cue => ({
  id,
  order,
  name,
  scene,
  note,
  entries: entries.map(([fixtureId, brightness]) => ({ fixtureId, brightness })),
  substitutions: {},
});

/** 初始示例数据：演出《夜航》排演版本 */
export function buildInitialState(): AppState {
  const fixtures: Fixture[] = [
    // 面光 FOH：顶部灯桥
    f("FOH-01", 1, "面光", "L241", "冷蓝", "upstage-left", 14, 9),
    f("FOH-02", 2, "面光", "L241", "冷蓝", "upstage-center", 30, 8),
    f("FOH-03", 3, "面光", "L241", "冷蓝", "upstage-center", 50, 8),
    f("FOH-04", 4, "面光", "L152", "浅金", "upstage-right", 70, 8),
    f("FOH-05", 5, "面光", "L152", "浅金", "upstage-right", 86, 9),
    f("FOH-06", 6, "面光", "L241", "冷蓝", "upstage-center", 40, 8),
    // 侧光 SL/SR：两侧（CH13/CH23 为未编入 Cue 的冷蓝备用灯）
    f("SL-01", 11, "侧光", "L241", "冷蓝", "left-wing", 6, 32),
    f("SL-02", 12, "侧光", "L201", "艳紫", "left-wing", 6, 46),
    f("SL-03", 13, "侧光", "L241", "冷蓝", "left-wing", 6, 18),
    f("SR-01", 21, "侧光", "L241", "冷蓝", "right-wing", 94, 32),
    f("SR-02", 22, "侧光", "L006", "暖粉", "right-wing", 94, 46),
    f("SR-03", 23, "侧光", "L241", "冷蓝", "right-wing", 94, 18),
    // 逆光 BL：后沿
    f("BL-01", 31, "逆光", "L201", "艳紫", "downstage-center", 40, 56),
    f("BL-02", 32, "逆光", "L201", "艳紫", "downstage-center", 50, 56),
    f("BL-03", 33, "逆光", "L117", "深红", "upstage-center", 60, 56),
    // 效果光 FX
    f("FX-01", 41, "效果光", "L132", "翠绿", "downstage-center", 24, 54),
    f("FX-02", 42, "效果光", "L117", "深红", "upstage-right", 76, 54),
  ];

  const cues: Cue[] = [
    cue("Cue 6", 6, "开场暖场", "大幕未启，暗蓝底光", "候场准备", [
      ["FOH-01", 35],
      ["FOH-02", 30],
      ["SL-01", 40],
      ["BL-01", 25],
    ]),
    cue("Cue 12", 12, "二幕开场·冷蓝侧光", "二幕开启，冷蓝侧光", "CH 021-028 亮度 65% 方案", [
      ["SL-01", 65],
      ["SR-01", 65],
      ["FOH-02", 45],
      ["FOH-03", 45],
      ["BL-02", 30],
    ]),
    cue("Cue 18", 18, "追光入场", "主角自上场门入场", "需演员走位确认，焦点门口", [
      ["FOH-01", 85],
      ["SL-01", 55],
      ["FX-01", 30],
    ]),
    cue("Cue 24", 24, "暖色谢幕", "全台面光暖收", "版本 B", [
      ["FOH-04", 80],
      ["FOH-05", 80],
      ["FOH-03", 60],
      ["SR-02", 50],
      ["BL-03", 40],
    ]),
    cue("Cue 30", 30, "中场效果", "后场红绿光效", undefined, [
      ["FX-01", 70],
      ["FX-02", 70],
      ["BL-03", 45],
    ]),
  ];

  return {
    showName: "夜航（排演版）",
    versionNote: "2026-09-21 技术合成第 3 场，Cue 18 焦点待走位确认",
    currentCueId: "Cue 12",
    fixtures,
    cues,
    records: [],
    savedAt: Date.now(),
  };
}
