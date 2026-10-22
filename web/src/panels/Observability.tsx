import { useEffect, useRef, useState } from "react";
import { FAMILIES } from "../data/fleet";
import {
  C, GRAD_FYRE, SIM_CSS, fmtK, fmtMs, getRun, getSession, grad, isLiveRun, pad, stageOf, tint, useSim, useSimClock,
  verdictMeta, type EventKind, type SimEvent, type SimTurn,
} from "../sim/agents";
import { useActiveFamily } from "../store";

const KIND: Record<EventKind, { color: string; bar: string }> = {
  session: { color: C.dim, bar: grad(C.line2, C.dim) },
  llm: { color: C.magenta, bar: grad(C.violet, C.magenta) },
  tool: { color: C.cyan, bar: grad(C.sky, C.cyan) },
  guard: { color: C.watch, bar: grad(C.watch, C.fyre2) },
  eval: { color: C.fyre, bar: grad(C.cyan, C.fyre, C.violet) },
  git: { color: C.lime, bar: grad(C.lime, C.ok) },
  memory: { color: C.sky, bar: grad(C.sky, C.violet) },
};

/** "agent.tool_use" → "tool_use": the pill colour already says which category it is. */
const shortType = (t: string) => t.split(".").pop() ?? t;

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card min-w-0 px-4 py-3">
      <div className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-dim">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-display text-[26px] font-semibold leading-none" style={{ color: color ?? C.ink }}>{value}</span>
        {sub && <span className="truncate text-[12px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}

function Pill({ verdict }: { verdict: string }) {
  const m = verdictMeta(verdict);
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ color: m.hex, background: tint(m.hex, 11) }}>
      {m.label.charAt(0) + m.label.slice(1).toLowerCase()}
    </span>
  );
}

