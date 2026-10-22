import { useEffect, useRef, useState, type ReactNode } from "react";
import { FAMILIES, engineById, planeById } from "../data/fleet";
import {
  C, GRAD_FYRE, SIM_CSS, STAGES, getRun, isLiveRun, mix, pad, stageOf, synthDiff, tint, useSim, useSimClock, verdictMeta,
  type SimTurn,
} from "../sim/agents";
import { useActiveFamily, useUI } from "../store";

type AgentStatus = "thinking" | "running" | "idle" | "blocked" | "done";

/** One-line card captions; the full deck wording is in the tooltip. */
const SHORT = ["Read the log, write one idea", "Change model.py only", "Train 4 folds, replay the 5th", "Failures first, then waste", "Commit if it wins 4 of 5"];

const AGENTS = [
  { key: "researcher", name: "Researcher", role: "LLM · writes the hypothesis", glyph: "◎", color: C.magenta },
  { key: "engineer", name: "Engineer", role: "LLM · edits model.py", glyph: "✎", color: C.violet },
  { key: "evaluator", name: "Evaluator", role: "harness · evaluate.py replay", glyph: "▶", color: C.cyan },
  { key: "guard", name: "Guard", role: "harness · causality, budget, diff", glyph: "⛨", color: C.watch },
  { key: "archivist", name: "Archivist", role: "git · results.tsv · memory", glyph: "⎘", color: C.lime },
] as const;

