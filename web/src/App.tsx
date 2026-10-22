import { useEffect } from "react";
import AgentCluster from "./panels/AgentCluster";
import Observability from "./panels/Observability";
import FleetScene from "./scene/FleetScene";
import { PLANES, PULL_T } from "./data/fleet";
import run from "./data/run.json";
import type { RunData } from "./types";
import { startTourDriver } from "./store";

const RUN = run as RunData;

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="bg-gradient-fyre absolute -inset-1 rounded-xl opacity-60 blur-md" />
        <svg viewBox="0 0 32 32" className="relative h-11 w-11">
          <defs>
            <linearGradient id="jf-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#67e8f9" />
              <stop offset=".4" stopColor="#38bdf8" />
              <stop offset=".7" stopColor="#6366f1" />
              <stop offset="1" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8" fill="#13213f" />
          <g className="origin-center animate-[spin_6s_linear_infinite]" style={{ transformBox: "fill-box" }}>
            <circle cx="16" cy="16" r="9" fill="none" stroke="url(#jf-g)" strokeWidth="2.6" />
            <g stroke="url(#jf-g)" strokeWidth="2" strokeLinecap="round">
              <path d="M16 9v14M9 16h14M11 11l10 10M21 11 11 21" />
            </g>
          </g>
          <circle cx="16" cy="16" r="2.6" fill="#fff" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="font-display text-[24px] font-bold tracking-tight">
          <span className="text-ink">Jet</span>
          <span className="text-gradient">Fyre</span>
        </div>
        <div className="text-[13px] text-muted">
          Early is wasted engine life. <span className="text-gradient font-semibold">Late is a grounded aircraft.</span>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, glow }: { label: string; value: string; tone?: string; glow?: string }) {
  return (
    <div className={`card flex flex-col px-3.5 py-1.5 ${glow ?? ""}`}>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-dim">{label}</span>
      <span className={`font-display text-[18px] font-bold leading-tight ${tone ?? "text-ink"}`}>{value}</span>
    </div>
  );
}

export default function App() {
  useEffect(() => startTourDriver(), []);
  const engines = PLANES.flatMap((p) => p.engines);
  const pull = engines.filter((e) => e.status === "pull").length;
  const base = RUN.rows.find((r) => r.verdict === "baseline")?.mean_cost ?? null;
  const best = RUN.best?.mean_cost ?? null;
  const turns = RUN.rows.length;
  const kept = RUN.rows.filter((r) => r.verdict === "keep").length;
  const drop = base && best ? Math.round((1 - best / base) * 100) : null;

  return (
    <div className="theme-navy grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="relative flex flex-wrap items-center justify-between gap-3 theme-navy border-b border-line px-5 py-3">
        <div className="bg-gradient-fyre absolute inset-x-0 bottom-0 h-px opacity-70" />
        <Logo />
        <div className="flex flex-wrap items-center gap-2">
          <Kpi label="Pull now" value={`${pull}`} tone="text-pull" glow={pull ? "glow-fyre" : ""} />
          <Kpi label="Pull threshold T" value={`${PULL_T} cyc`} tone="text-violet" />
          <Kpi
            label="Cost / engine"
            value={base != null && best != null ? `${base.toFixed(1)} → ${best.toFixed(1)}${drop != null ? `  −${drop}%` : ""}` : "—"}
            tone="text-gradient"
            glow="glow-fyre"
          />
          <Kpi label="Turns · kept" value={`${turns} · ${kept}`} tone="text-magenta" />
          <Kpi label="Run to failure" value="0 / 100" tone="text-ok" />
          <span className="border-gradient ml-1 flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold">
            <span className="pulse-dot bg-gradient-fyre h-2 w-2 rounded-full" />
            <span className="text-gradient">FD001 loop · live replay</span>
          </span>
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(440px,1fr)]">
        <section className="relative h-[62vh] min-h-0 border-b border-line lg:h-auto lg:border-r lg:border-b-0">
          <FleetScene />
        </section>
        <section className="theme-navy grid min-h-0 grid-rows-[minmax(0,1.08fr)_minmax(0,1fr)]">
          <div className="min-h-[420px] border-b border-line lg:min-h-0">
            <AgentCluster />
          </div>
          <div className="min-h-[420px] lg:min-h-0">
            <Observability />
          </div>
        </section>
      </main>
    </div>
  );
}
