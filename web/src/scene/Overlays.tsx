import { useEffect, useState } from "react";
import { engineById, FAMILIES, PLANES, planeById } from "../data/fleet";
import { TOUR_MS, useUI } from "../store";
import type { EngineStatus, Plane } from "../types";
import { NEON } from "./palette";

const RANK: Record<EngineStatus, number> = { ok: 0, watch: 1, pull: 2 };
const worst = (p: Plane): EngineStatus => p.engines.reduce<EngineStatus>((w, e) => (RANK[e.status] > RANK[w] ? e.status : w), "ok");
const LABEL: Record<EngineStatus, string> = { ok: "All OK", watch: "Watch", pull: "Pull" };

const STATUS_WORD: Record<EngineStatus, string> = { ok: "OK", watch: "WATCH", pull: "PULL" };

/** Re-render on a short tick while the tour is running or paused (for the progress bar and countdown). */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function TourControl() {
  const tour = useUI((s) => s.tour);
  const phase = useUI((s) => s.tourPhase);
  const started = useUI((s) => s.phaseStartedAt);
  const resumeAt = useUI((s) => s.resumeAt);
  const setTour = useUI((s) => s.setTour);
  const now = useNow(tour !== "off");
  const progress = tour === "on" ? Math.min(1, (now - started) / TOUR_MS[phase]) : 0;
  const secs = resumeAt ? Math.max(0, Math.ceil((resumeAt - now) / 1000)) : 0;
  const label =
    tour === "on" ? `Tour · ${phase === "intro" ? "aircraft" : phase === "focus" ? "worst engine" : "next"}` : tour === "paused" ? `Paused · resumes in ${secs}s` : "Tour";
  return (
    <>
      {tour === "on" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-[3px] bg-line">
          <div className="bg-gradient-fyre h-full transition-[width] duration-100 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <button
        onClick={() => setTour(tour !== "on")}
        title={tour === "on" ? "Pause the guided tour" : "Start the guided tour"}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold shadow-[0_1px_2px_#0206172e] transition ${
          tour === "on" ? "bg-gradient-fyre border-transparent text-white" : "border-line bg-panel/90 text-ink hover:border-fyre hover:text-fyre"
        }`}
      >
        <span className="text-[11px]">{tour === "on" ? "❚❚" : "▶"}</span>
        {label}
      </button>
    </>
  );
}

function FocusCaption() {
  const show = useUI((s) => s.tour === "on" && s.tourPhase === "focus" && s.engineId !== null);
  const engineId = useUI((s) => s.engineId);
  const e = show && engineId ? engineById(engineId) : null;
  if (!e) return null;
  return (
    <div className="pointer-events-none absolute right-5 top-[60px] z-40 whitespace-nowrap rounded-full border border-line bg-panel/90 px-4 py-2 text-[14px] text-ink shadow-[0_10px_28px_#02061766]">
      <span className="text-muted">Most severe:</span> <span className="font-semibold">{e.label}</span>
      <span className="text-dim"> · </span>
      <span className="font-display font-bold tabular-nums" style={{ color: NEON[e.status] }}>
        {e.rul} cyc
      </span>
      <span className="text-dim"> · </span>
      <span className="font-semibold" style={{ color: NEON[e.status] }}>
        {STATUS_WORD[e.status]}
      </span>
    </div>
  );
}

function PlaneCard({ p, active, onClick }: { p: Plane; active: boolean; onClick: () => void }) {
  const w = worst(p);
  return (
    <button
      onClick={onClick}
      className={`min-w-[140px] flex-1 rounded-[14px] border bg-panel/90 px-3.5 py-2.5 text-left transition-all duration-300 ${
        active ? "-translate-y-0.5 border-fyre shadow-[0_0_0_3px_#2563eb1f,0_10px_26px_#02061747]" : "border-line shadow-[0_1px_2px_#0206172e,0_4px_14px_#0206172e] hover:border-line2"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-display text-[17px] font-bold tracking-tight ${active ? "text-gradient" : "text-ink"}`}>{p.short}</span>
        <span className="text-[13px] font-semibold" style={{ color: NEON[w] }}>
          {LABEL[w]}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {p.engines.map((e) => (
          <span
            key={e.id}
            className={`h-2.5 w-2.5 rounded-full ${e.status === "pull" ? "pulse-dot" : ""}`}
            style={{ background: NEON[e.status] }}
          />
        ))}
        <span className="ml-auto text-[13px] font-medium text-dim">{p.tail}</span>
      </div>
    </button>
  );
}

export default function Overlays() {
  const planeId = useUI((s) => s.planeId);
  const engineId = useUI((s) => s.engineId);
  const autoRotate = useUI((s) => s.autoRotate);
  const setPlane = useUI((s) => s.setPlane);
  const selectEngine = useUI((s) => s.selectEngine);
  const toggleAutoRotate = useUI((s) => s.toggleAutoRotate);
  const plane = planeById(planeId);
  const fam = FAMILIES[plane.family];
  const engine = engineId ? engineById(engineId) : null;

  return (
    <>
      {/* top-left: aircraft identity */}
      <div className="pointer-events-none absolute left-5 top-5 z-30 max-w-[62%]">
        <div className="text-[13px] font-medium text-muted">
          {plane.tail} · {plane.route}
        </div>
        <div className="mt-0.5 font-display text-[26px] font-bold leading-tight tracking-tight text-ink">{plane.type}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold ${
              fam.live ? "bg-gradient-fyre text-white shadow-[0_6px_16px_#2563eb33]" : "border border-line bg-panel/90 text-muted"
            }`}
          >
            {fam.live && <span className="pulse-dot h-2 w-2 rounded-full bg-panel/90" />}
            {fam.live ? "Live · C-MAPSS FD001" : "Simulated"}
          </span>
          <span className="rounded-full border border-line bg-panel/90 px-3 py-1 text-[12.5px] font-medium text-ink/80">
            {plane.engineCount} × {fam.name} · {fam.thrust}
          </span>
        </div>
        {engine && (
          <div className="pointer-events-auto mt-2.5 flex items-center gap-3">
            <button
              onClick={() => selectEngine(null)}
              className="rounded-full border border-line bg-panel/90 px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-[0_6px_18px_#02061747] transition hover:border-fyre hover:text-fyre"
            >
              ← Back to aircraft <span className="ml-1 font-normal text-dim">Esc</span>
            </button>
            <span className="text-[13px] text-muted">
              {plane.short} <span className="text-dim">›</span> <span className="font-semibold text-fyre">{engine.label}</span>
            </span>
          </div>
        )}
      </div>

      {/* top-right: one hint line + auto-rotate */}
      <div className="absolute right-5 top-5 z-30 flex items-center gap-2">
        <TourControl />
        <span className="hidden rounded-full border border-line bg-panel/85 px-3 py-1 text-[12.5px] text-muted shadow-[0_1px_2px_#0206172e] xl:inline">
          Drag to rotate · scroll to zoom · click an engine
        </span>
        <button
          onClick={toggleAutoRotate}
          title="Auto-rotate"
          className={`grid h-8 w-8 place-items-center rounded-full border bg-panel/90 text-[15px] shadow-[0_1px_2px_#0206172e] transition ${
            autoRotate ? "border-fyre text-fyre" : "border-line text-dim hover:text-ink"
          }`}
        >
          ⟳
        </button>
      </div>

      <FocusCaption />

      {/* bottom: plane switcher */}
      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#e6ebf2] via-[#e6ebf2cc] to-transparent px-5 pb-4 pt-8">
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {PLANES.map((p) => (
            <PlaneCard key={p.id} p={p} active={p.id === planeId} onClick={() => setPlane(p.id)} />
          ))}
        </div>
      </div>
    </>
  );
}