function agentView(key: string, tr: SimTurn, stage: number, stageP: number, done: boolean): { status: AgentStatus; line: string; live: boolean } {
  const leak = tr.verdict === "leak";
  const keepish = tr.verdict === "keep" || tr.verdict === "baseline";
  const diff = synthDiff(tr.hypothesis).find((d) => d.s === "+")?.t ?? "model.py";
  const foldK = Math.min(5, Math.floor(stageP * 5) + 1);
  switch (key) {
    case "researcher":
      return { status: stage === 0 && !done ? "thinking" : "done", line: tr.hypothesis, live: stage === 0 && !done };
    case "engineer":
      if (stage < 1) return { status: "idle", line: "Waiting for a hypothesis", live: false };
      return { status: stage === 1 && !done ? "thinking" : "done", line: `model.py → ${diff}`, live: stage === 1 && !done };
    case "evaluator":
      if (stage < 2) return { status: "idle", line: "Waiting for the edit", live: false };
      if (stage === 2 && !done) return { status: "running", line: `Fold ${foldK} of 5 · train on 80 engines, replay 20 · cost ${tr.folds[foldK - 1] ?? "–"}`, live: false };
      return { status: "done", line: `5 folds replayed · mean cost ${tr.mean ?? "–"} · ${tr.secs}s CPU`, live: false };
    case "guard":
      if (stage < 2) return { status: "idle", line: "locked/ denied · harness pinned", live: false };
      if (stage === 2 && !done) return { status: "running", line: "Only model.py changed ✓ · imports allowed ✓ · 60 s budget armed", live: true };
      if (leak) return { status: "blocked", line: "Cut-test failed: earlier predictions changed. Leak caught, turn rejected.", live: stage === 3 && !done };
      return { status: stage === 3 && !done ? "running" : "done", line: `Cut-test passed: predictions never peek ahead · ${tr.secs}s < 60s`, live: stage === 3 && !done };
    default: {
      if (stage < 4) return { status: "idle", line: "results.tsv · insights.md · git", live: false };
      const line = keepish
        ? `git commit · best cost ${tr.bestBefore ?? "–"} → ${tr.mean}`
        : `git checkout model.py · ${tr.verdict} logged to results.tsv`;
      return { status: done ? "done" : "running", line: tr.insight && done ? `${line} · lesson saved to memory` : line, live: !done };
    }
  }
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function IconBtn({ onClick, title, children, active }: { onClick: () => void; title: string; children: ReactNode; active?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={`grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-[13px] font-semibold transition ${
        active ? "border-fyre/40 bg-fyre/10 text-fyre" : "border-line bg-panel text-muted hover:border-fyre/40 hover:text-fyre"
      }`}>
      {children}
    </button>
  );
}

const Icon = {
  prev: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M5 4h2v12H5zM16 4v12L8 10z" /></svg>,
  next: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M13 4h2v12h-2zM4 4v12l8-6z" /></svg>,
  play: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M6 4v12l10-6z" /></svg>,
  pause: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" /></svg>,
};

function CostCurve({ run, idx }: { run: SimTurn[]; idx: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 190;
  const pl = 36, pr = 10, pt = 14, pb = 26;
  const base = run[0]?.mean ?? 40;
  const yMax = Math.ceil((base * 1.22) / 5) * 5;
  const n = Math.max(2, run.length);
  const x = (i: number) => pl + (i / (n - 1)) * (w - pl - pr);
  const y = (v: number) => pt + (1 - Math.min(v, yMax) / yMax) * (H - pt - pb);
  const shown = run.slice(0, idx + 1);
  let best = Infinity;
  const steps: [number, number][] = [];
  shown.forEach((r, i) => {
    if ((r.verdict === "keep" || r.verdict === "baseline") && r.mean != null) best = Math.min(best, r.mean);
    if (best < Infinity) steps.push([i, best]);
  });
  const path = steps.map(([i, b], k) => (k === 0 ? `M${x(i)},${y(b)}` : `H${x(i)}V${y(b)}`)).join("");
  const area = steps.length ? `${path}H${x(steps.at(-1)![0])}V${H - pb}H${x(steps[0][0])}Z` : "";
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={H} className="block">
        <defs>
          <linearGradient id="jf-best" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={pt} y2={H - pb}>
            <stop offset="0" style={{ stopColor: C.fyre, stopOpacity: 0.22 }} />
            <stop offset="1" style={{ stopColor: C.violet, stopOpacity: 0 }} />
          </linearGradient>
          <linearGradient id="jf-line" gradientUnits="userSpaceOnUse" x1={pl} x2={w - pr} y1="0" y2="0">
            <stop offset="0" style={{ stopColor: C.cyan }} />
            <stop offset="0.5" style={{ stopColor: C.fyre }} />
            <stop offset="1" style={{ stopColor: C.violet }} />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pl} x2={w - pr} y1={y(yMax * f)} y2={y(yMax * f)} style={{ stroke: C.line }} />
            <text x={pl - 8} y={y(yMax * f) + 4} textAnchor="end" className="fill-dim font-mono text-[12px]">{Math.round(yMax * f)}</text>
          </g>
        ))}
        <line x1={pl} x2={w - pr} y1={y(base)} y2={y(base)} style={{ stroke: C.dim }} strokeDasharray="4 5" />
        <text x={w - pr} y={y(base) - 6} textAnchor="end" className="fill-muted text-[12px]">baseline {base}</text>
        {area && <path d={area} fill="url(#jf-best)" />}
        {path && <path d={path} fill="none" stroke="url(#jf-line)" strokeWidth="3" strokeLinejoin="round" />}
        {shown.map((r, i) =>
          r.mean == null ? null : (
            <g key={i}>
              {i === idx && <circle cx={x(i)} cy={y(r.mean)} r={11} style={{ fill: verdictMeta(r.verdict).hex }} fillOpacity="0.18" className="pulse-dot" />}
              <circle cx={x(i)} cy={y(r.mean)} r={i === idx ? 6 : 4.5} style={{ fill: verdictMeta(r.verdict).hex, stroke: "var(--color-panel)" }}
                fillOpacity={r.verdict === "discard" ? 0.6 : 1} strokeWidth="2" />
            </g>
          ),
        )}
        <text x={pl} y={H - 6} className="fill-dim text-[12px]">turn 0</text>
        <text x={w - pr} y={H - 6} textAnchor="end" className="fill-dim text-[12px]">turn {run.length - 1}</text>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        {(["keep", "discard", "leak"] as const).map((v) => (
          <span key={v} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: verdictMeta(v).hex }} />
            {verdictMeta(v).label.toLowerCase()}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded" style={{ background: GRAD_FYRE }} />running best</span>
        <span className="text-dim">Cost per engine: pulled early = cycles of life left, failure = 500</span>
      </div>
    </div>
  );
}

