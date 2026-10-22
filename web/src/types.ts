export type EngineStatus = "ok" | "watch" | "pull";
export type PlaneId = "a380" | "b747" | "b777" | "a350" | "a320";
export type FamilyId = "trent900" | "genx2b" | "ge90" | "trentxwb" | "leap1a";

export interface SensorSnapshot {
  T24: number; // LPC outlet temp (°R)
  T30: number; // HPC outlet temp (°R)
  T50: number; // LPT outlet temp (°R)
  P30: number; // HPC outlet pressure (psia)
  Nf: number; // fan speed (rpm)
  Nc: number; // core speed (rpm)
  Ps30: number; // HPC static pressure (psia)
  phi: number; // fuel flow / Ps30
}

export interface Engine {
  id: string; // e.g. "a380-e2"
  planeId: PlaneId;
  position: number; // 1..n, left wing outboard -> right wing outboard
  label: string; // "ENG 2"
  serial: string; // "ESN 900-41872"
  family: FamilyId;
  cycles: number; // cycles flown since last shop visit
  rul: number; // predicted remaining useful life (cycles)
  rulBand: [number, number]; // ~80% band
  health: number; // 0..1 (1 = new)
  status: EngineStatus; // pull if rul <= T, watch if rul <= T + 20
  egtMargin: number; // °C
  vibration: number; // ips
  sensors: SensorSnapshot;
  rulTrend: number[]; // last 30 predicted RUL values, oldest first
}

export interface PlaneDims {
  length: number; // fuselage length (scene units, ~metres / 10)
  radius: number; // fuselage radius
  span: number; // full wing span
  sweep: number; // wing sweep (radians)
  chordRoot: number;
  chordTip: number;
  wingY: number; // wing vertical offset relative to fuselage centre (negative = low wing)
  wingX: number; // wing root position along fuselage, 0 = nose, 1 = tail
  engineRadius: number;
  engineLength: number;
  enginePositions: number[]; // fraction of semi-span for each engine on ONE wing, inboard first
  tailHeight: number;
  hump: boolean; // 747 upper deck
  doubleDeck: boolean; // A380
  winglet: "raked" | "curved" | "sharklet" | "fence";
}

export interface Plane {
  id: PlaneId;
  type: string; // "Airbus A380-800"
  short: string; // "A380"
  tail: string; // "JF-A38A"
  route: string; // "LHR → SIN"
  engineCount: 2 | 4;
  family: FamilyId;
  engines: Engine[];
  dims: PlaneDims;
  accent: string; // hex used for small UI accents
}

export interface Family {
  id: FamilyId;
  name: string; // "GE90-class"
  thrust: string; // "115k lbf"
  dataset: string; // "C-MAPSS FD001 (live)" | "simulated"
  live: boolean; // true = driven by the real research run in run.json
  fleetEngines: number;
}

/** One row of the real results.tsv (exported by scripts/export-run.mjs). */
export interface RunRow {
  turn: number;
  time: string;
  hypothesis: string;
  status: string;
  verdict: "baseline" | "keep" | "discard" | "leak" | "timeout" | "error" | "violation" | string;
  mean_cost: number | null;
  best_before: number | null;
  folds: (number | null)[];
  wins: number | null;
  fails: number | null;
  waste: number | null;
  rmse125: number | null;
  nasa100: number | null;
  T: number | null;
  secs: number | null;
}

export interface RunData {
  exportedAt: string;
  rows: RunRow[];
  insights: string[];
  best: { turn: number; hypothesis: string; mean_cost: number; T: number; fold_costs: number[] } | null;
}