function stdoutJson(tr: SimTurn) {
  return JSON.stringify({
    turn: tr.turn, verdict: tr.verdict, mean_cost: tr.mean, best_before: tr.bestBefore, fold_costs: tr.folds,
    wins: tr.wins ?? "", fails: tr.fails, waste: tr.waste, secs: tr.secs,
  }).replace(/,"/g, ', "').replace(/":/g, '": ');
}

function TraceRow({ e, total, running, open, onToggle }: { e: SimEvent; total: number; running: boolean; open: boolean; onToggle: () => void }) {
  const k = KIND[e.kind];
  const color = e.bad ? C.pull : k.color;
  const left = Math.min((e.offsetMs / total) * 100, 99);
  const width = Math.min(Math.max(1.5, (e.durMs / total) * 100), 100 - left);
  return (
    <button onClick={onToggle}
      className={`jf-in relative block w-full border-b border-line px-3 pt-2 pb-2.5 text-left transition-colors ${open ? "bg-fyre/[0.04]" : "hover:bg-panel2"}`}>
      <div className="flex min-h-[22px] items-center gap-2.5">
        <span className="w-[52px] shrink-0 font-mono text-[12px] text-dim">+{fmtMs(e.offsetMs)}</span>
        <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[12px] font-medium" style={{ color, background: tint(color, 10) }}>
          {e.depth > 0 ? "└ " : ""}{shortType(e.type)}
        </span>
        <span className={`min-w-0 truncate text-[13px] ${e.bad ? "font-medium text-pull" : "text-ink"}`}>
          <b className="font-semibold">{e.label}</b> <span className="text-muted">{e.payload}</span>
        </span>
        {running && <span className="pulse-dot ml-auto h-2 w-2 shrink-0 rounded-full bg-fyre" />}
        <span className="ml-auto shrink-0 font-mono text-[12px] text-dim">{fmtMs(e.durMs)}</span>
      </div>
      {open && (
        <div className="mt-1.5 rounded-lg bg-panel2 px-3 py-2 text-[12px] leading-relaxed text-muted ring-1 ring-line">
          <div className="font-mono text-ink">{e.type}</div>
          <div className="break-words">{e.payload}</div>
          {(e.tokIn || e.tokOut) && (
            <div className="mt-1 font-mono">tokens {fmtK(e.tokIn ?? 0)} in · {fmtK(e.tokOut ?? 0)} out</div>
          )}
        </div>
      )}
      <span className="absolute inset-x-3 bottom-1 h-[3px] rounded-full bg-panel2">
        <span className={`absolute inset-y-0 rounded-full ${running ? "jf-shimmer" : ""}`}
          style={{ left: `${left}%`, width: `${width}%`, background: e.bad ? grad(C.pull, C.watch) : k.bar }} />
      </span>
    </button>
  );
}

export default function Observability() {
  useSimClock();
  const fam = useActiveFamily();
  const setFamily = useSim((s) => s.setFamily);
  useEffect(() => setFamily(fam), [fam, setFamily]);
  const { familyId, turnIdx, t, pinned, pin, playing } = useSim();
  const [showStdout, setShowStdout] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const family = FAMILIES[familyId];
  const live = isLiveRun(familyId);
  const run = getRun(familyId);
  const idx = Math.min(turnIdx, run.length - 1);
  const { stage, done } = stageOf(t);
  const selIdx = pinned != null && pinned <= idx ? pinned : idx;
  const tr = run[selIdx];
  const sess = getSession(familyId, tr);
  const following = selIdx === idx;
  const events = following ? sess.events.filter((e) => e.atMs <= t) : sess.events;
  const running = following && !done;

  const finished = run.slice(0, done ? idx + 1 : idx);
  const scored = finished.filter((r) => r.verdict !== "baseline");
  const kept = scored.filter((r) => r.verdict === "keep").length;
  const trips = finished.filter((r) => ["leak", "violation", "timeout", "error"].includes(r.verdict)).length;
  const durs = finished.map((r) => getSession(familyId, r).totalMs).sort((a, b) => a - b);
  const p50 = durs.length ? durs[Math.floor(durs.length / 2)] : 0;

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (following && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [events.length, following, selIdx]);

  const keepish = tr.verdict === "keep" || tr.verdict === "baseline";

  return (
    <div className="@container flex h-full min-h-0 flex-col gap-3 p-4">
      <style>{SIM_CSS}</style>

      {/* header */}
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-semibold text-ink">Observability</h2>
          <div className="truncate text-[13px] text-muted">{family.name} · agent sessions and traces{live ? "" : " · simulated"}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${playing ? "bg-ok/10 text-ok" : "bg-panel2 text-dim"}`}>
            <span className={`h-2 w-2 rounded-full ${playing ? "pulse-dot bg-ok" : "bg-dim"}`} />
            {playing ? "Streaming" : "Paused"}
          </span>
          <button onClick={() => setShowStdout((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 font-mono text-[12px] font-semibold transition ${showStdout ? "border-fyre/40 bg-fyre/10 text-fyre" : "border-line bg-panel text-muted hover:text-ink"}`}>
            stdout
          </button>
        </div>
      </div>

      {/* 4 tiles */}
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
        <Tile label="Turns" value={`${idx + 1}`} sub={`of ${run.length}`} color={C.fyre} />
        <Tile label="Keep rate" value={scored.length ? `${Math.round((kept / scored.length) * 100)}%` : "–"} sub={`${kept} kept`} color={C.ok} />
        <Tile label="Guard trips" value={`${trips}`} sub={trips === 1 ? "leak caught" : "caught"} color={trips ? C.pull : C.ink} />
        <Tile label="p50 turn" value={p50 ? fmtMs(p50) : "–"} sub="per turn" color={C.violet} />
      </div>

      {/* sessions | trace */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(150px,32%)_minmax(0,1fr)] gap-3">
        <div className="card flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="font-display text-[15px] font-semibold">Sessions</span>
            <span className="text-[12px] text-dim">{idx + 1}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {run.slice(0, idx + 1).map((_, i) => i).reverse().map((i) => {
              const r = run[i];
              const isRunning = i === idx && !done;
              const sel = i === selIdx;
              return (
                <button key={`${familyId}-${i}`} onClick={() => pin(i === idx ? null : i)}
                  className={`jf-in relative flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left transition-colors ${sel ? "bg-fyre/[0.05]" : "hover:bg-panel2"}`}>
                  {sel && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: GRAD_FYRE }} />}
                  <div className="min-w-0 flex-1">
                    <div className={`font-mono text-[13px] ${sel ? "font-semibold text-ink" : "text-muted"}`}>turn-{pad(r.turn)}</div>
                    <div className="font-mono text-[12px] text-dim">{isRunning ? "running…" : fmtMs(getSession(familyId, r).totalMs)}</div>
                  </div>
                  {isRunning ? (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-fyre/10 px-2 py-0.5 text-[12px] font-semibold text-fyre">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-fyre" />Live
                    </span>
                  ) : (
                    <Pill verdict={r.verdict} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
            <span className="font-mono text-[14px] font-semibold text-ink">turn-{pad(tr.turn)}</span>
            {running ? (
              <span className="rounded-full bg-fyre/10 px-2 py-0.5 text-[12px] font-semibold text-fyre">Running</span>
            ) : (
              <Pill verdict={tr.verdict} />
            )}
            <span className="truncate text-[12px] text-dim">{events.length} of {sess.events.length} events · {fmtMs(sess.totalMs)}</span>
            {!following && (
              <button onClick={() => pin(null)} className="ml-auto shrink-0 rounded-lg bg-fyre px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-fyre/90">
                Follow live
              </button>
            )}
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
            {events.map((e, i) => (
              <TraceRow key={e.id} e={e} total={sess.totalMs} running={running && i === events.length - 1}
                open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
            ))}
            {running && <div className="jf-shimmer mx-3 my-2 h-4 rounded-md" />}
          </div>
          {showStdout && (
            <div className="jf-in shrink-0 border-t border-line bg-[#0b1530] px-4 py-2.5 font-mono text-[12px] leading-relaxed text-slate-200">
              <div className="mb-1 flex justify-between text-slate-400">
                <span>stdout · loop.py</span>
                <span>{live ? "real values from results.tsv" : "simulated"}</span>
              </div>
              {(!following || stage >= 2 || done) && <div className="truncate" title={tr.hypothesis}><span className="text-cyan-300">$</span> .venv/bin/python loop.py "{tr.hypothesis}"</div>}
              {(!following || stage >= 3 || done) && <div className="truncate text-slate-300" title={stdoutJson(tr)}>{stdoutJson(tr)}</div>}
              {(!following || stage >= 4 || done) && (
                <div className="truncate font-semibold" style={{ color: `color-mix(in srgb, ${verdictMeta(tr.verdict).hex} 55%, white)` }}>
                  [{tr.verdict.toUpperCase()}] {pad(tr.turn)} · cost {tr.mean}
                  {keepish && tr.bestBefore != null ? ` (was ${tr.bestBefore})` : !keepish ? ` vs best ${tr.bestBefore ?? "–"}` : ""}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
