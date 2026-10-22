import type { Engine, EngineStatus, Family, FamilyId, Plane, PlaneDims, PlaneId } from "../types";
import run from "./run.json";

/** Pull threshold from the best model the real loop kept (falls back to the baseline 30). */
export const PULL_T: number = (run as { best?: { T?: number } }).best?.T ?? 30;
export const WATCH_BAND = 20;

export const FAMILIES: Record<FamilyId, Family> = {
  ge90: { id: "ge90", name: "GE90-class", thrust: "115k lbf", dataset: "C-MAPSS FD001 · live run", live: true, fleetEngines: 100 },
  trent900: { id: "trent900", name: "Trent 900-class", thrust: "76k lbf", dataset: "simulated", live: false, fleetEngines: 248 },
  genx2b: { id: "genx2b", name: "GEnx-2B-class", thrust: "66k lbf", dataset: "simulated", live: false, fleetEngines: 180 },
  trentxwb: { id: "trentxwb", name: "Trent XWB-class", thrust: "84k lbf", dataset: "simulated", live: false, fleetEngines: 212 },
  leap1a: { id: "leap1a", name: "LEAP-1A-class", thrust: "32k lbf", dataset: "simulated", live: false, fleetEngines: 640 },
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function statusFor(rul: number): EngineStatus {
  return rul <= PULL_T ? "pull" : rul <= PULL_T + WATCH_BAND ? "watch" : "ok";
}

// Hand-picked RULs so every plane tells a story (one plane has an engine to pull).
const RULS: Record<PlaneId, number[]> = {
  a380: [142, 31, 118, 96],
  b747: [77, 164, 6, 133],
  b777: [58, 121],
  a350: [188, 172],
  a320: [7, 103],
};

function makeEngines(planeId: PlaneId, family: FamilyId, seed: number): Engine[] {
  const r = rng(seed);
  return RULS[planeId].map((rul, i) => {
    const wear = Math.max(0, Math.min(1, 1 - rul / 220));
    const cycles = Math.round(120 + wear * 210 + r() * 30);
    const trend = Array.from({ length: 30 }, (_, k) => {
      const ahead = 29 - k;
      return Math.max(0, Math.round((rul + ahead * (0.9 + r() * 0.2) + (r() - 0.5) * 6) * 10) / 10);
    });
    return {
      id: `${planeId}-e${i + 1}`,
      planeId,
      position: i + 1,
      label: `ENG ${i + 1}`,
      serial: `ESN ${family.toUpperCase().slice(0, 4)}-${Math.floor(10000 + r() * 89999)}`,
      family,
      cycles,
      rul,
      rulBand: [Math.max(0, Math.round(rul * 0.82 - 3)), Math.round(rul * 1.14 + 4)],
      health: Math.round((1 - wear) * 100) / 100,
      status: statusFor(rul),
      egtMargin: Math.round(48 - wear * 40 + (r() - 0.5) * 4),
      vibration: Math.round((0.4 + wear * 1.6 + r() * 0.2) * 100) / 100,
      sensors: {
        T24: +(642 + wear * 2.6 + r() * 0.4).toFixed(2),
        T30: +(1585 + wear * 18 + r() * 3).toFixed(1),
        T50: +(1400 + wear * 30 + r() * 4).toFixed(1),
        P30: +(554.5 - wear * 3.2 + r() * 0.3).toFixed(2),
        Nf: +(2388.0 + wear * 0.25).toFixed(2),
        Nc: +(9050 + wear * 60 + r() * 8).toFixed(1),
        Ps30: +(47.3 + wear * 0.9).toFixed(2),
        phi: +(521.9 - wear * 2.6).toFixed(2),
      },
      rulTrend: trend,
    };
  });
}

const D = (d: Partial<PlaneDims> & Pick<PlaneDims, "length" | "radius" | "span">): PlaneDims => ({
  sweep: 0.55, chordRoot: 1.0, chordTip: 0.3, wingY: -0.45, wingX: 0.42, engineRadius: 0.14,
  engineLength: 0.55, enginePositions: [0.32], tailHeight: 1.0, hump: false, doubleDeck: false,
  winglet: "raked", ...d,
});

export const PLANES: Plane[] = [
  {
    id: "a380", type: "Airbus A380-800", short: "A380", tail: "JF-A38A", route: "LHR → SIN", engineCount: 4,
    family: "trent900", accent: "#7dd3fc", engines: makeEngines("a380", "trent900", 380),
    dims: D({ length: 7.27, radius: 0.42, span: 7.98, sweep: 0.58, chordRoot: 1.55, chordTip: 0.42, wingY: -0.55,
      engineRadius: 0.15, engineLength: 0.6, enginePositions: [0.27, 0.52], tailHeight: 1.45, doubleDeck: true, winglet: "fence" }),
  },
  {
    id: "b747", type: "Boeing 747-8", short: "747", tail: "JF-B74Q", route: "FRA → ORD", engineCount: 4,
    family: "genx2b", accent: "#c4b5fd", engines: makeEngines("b747", "genx2b", 747),
    dims: D({ length: 7.63, radius: 0.33, span: 6.84, sweep: 0.65, chordRoot: 1.35, chordTip: 0.36, wingY: -0.42,
      engineRadius: 0.13, engineLength: 0.55, enginePositions: [0.3, 0.56], tailHeight: 1.3, hump: true, winglet: "raked" }),
  },
  {
    id: "b777", type: "Boeing 777-300ER", short: "777", tail: "JF-B77W", route: "DXB → JFK", engineCount: 2,
    family: "ge90", accent: "#ff6a2b", engines: makeEngines("b777", "ge90", 777),
    dims: D({ length: 7.39, radius: 0.31, span: 6.48, sweep: 0.55, chordRoot: 1.3, chordTip: 0.33, wingY: -0.4,
      engineRadius: 0.19, engineLength: 0.72, enginePositions: [0.32], tailHeight: 1.2, winglet: "raked" }),
  },
  {
    id: "a350", type: "Airbus A350-900", short: "A350", tail: "JF-A35X", route: "CDG → HND", engineCount: 2,
    family: "trentxwb", accent: "#86efac", engines: makeEngines("a350", "trentxwb", 350),
    dims: D({ length: 6.68, radius: 0.3, span: 6.48, sweep: 0.56, chordRoot: 1.25, chordTip: 0.3, wingY: -0.4,
      engineRadius: 0.16, engineLength: 0.62, enginePositions: [0.31], tailHeight: 1.15, winglet: "curved" }),
  },
  {
    id: "a320", type: "Airbus A320neo", short: "A320neo", tail: "JF-A32N", route: "LGW → BCN", engineCount: 2,
    family: "leap1a", accent: "#fcd34d", engines: makeEngines("a320", "leap1a", 320),
    dims: D({ length: 3.76, radius: 0.2, span: 3.58, sweep: 0.44, chordRoot: 0.7, chordTip: 0.22, wingY: -0.24,
      engineRadius: 0.1, engineLength: 0.38, enginePositions: [0.34], tailHeight: 0.62, winglet: "sharklet" }),
  },
];

export const planeById = (id: PlaneId) => PLANES.find((p) => p.id === id)!;
export const engineById = (id: string) => PLANES.flatMap((p) => p.engines).find((e) => e.id === id) ?? null;
export const STATUS_COLOR: Record<EngineStatus, string> = { ok: "#059669", watch: "#d97706", pull: "#e11d48" };