function FoldBars({ tr, stage, stageP, done }: { tr: SimTurn; stage: number; stageP: number; done: boolean }) {
  const vals = [...tr.folds, ...(tr.bestFolds ?? [])].filter((v): v is number => v != null);
  const max = Math.max(1, ...vals) * 1.08;
  const shownN = stage > 2 || done ? 5 : stage === 2 ? Math.floor(stageP * 5.4) : 0;
  const scored = stage >= 3 || done;
  const leak = tr.verdict === "leak";
  const better = tr.mean != null && tr.bestBefore != null && tr.mean < tr.bestBefore;
  return (
    <div>
      <div className="space-y-2">
        {tr.folds.map((f, k) => {
          const b = tr.bestFolds?.[k] ?? null;
          const vis = k < shownN;
          const win = f != null && b != null && f < b;
          return (
            <div key={k} className="grid grid-cols-[52px_minmax(0,1fr)_118px] items-center gap-3">
              <span className="text-[12px] font-medium text-muted">Fold {k + 1}</span>
              <div className="relative h-3.5 rounded-full bg-panel2 ring-1 ring-line">
                {vis && f != null && (
                  <div className="jf-in absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{ width: `${(f / max) * 100}%`, background: leak ? C.pull : win || !b ? GRAD_FYRE : C.line2 }} />
                )}
                {b != null && <div className="absolute -inset-y-1 w-[3px] rounded bg-ink" style={{ left: `${(b / max) * 100}%` }} title={`best ${b}`} />}
              </div>
              <span className="text-right font-mono text-[13px]">
                <span className={vis ? "font-semibold text-ink" : "text-dim"}>{vis ? f ?? "–" : "···"}</span>
                {b != null && <span className="text-dim"> / {b}</span>}
                {vis && b != null && !leak && <span className={`ml-1.5 font-bold ${win ? "text-ok" : "text-pull"}`}>{win ? "✓" : "✗"}</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px] transition-opacity duration-300 ${scored ? "opacity-100" : "opacity-0"}`}>
        {tr.verdict === "baseline" ? (
          <span className="font-medium text-sky">Baseline sets the bar · mean cost {tr.mean}</span>
        ) : leak ? (
          <span className="font-medium text-pull">Never scored: the causality guard fired</span>
        ) : (
          <>
            <span className={`font-medium ${better ? "text-ok" : "text-pull"}`}>Mean {tr.mean} {better ? "<" : "≥"} best {tr.bestBefore}</span>
            <span className={`font-medium ${(tr.wins ?? 0) >= 4 ? "text-ok" : "text-pull"}`}>Wins {tr.wins ?? "–"} of 5 (need 4)</span>
          </>
        )}
        <span className="text-[12px] text-dim">ink line = current best</span>
      </div>
    </div>
  );
}

export default function AgentCluster() {
  useSimClock();
  const fam = useActiveFamily();
  const setFamily = useSim((s) => s.setFamily);
  useEffect(() => setFamily(fam), [fam, setFamily]);
  const { familyId, turnIdx, t, playing, speed, togglePlaying, toggleSpeed, jumpTo } = useSim();
  const planeId = useUI((s) => s.planeId);
  const engineId = useUI((s) => s.engineId);
  const [tab, setTab] = useState<"turn" | "history">("turn");

  const family = FAMILIES[familyId];
  const live = isLiveRun(familyId);
  const run = getRun(familyId);
  const idx = Math.min(turnIdx, run.length - 1);
  const tr = run[idx];
  const { stage, stageP, done } = stageOf(t);
  const plane = planeById(planeId);
  const engine = engineId ? engineById(engineId) : null;
  const vm = verdictMeta(tr.verdict);
  const stampOn = done || (stage === 4 && stageP > 0.25);
  const keepish = tr.verdict === "keep" || tr.verdict === "baseline";
  const activeIdx = done ? 4 : stage;
  const views = AGENTS.map((a) => agentView(a.key, tr, stage, stageP, done));
  const focus = AGENTS[activeIdx];
  const fv = views[activeIdx];
  const focusText = fv.live ? fv.line.slice(0, Math.ceil(fv.line.length * Math.min(1, stageP * 1.5))) : fv.line;
  const bestSoFar = run.slice(0, idx + 1).filter((r) => (r.verdict === "keep" || r.verdict === "baseline") && r.mean != null).reduce((m, r) => Math.min(m, r.mean!), Infinity);
  const base = run[0]?.mean ?? null;

  return (
    <div className="@container flex h-full min-h-0 flex-col gap-3 overflow-auto p-4">
      <style>{SIM_CSS}</style>

      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-dim">Autoresearch cluster</div>
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[18px] font-semibold text-ink">{family.name}</h2>
            {live ? (
              <span className="flex items-center gap-1.5 rounded-full bg-fyre/10 px-2.5 py-0.5 text-[12px] font-semibold text-fyre ring-1 ring-fyre/25">
                <span className="pulse-dot h-2 w-2 rounded-full bg-fyre" />LIVE
              </span>
            ) : (
              <span className="rounded-full bg-violet/10 px-2.5 py-0.5 text-[12px] font-semibold text-violet ring-1 ring-violet/25">SIMULATED</span>
            )}
          </div>
          <div className="truncate text-[12px] text-muted">
            {plane.short} {plane.tail} · {engine ? `${engine.label} · ${engine.serial}` : `${plane.engineCount} engines`} · {family.dataset}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="mr-1 text-[13px] text-muted">
            Turn <b className="font-mono text-[15px] text-ink">{idx + 1}</b> / {run.length}
          </span>
          <IconBtn onClick={() => jumpTo(idx - 1)} title="Previous turn">{Icon.prev}</IconBtn>
          <IconBtn onClick={togglePlaying} title={playing ? "Pause" : "Play"} active={playing}>{playing ? Icon.pause : Icon.play}</IconBtn>
          <IconBtn onClick={() => jumpTo(idx + 1)} title="Next turn">{Icon.next}</IconBtn>
          <IconBtn onClick={toggleSpeed} title="Playback speed" active={speed === 4}>{speed}×</IconBtn>
        </div>
      </div>

      {/* pipeline: the focal point */}
      <div className="card p-3">
        <div className="grid grid-cols-5 gap-2">
          {STAGES.map((s, i) => {
            const isActive = i === stage && !done;
            const isDone = i < stage || done;
            const title = i === 4 && isDone ? (keepish ? "Kept" : "Reverted") : s.label;
            return (
              <div key={s.key} title={`${s.label}: ${s.desc}`}
                className={`relative min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 transition-all duration-300 ${
                  isActive ? "bg-gradient-fyre jf-glow border-transparent text-white" : isDone ? "border-ok/25 bg-ok/[0.06]" : "border-line bg-panel2"
                }`}>
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[12px] font-semibold ${isActive ? "text-white/85" : "text-dim"}`}>0{i + 1}</span>
                  {isDone && <span className={`text-[13px] font-bold ${i === 4 && !keepish ? (tr.verdict === "leak" ? "text-pull" : "text-muted") : "text-ok"}`}>{i === 4 && !keepish ? "↺" : "✓"}</span>}
                </div>
                <div className={`truncate font-display text-[15px] font-semibold leading-tight ${isActive ? "text-white" : "text-ink"}`}>{title}</div>
                <div className={`mt-0.5 line-clamp-2 text-[12px] leading-snug ${isActive ? "text-white/85" : "text-muted"}`}>{SHORT[i]}</div>
                {isActive && <div className="absolute bottom-0 left-0 h-1 bg-white/70" style={{ width: `${stageP * 100}%` }} />}
              </div>
            );
          })}
        </div>

        {/* agents row + single callout */}
        <div className="mt-3 grid grid-cols-5 gap-2">
          {AGENTS.map((a, i) => {
            const v = views[i];
            const on = i === activeIdx;
            const dot = v.status === "blocked" ? C.pull : v.status === "done" ? C.ok : v.status === "idle" ? C.line2 : a.color;
            return (
              <div key={a.key} title={`${a.name} · ${a.role}`}
                className="flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-all duration-300"
                style={{ borderColor: on ? mix(a.color, 55) : C.line, background: on ? tint(a.color, 10) : C.panel }}>
                <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px]"
                  style={{ background: mix(a.color, on ? 22 : 12), color: a.color }}>
                  {a.glyph}
                  <span className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${v.status === "thinking" || v.status === "running" || v.status === "blocked" ? "pulse-dot" : ""}`}
                    style={{ background: dot }} />
                </span>
                <span className={`max-w-full truncate text-[12px] font-semibold ${on ? "text-ink" : "text-muted"}`}>{a.name}</span>
              </div>
            );
          })}
        </div>
        <div key={`${familyId}-${idx}-${activeIdx}`} className="jf-in mt-2.5 rounded-xl border-l-4 px-4 py-2.5"
          style={{ borderColor: fv.status === "blocked" ? C.pull : focus.color, background: tint(fv.status === "blocked" ? C.pull : focus.color, 7) }}>
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: fv.status === "blocked" ? C.pull : focus.color }}>
            {focus.name} · {fv.status}
            <span className="font-normal normal-case tracking-normal text-dim">{focus.role}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-ink" title={fv.line}>
            {focusText}
            {fv.live && <span className="jf-caret ml-0.5 inline-block h-[14px] w-[7px] translate-y-[2px]" style={{ background: focus.color }} />}
          </p>
        </div>
      </div>

      {/* turn | history */}
      <div className="card relative flex-1 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex rounded-lg bg-panel2 p-1 ring-1 ring-line">
            {(["turn", "history"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1 text-[13px] font-semibold transition ${tab === k ? "bg-panel text-ink shadow-sm ring-1 ring-line2" : "text-muted hover:text-ink"}`}>
                {k === "turn" ? "This turn" : "History"}
              </button>
            ))}
          </div>
          {tab === "turn" ? (
            <span className="font-mono text-[13px] text-muted">turn {pad(tr.turn)} · T = {tr.T ?? "–"}</span>
          ) : (
            <span className="text-[13px] text-muted">
              Best <b className="text-gradient font-display text-[20px]">{Number.isFinite(bestSoFar) ? bestSoFar.toFixed(2) : "–"}</b>
              {base && Number.isFinite(bestSoFar) && <span className="ml-1.5 font-semibold text-ok">−{Math.round((1 - bestSoFar / base) * 100)}%</span>}
            </span>
          )}
        </div>

        {tab === "turn" ? (
          <>
            <p className="mb-3 line-clamp-2 pr-28 text-[14px] leading-snug text-ink" title={tr.hypothesis}>“{tr.hypothesis}”</p>
            <FoldBars tr={tr} stage={stage} stageP={stageP} done={done} />
            {stampOn && (
              <div key={`${familyId}-${tr.turn}`}
                className="jf-stamp pointer-events-none absolute right-4 top-14 rounded-xl border-2 px-3 py-1 font-display text-[20px] font-bold tracking-[0.06em]"
                style={{ borderColor: vm.hex, color: vm.hex, background: tint(vm.hex, 8), boxShadow: `0 8px 24px ${mix(vm.hex, 25)}` }}>
                {vm.label}
              </div>
            )}
          </>
        ) : (
          <CostCurve run={run} idx={idx} />
        )}
      </div>
    </div>
  );
}
