import type {
  AppState,
  Cue,
  CueStatus,
  EffectiveFixtureStatus,
  Fixture,
  FixtureType,
  MaintenanceRecord,
  Zone,
} from "./types";

// 初始数据：一次冷蓝侧光故障换灯的完整闭环演示
// SL-01（侧光/冷蓝/侧台）故障 -> Cue 12 待替换；SL-04 是唯一合格替补。

export const FIXTURE_TYPES: FixtureType[] = ["面光", "侧光", "逆光", "效果光"];
export const ZONES: Zone[] = ["台口", "前场区", "中区", "后区", "侧台"];

export const SEED_FIXTURES: Fixture[] = [
  { id: "FOH-01", channel: 1, type: "面光", gel: "暖色", zone: "台口", x: 30, y: 9, status: "normal" },
  { id: "FOH-02", channel: 2, type: "面光", gel: "暖色", zone: "台口", x: 50, y: 7, status: "normal" },
  { id: "FOH-03", channel: 3, type: "面光", gel: "中性", zone: "台口", x: 70, y: 9, status: "normal" },
  { id: "FOH-04", channel: 4, type: "面光", gel: "冷蓝", zone: "台口", x: 14, y: 14, status: "normal" },
  { id: "SL-01", channel: 21, type: "侧光", gel: "冷蓝", zone: "侧台", x: 5, y: 55, status: "faulty" },
  { id: "SL-02", channel: 22, type: "侧光", gel: "冷蓝", zone: "侧台", x: 5, y: 78, status: "normal" },
  // 同区但色片不同，不能接替 SL-01
  { id: "SL-03", channel: 23, type: "侧光", gel: "暖色", zone: "侧台", x: 95, y: 55, status: "normal" },
  // 唯一合格替补：未参与该 Cue、色片相同、焦点同区
  { id: "SL-04", channel: 24, type: "侧光", gel: "冷蓝", zone: "侧台", x: 95, y: 78, status: "normal" },
  { id: "BL-01", channel: 41, type: "逆光", gel: "冷蓝", zone: "后区", x: 25, y: 88, status: "normal" },
  { id: "BL-02", channel: 42, type: "逆光", gel: "暖色", zone: "后区", x: 55, y: 91, status: "normal" },
  { id: "FX-01", channel: 61, type: "效果光", gel: "中性", zone: "中区", x: 42, y: 50, status: "normal" },
  { id: "FX-02", channel: 62, type: "效果光", gel: "暖色", zone: "前场区", x: 62, y: 32, status: "normal" },
];

export const SEED_CUES: Cue[] = [
  {
    id: "Cue 12",
    name: "冷蓝侧光",
    order: 12,
    scene: "二幕开场",
    entries: [
      { originalId: "SL-01", fixtureId: "SL-01", brightness: 65 },
      { originalId: "SL-02", fixtureId: "SL-02", brightness: 60 },
      { originalId: "FOH-04", fixtureId: "FOH-04", brightness: 40 },
    ],
  },
  {
    id: "Cue 18",
    name: "追光入场",
    order: 18,
    scene: "演员走位",
    entries: [{ originalId: "FOH-03", fixtureId: "FOH-03", brightness: 90 }],
  },
  {
    id: "Cue 24",
    name: "暖色谢幕",
    order: 24,
    scene: "谢幕",
    entries: [
      { originalId: "FOH-01", fixtureId: "FOH-01", brightness: 80 },
      { originalId: "FOH-02", fixtureId: "FOH-02", brightness: 80 },
      { originalId: "BL-02", fixtureId: "BL-02", brightness: 70 },
      { originalId: "FX-02", fixtureId: "FX-02", brightness: 55 },
    ],
  },
  {
    id: "Cue 30",
    name: "月夜逆光",
    order: 30,
    scene: "尾声",
    entries: [
      { originalId: "BL-01", fixtureId: "BL-01", brightness: 70 },
      { originalId: "FX-01", fixtureId: "FX-01", brightness: 35 },
    ],
  },
];

const faultAt = new Date(Date.now() - 1000 * 60 * 42).toISOString();

export const SEED_RECORDS: MaintenanceRecord[] = [
  {
    id: "rec-seed-1",
    fixtureId: "SL-01",
    action: "faultReported",
    at: faultAt,
    detail: "灯泡不亮，通道 21 无输出",
    cueIds: ["Cue 12"],
  },
];

export const SEED_STATE: AppState = {
  version: 1,
  showName: "《夜航》排练版",
  versionNote: "版本B · 二幕侧光亮度待调",
  fixtures: SEED_FIXTURES,
  cues: SEED_CUES,
  records: SEED_RECORDS,
  currentCueId: "Cue 12",
  filters: { fixtures: { types: [...FIXTURE_TYPES], fixtureStatus: "all" }, cueStatus: "all" },
};
