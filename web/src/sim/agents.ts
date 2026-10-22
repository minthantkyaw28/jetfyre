import { useEffect } from "react";
import { create } from "zustand";
import runJson from "../data/run.json";
import type { FamilyId, RunData, RunRow } from "../types";

const RUN = runJson as unknown as RunData;

/* ------------------------------------------------------------------ stages */

export const STAGES = [
  { key: "hyp", label: "Hypothesis", owner: "Researcher", desc: "Read the log and write one line on what should help" },
  { key: "edit", label: "Edit", owner: "Engineer", desc: "Change model.py, the only file the agent can touch" },
  { key: "run", label: "Run", owner: "Evaluator", desc: "Train on four folds of engines, replay the fifth, five times over" },
  { key: "score", label: "Score", owner: "Guard + scorer", desc: "Mean cost per engine, failures first, waste second" },
  { key: "commit", label: "Keep or revert", owner: "Archivist · git", desc: "Commit if cost falls and it wins four folds of five. If not, reset." },
] as const;

/** Theme colours as CSS variables (index.css @theme); `mix` adds alpha without hard-coding hex. */
export const C = {
  fyre: "var(--color-fyre)", fyre2: "var(--color-fyre2)", ok: "var(--color-ok)", pull: "var(--color-pull)",
  magenta: "var(--color-magenta)", cyan: "var(--color-cyan)", lime: "var(--color-lime)", panel: "var(--color-panel)",
  watch: "var(--color-watch)", sky: "var(--color-sky)", violet: "var(--color-violet)", muted: "var(--color-muted)",
  dim: "var(--color-dim)", line: "var(--color-line)", line2: "var(--color-line2)", ink: "var(--color-ink)", bg: "var(--color-bg)",
};
export const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, var(--color-panel))`;
export const grad = (...cs: string[]) => `linear-gradient(90deg, ${cs.join(", ")})`;
export const GRAD_FYRE = grad(C.cyan, C.fyre, C.violet, C.magenta); // cyan → blue → indigo → violet
export const GRAD_COOL = grad(C.fyre2, C.cyan, C.sky, C.fyre);
export const STAGE_MS = 1600;
export const HOLD_MS = 1400;
export const TURN_MS = STAGE_MS * STAGES.length + HOLD_MS;

/* ------------------------------------------------------------------- turns */

export interface SimTurn {
  turn: number;
  time: string;
  hypothesis: string;
  verdict: string;
  mean: number | null;
  bestBefore: number | null;
  bestAfter: number | null;
  folds: (number | null)[];
  bestFolds: (number | null)[] | null;
  wins: number | null;
  fails: number;
  waste: number | null;
  rmse: number | null;
  T: number | null;
  secs: number;
  insight: string | null;
}

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
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const pad = (n: number) => String(n).padStart(4, "0");
const T_RE = /T\s*=?\s*(\d+(?:\.\d+)?)\s*(?:->|→|to)\s*(\d+(?:\.\d+)?)/i;

function liveRun(): SimTurn[] {
  const ins = new Map<number, string>();
  for (const l of RUN.insights ?? []) {
    const m = l.match(/^T?(\d{4})/);
    if (m) ins.set(Number(m[1]), l);
  }
  let best: RunRow | null = null;
  return (RUN.rows ?? []).map((r) => {
    const bestBefore = best?.mean_cost ?? null;
    const bestFolds = best?.folds ?? null;
    if ((r.verdict === "keep" || r.verdict === "baseline") && r.mean_cost != null) best = r;
    return {
      turn: r.turn, time: r.time, hypothesis: r.hypothesis, verdict: r.verdict, mean: r.mean_cost,
      bestBefore: r.best_before ?? bestBefore, bestAfter: best?.mean_cost ?? null, folds: r.folds, bestFolds,
      wins: r.wins, fails: r.fails ?? 0, waste: r.waste, rmse: r.rmse125, T: r.T, secs: r.secs ?? 0,
      insight: ins.get(r.turn) ?? null,
    };
  });
}

const FLAVOUR: Record<FamilyId, { base: number; seed: number; hyps: string[] }> = {
  ge90: { base: 33.4, seed: 90, hyps: ["HPC outlet temp (s3) 20-cycle slope will warn earlier", "fan-speed residual vs setting as a feature", "Ps30 15-cycle slope (HPC fouling)", "cap training RUL at 130"] },
  trent900: { base: 38.6, seed: 900, hyps: ["three-shaft: 20-cycle slope on IP-compressor temp (s3) will warn earlier", "EGT-margin decay rate (Δs4 over 15 cycles) as a feature", "long-haul ops: cap training RUL at 130, early life carries no wear", "HP-spool speed (s9) drift slope over 25 cycles"] },
  genx2b: { base: 36.2, seed: 2, hyps: ["composite fan: 10-cycle EWMA of fan-speed residual (s8) vs setting", "bypass-ratio drift (s15) slope over 25 cycles", "LPT outlet temp (s4) 20-cycle slope warns before EGT limit", "cap training RUL at 120 for the higher-cycle 747 rotations"] },
  trentxwb: { base: 34.9, seed: 84, hyps: ["HPC stall-margin proxy Ps30/P30 ratio as a feature", "hot-day correction: normalise T50 (s4) by operating setting", "30-cycle slope on core speed (s9) and coolant bleed (s20, s21)", "cap training RUL at 135: XWB fleet is young"] },
  leap1a: { base: 41.3, seed: 1, hyps: ["short-haul, high-cycle: weight samples with RUL < 50 ×3", "core-speed (Nc, s9) 30-cycle slope warns before EGT does", "10-cycle rolling mean on HPT temps: short sectors are noisy", "cap training RUL at 115 for 6-sector days"] },
};

const GENERIC = [
  "drop the 7 flat channels; trees are splitting on noise",
  "lower pull threshold T 30→20: zero fails and waste ≈ T+3",
  "causal 10-cycle rolling mean on the 14 informative sensors",
  "quantile objective α=0.35 so late errors cost more than early ones",
  "centred 9-cycle smoothing of sensor traces to cut noise",
  "causal running min of predicted RUL (an engine never un-wears)",
  "lower T 20→14 now late errors are rarer",
  "ensemble 3 LightGBM seeds and average predictions",
  "num_leaves 31→63, min_child_samples 40",
  "add cycle count as a feature",
  "EWMA span=5 on predicted RUL (post-processing)",
  "lower T 14→10: tighter late-life fit should hold zero fails",
  "add 5-cycle rolling std on s11 and s4 (volatility rises near failure)",
  "learning rate 0.05→0.03 with 400 trees",
];

function simRun(fam: FamilyId): SimTurn[] {
  const fl = FLAVOUR[fam];
  const r = rng(fl.seed * 7 + 13);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const flav = [...fl.hyps];
  const gen = [...GENERIC];
  const hyps = ["baseline: LightGBM on raw sensors, uncapped RUL target, T=30"];
  for (let i = 1; i <= 18; i++) hyps.push((i % 4 === 2 && flav.length ? flav.shift() : gen.shift() ?? flav.shift()) as string);

  let T = 30;
  let bestFolds = Array.from({ length: 5 }, () => fl.base * (0.86 + r() * 0.28));
  let bestMean = avg(bestFolds);
  let rmse = 32 + r() * 3;
  const t0 = 18 * 3600 + 1 * 60 + 30;
  const clock = (i: number) => {
    const s = t0 + Math.round(i * (44 + r() * 8));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, "0")).join(":");
  };
  const out: SimTurn[] = [{
    turn: 0, time: clock(0), hypothesis: hyps[0], verdict: "baseline", mean: r2(bestMean), bestBefore: null, bestAfter: r2(bestMean),
    folds: bestFolds.map(r2), bestFolds: null, wins: null, fails: 0, waste: r2(bestMean), rmse: r2(rmse), T, secs: r2(3 + r() * 1.2),
    insight: null,
  }];

  for (let i = 1; i < hyps.length; i++) {
    const h = hyps[i];
    const lo = h.toLowerCase();
    const tm = h.match(T_RE);
    const candT = tm ? Number(tm[2]) : T;
    let folds: number[];
    let verdict: string;
    let fails = 0;
    let wins: number | null = null;
    if (/centred|bidirectional/.test(lo)) {
      folds = bestFolds.map((b) => b * (0.8 + r() * 0.08));
      verdict = "leak";
    } else {
      const strong = /lower|rolling mean|drop the|slope|cap training|cap at|weight/.test(lo);
      const decay = 1 - (i / hyps.length) * 0.55;
      const x = r();
      const f = x < (strong ? 0.78 : 0.34) ? 1 - (0.05 + r() * 0.2) * decay : 1 + (r() * 0.09 - 0.025);
      folds = bestFolds.map((b) => b * f * (1 + (r() - 0.5) * 0.1));
      if (/lower/.test(lo) && x > 0.88) {
        folds[Math.floor(r() * 5)] += 25; // one engine ran to failure: 500 / 20 engines in the fold
        fails = 1;
      }
      const mean = avg(folds);
      wins = folds.filter((v, j) => v < bestFolds[j]).length;
      verdict = mean < bestMean && wins >= 4 ? "keep" : "discard";
    }
    const mean = avg(folds);
    const before = bestMean;
    if (verdict === "keep") {
      bestFolds = folds;
      bestMean = mean;
      T = candT;
      rmse = Math.max(14, rmse - (0.8 + r() * 3.2));
    }
    const lesson =
      verdict === "keep" ? pick(["signal is real, so build on it next", "it held on every fold, so it is not noise", "waste fell and no engine ran to failure"])
      : verdict === "leak" ? "the cut-test changed earlier predictions: the feature uses future rows, so the turn was rejected before scoring"
      : fails ? "one engine ran to failure (+500): too aggressive, keep T higher until late errors shrink"
      : "no 4/5 majority: the effect sits inside fold noise";
    out.push({
      turn: i, time: clock(i), hypothesis: h, verdict, mean: r2(mean), bestBefore: r2(before), bestAfter: r2(bestMean),
      folds: folds.map(r2), bestFolds: out.length ? (out.filter((o) => o.verdict === "keep" || o.verdict === "baseline").at(-1)?.folds ?? null) : null,
      wins, fails, waste: r2(mean - fails * 5), rmse: r2(verdict === "keep" ? rmse : rmse + (r() - 0.3) * 2),
      T: verdict === "keep" ? T : candT, secs: r2(3 + r() * 4 + i * 0.12),
      insight: `T${pad(i)} | ${h} → ${verdict} (mean ${mean.toFixed(2)} vs ${before.toFixed(2)}, wins ${wins ?? "–"}/5, fails ${fails}) | ${lesson}`,
    });
  }
  return out;
}

const runCache = new Map<FamilyId, SimTurn[]>();
export function getRun(fam: FamilyId): SimTurn[] {
  if (!runCache.has(fam)) {
    const live = fam === "ge90" ? liveRun() : [];
    runCache.set(fam, live.length ? live : simRun(fam));
  }
  return runCache.get(fam)!;
}
export const isLiveRun = (fam: FamilyId) => fam === "ge90" && (RUN.rows?.length ?? 0) > 0;
export const exportedAt = RUN.exportedAt;

/* ------------------------------------------------------------- diff / meta */

export function synthDiff(h: string): { s: "+" | "-" | "~"; t: string }[] {
  const x = h.toLowerCase();
  const out: { s: "+" | "-" | "~"; t: string }[] = [];
  const num = (re: RegExp, d: string) => h.match(re)?.[1] ?? d;
  const w = num(/(\d+)-cycle/i, "") || num(/w\s*=\s*(\d+)/i, "") || num(/span\s*=?\s*(\d+)/i, "") || "10";
  const tm = h.match(T_RE);
  if (/^baseline\b/.test(x)) out.push({ s: "+", t: "lgb.LGBMRegressor(n_estimators=200, num_leaves=31)" }, { s: "+", t: "T = 30.0" });
  if (/cheat|track length|len\(track\)/.test(x)) out.push({ s: "+", t: "p = len(track) - track.cycle  # peeks at the future" });
  if (tm) out.push({ s: "-", t: `T = ${Number(tm[1]).toFixed(1)}` }, { s: "+", t: `T = ${Number(tm[2]).toFixed(1)}` });
  if (/\bdrop(ping)? (the )?(\d+ )?(flat|constant|near-constant|uninformative|sensors)|flat (sensors|channels|columns)/.test(x)) out.push({ s: "-", t: 'SENSORS = [f"s{i}" for i in range(1, 22)]' }, { s: "+", t: "SENSORS = INFORMATIVE  # the 14 that move" });
  if (/centred|centered|bidirectional/.test(x)) out.push({ s: "+", t: "track[S].rolling(9, center=True).mean()  # future rows!" });
  else if (/rolling (mean|std)/.test(x)) out.push({ s: "+", t: `X[f"{s}_m${w}"] = track[s].rolling(${w}, min_periods=1).${/std/.test(x) ? "std" : "mean"}()` });
  if (/slope|drift|decay rate/.test(x)) out.push({ s: "+", t: `X[f"{s}_d${w}"] = track[s].diff(${w}) / ${w}` });
  if (/ewma|ewm/.test(x)) out.push({ s: "+", t: /predict|post/.test(x) ? `p = pd.Series(p).ewm(span=${w}).mean().to_numpy()` : `X[f"{s}_e"] = track[s].ewm(span=${w}).mean()` });
  if (/\bcap(ping)?\b/.test(x)) {
    const c = num(/(?:cap\D{0,40}?)(\d{3})/i, "125");
    out.push({ s: "-", t: "y = rul" }, { s: "+", t: `y = np.minimum(rul, ${c})` });
  }
  if (/quantile|asymmetric|alpha|α/.test(x)) out.push({ s: "-", t: 'objective="l2"' }, { s: "+", t: `objective="quantile", alpha=${num(/[αa]lpha?\s*=\s*([\d.]+)/i, "0.35")}` });
  if (/num_leaves|min_child|\bleaves \d/.test(x)) out.push({ s: "-", t: "num_leaves=31" }, { s: "+", t: "num_leaves=63, min_child_samples=40" });
  if (/learning rate/.test(x)) out.push({ s: "-", t: "learning_rate=0.05, n_estimators=200" }, { s: "+", t: "learning_rate=0.03, n_estimators=400" });
  if (/ensemble|seeds/.test(x)) out.push({ s: "+", t: "self.ms = [fit(X, y, seed=s) for s in range(3)]" });
  if (/running min|cummin|un-wear|monoton/.test(x)) out.push({ s: "+", t: "p = np.minimum.accumulate(p)" });
  if (/cycle count|cycle as/.test(x)) out.push({ s: "+", t: 'X["cycle"] = track.cycle' });
  if (/weight/.test(x)) out.push({ s: "+", t: "w = 1 + 2 * (y < 50)" });
  if (/normalis|normaliz|ratio|residual/.test(x)) out.push({ s: "+", t: /ratio/.test(x) ? 'X["margin"] = track.s11 / track.s7' : "X[s] = X[s] - base[s](track[SETTINGS])" });
  if (!out.length) out.push({ s: "~", t: "model.py  (1 hunk)" });
  return out.slice(0, 4);
}

export const VERDICT: Record<string, { label: string; chip: string; text: string; hex: string }> = {
  keep: { label: "KEEP", chip: "border-ok/40 bg-ok/10 text-ok", text: "text-ok", hex: C.ok },
  baseline: { label: "BASELINE", chip: "border-sky/40 bg-sky/10 text-sky", text: "text-sky", hex: C.sky },
  discard: { label: "REVERT", chip: "border-line2 bg-panel2 text-muted", text: "text-muted", hex: C.muted },
  leak: { label: "LEAK CAUGHT", chip: "border-pull/40 bg-pull/10 text-pull", text: "text-pull", hex: C.pull },
  timeout: { label: "TIMEOUT", chip: "border-watch/40 bg-watch/10 text-watch", text: "text-watch", hex: C.watch },
  error: { label: "ERROR", chip: "border-pull/40 bg-pull/10 text-pull", text: "text-pull", hex: C.pull },
  violation: { label: "VIOLATION", chip: "border-pull/40 bg-pull/10 text-pull", text: "text-pull", hex: C.pull },
  running: { label: "RUNNING", chip: "border-fyre/40 bg-fyre/10 text-fyre2", text: "text-fyre", hex: C.fyre },
};
export const verdictMeta = (v: string) => VERDICT[v] ?? VERDICT.discard;

/* ------------------------------------------------------------ sessions/events */

export type EventKind = "session" | "llm" | "tool" | "guard" | "eval" | "git" | "memory";
export interface SimEvent {
  id: string;
  stage: number;
  atMs: number; // sim time within the turn when the event appears
  offsetMs: number; // "real" offset from session start
  durMs: number;
  depth: number;
  type: string;
  kind: EventKind;
  label: string;
  payload: string;
  tokIn?: number;
  tokOut?: number;
  bad?: boolean;
}
export interface SimSession {
  events: SimEvent[];
  totalMs: number;
  tokIn: number;
  tokOut: number;
}

const sessionCache = new Map<string, SimSession>();
export function getSession(fam: FamilyId, tr: SimTurn): SimSession {
  const key = `${fam}:${tr.turn}:${tr.verdict}`;
  const hit = sessionCache.get(key);
  if (hit) return hit;
  const r = rng(hash(fam) * 7919 + tr.turn * 104729);
  const between = (a: number, b: number) => Math.round(a + r() * (b - a));
  const ev: Omit<SimEvent, "atMs" | "id">[] = [];
  let t = 0;
  const add = (stage: number, type: string, kind: EventKind, label: string, payload: string, durMs: number, extra: Partial<SimEvent> = {}) => {
    ev.push({ stage, type, kind, label, payload, offsetMs: t, durMs, depth: 0, ...extra });
    t += durMs + between(20, 120);
    return ev.length - 1;
  };
  const leak = tr.verdict === "leak";
  const keepish = tr.verdict === "keep" || tr.verdict === "baseline";
  const diff = synthDiff(tr.hypothesis);
  const plus = diff.filter((d) => d.s === "+").length;
  const minus = diff.filter((d) => d.s === "-").length;

  add(0, "session.created", "session", "claude -p", "research-settings.json · tools: Read, Edit(model.py), Bash(loop.py)", 140);
  add(0, "agent.tool_use", "tool", "Bash", "tail -n 15 results.tsv", between(50, 140));
  add(0, "agent.tool_use", "tool", "Read", `memory/insights.md · ${Math.max(1, tr.turn - 1)} lessons`, between(30, 80));
  add(0, "agent.tool_use", "tool", "Read", "model.py", between(25, 60));
  add(0, "agent.thinking", "llm", "thinking", "ranking untried ideas against the last 15 turns…", between(6000, 14000), { tokIn: between(9000, 16000), tokOut: between(600, 1600) });
  add(0, "agent.message", "llm", "hypothesis", tr.hypothesis, between(1200, 2600), { tokIn: between(200, 600), tokOut: between(60, 140) });
  add(1, "agent.thinking", "llm", "thinking", "smallest edit that tests exactly one idea…", between(3000, 7000), { tokIn: between(11000, 17000), tokOut: between(300, 900) });
  add(1, "agent.tool_use", "tool", "Edit", `model.py  +${plus} −${minus}`, between(40, 90));

  const loopIdx = add(2, "agent.tool_use", "tool", "Bash", `loop.py "${tr.hypothesis.slice(0, 48)}…"`, 0);
  t = ev[loopIdx].offsetMs + 60;
  const loopStart = ev[loopIdx].offsetMs;
  add(2, "guard.diff_check", "guard", "diff", "only model.py changed · harness-v1 intact", between(20, 40), { depth: 1 });
  add(2, "guard.import_scan", "guard", "imports", "⊂ allowlist · no locked/ or data refs", between(8, 20), { depth: 1 });
  const evalMs = Math.max(1200, tr.secs * 1000);
  tr.folds.forEach((f, k) => {
    add(2, "eval.fold", "eval", `fold ${k + 1}/5`, `train 80 → replay 20 · cost ${f ?? "–"}`, Math.round((evalMs / 5) * (0.8 + r() * 0.4)), { depth: 1 });
  });
  add(3, "guard.causality_cut", "guard", "cut-test", leak ? "unit 17: prefix changed after cut at cycle 64 ✗ LEAK" : "2 cuts × 100 engines · prefixes stable ✓", between(200, 600), { depth: 1, bad: leak });
  add(3, "eval.score", "eval", "score",
    tr.verdict === "baseline" ? `mean ${tr.mean} · sets the bar`
    : leak ? `not scored (leak) · would-be mean ${tr.mean}`
    : `mean ${tr.mean} vs best ${tr.bestBefore} · wins ${tr.wins ?? "–"}/5 → ${keepish ? "KEEP" : "REVERT"}`, between(10, 30), { depth: 1, bad: leak });
  if (keepish) add(4, "git.commit", "git", "commit", `${tr.verdict} ${pad(tr.turn)}: cost ${tr.mean}`, between(40, 90), { depth: 1 });
  else add(4, "git.checkout", "git", "checkout", "model.py reverted · row logged to results.tsv", between(30, 70), { depth: 1, bad: leak });
  ev[loopIdx].durMs = t - loopStart;
  add(4, "agent.thinking", "llm", "reflect", "what did this verdict teach us?", between(1500, 3200), { tokIn: between(12000, 18000), tokOut: between(150, 400) });
  add(4, "memory.append", "memory", "insights.md", tr.insight ?? `T${pad(tr.turn)} | ${tr.verdict}`, between(20, 50));
  add(4, "session.idle", "session", "end_turn", "stop_reason: end_turn", 0);

  const byStage = [0, 1, 2, 3, 4].map((s) => ev.filter((e) => e.stage === s).length);
  const seen = [0, 0, 0, 0, 0];
  const events: SimEvent[] = ev.map((e, i) => {
    const j = seen[e.stage]++;
    return { ...e, id: `${key}:${i}`, atMs: e.stage * STAGE_MS + (j / byStage[e.stage]) * STAGE_MS * 0.92 };
  });
  const s: SimSession = {
    events,
    totalMs: t,
    tokIn: events.reduce((a, e) => a + (e.tokIn ?? 0), 0),
    tokOut: events.reduce((a, e) => a + (e.tokOut ?? 0), 0),
  };
  sessionCache.set(key, s);
  return s;
}

/* -------------------------------------------------------------- sim clock */

interface SimState {
  familyId: FamilyId;
  turnIdx: number;
  t: number; // ms into the current turn (sim time)
  playing: boolean;
  speed: 1 | 4;
  pinned: number | null; // session pinned in the observability rail
  setFamily: (f: FamilyId) => void;
  togglePlaying: () => void;
  toggleSpeed: () => void;
  jumpTo: (i: number) => void;
  pin: (i: number | null) => void;
  tick: (dt: number) => void;
}

export const useSim = create<SimState>((set, get) => ({
  familyId: "ge90",
  turnIdx: 0,
  t: 0,
  playing: true,
  speed: 1,
  pinned: null,
  setFamily: (f) => {
    if (get().familyId !== f) set({ familyId: f, turnIdx: 0, t: 0, pinned: null });
  },
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  toggleSpeed: () => set((s) => ({ speed: s.speed === 1 ? 4 : 1 })),
  jumpTo: (i) => {
    const n = getRun(get().familyId).length;
    set({ turnIdx: ((i % n) + n) % n, t: 0, pinned: null });
  },
  pin: (i) => set({ pinned: i }),
  tick: (dt) =>
    set((s) => {
      let t = s.t + dt * s.speed;
      let turnIdx = s.turnIdx;
      if (t >= TURN_MS) {
        t = 0;
        turnIdx = (turnIdx + 1) % getRun(s.familyId).length;
      }
      return { t, turnIdx };
    }),
}));

let clockStarted = false;
/** Starts the shared sim clock once (idempotent across panels / StrictMode). */
export function useSimClock() {
  useEffect(() => {
    if (clockStarted) return;
    clockStarted = true;
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(500, now - last);
      last = now;
      const s = useSim.getState();
      if (s.playing) s.tick(dt);
    }, 110);
  }, []);
}

/** Derived view of the clock for the current turn. */
export function stageOf(t: number) {
  const stage = Math.min(STAGES.length - 1, Math.floor(t / STAGE_MS));
  const done = t >= STAGES.length * STAGE_MS;
  const stageP = done ? 1 : (t - stage * STAGE_MS) / STAGE_MS;
  return { stage, stageP, done };
}

export const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${n}`);
export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

export const SIM_CSS = `
@keyframes jf-in { from { opacity: 0; transform: translateY(3px) } to { opacity: 1; transform: none } }
.jf-in { animation: jf-in .28s ease-out both }
@keyframes jf-flow { from { left: -30% } to { left: 100% } }
.jf-flow { animation: jf-flow .9s linear infinite }
@keyframes jf-stamp { 0% { opacity: 0; transform: rotate(-9deg) scale(1.9) } 60% { opacity: 1; transform: rotate(-9deg) scale(.94) } 100% { opacity: 1; transform: rotate(-9deg) scale(1) } }
.jf-stamp { animation: jf-stamp .45s cubic-bezier(.2,.9,.3,1.2) both }
@keyframes jf-caret { 50% { opacity: 0 } }
.jf-caret { animation: jf-caret .8s steps(1) infinite }
@keyframes jf-glow { 0%,100% { box-shadow: 0 6px 18px color-mix(in srgb, var(--color-fyre) 28%, transparent) } 50% { box-shadow: 0 8px 28px color-mix(in srgb, var(--color-violet) 38%, transparent) } }
@keyframes jf-shim { from { background-position: -200% 0 } to { background-position: 200% 0 } }
.jf-shimmer { background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-fyre) 14%, transparent), transparent); background-size: 200% 100%; animation: jf-shim 1.4s linear infinite }
.jf-glow { animation: jf-glow 1.6s ease-in-out infinite }
@keyframes jf-spin { to { transform: rotate(360deg) } }
.jf-spin { animation: jf-spin 6s linear infinite; transform-origin: center; transform-box: fill-box }
`;
