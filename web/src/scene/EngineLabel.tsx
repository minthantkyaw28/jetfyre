import { FAMILIES, PULL_T, WATCH_BAND } from "../data/fleet";
import { useUI } from "../store";
import type { Engine } from "../types";
import { NEON as STATUS_COLOR } from "./palette";

const STATUS_TEXT = { ok: "OK", watch: "WATCH", pull: "PULL" } as const;
const ADVICE = {
  pull: "Pull at next overnight check",
  watch: "Borescope within 10 cycles",
  ok: "No action · keep flying",
} as const;

function Spark({ data, color, w, h, threshold }: { data: number[]; color: string; w: number; h: number; threshold?: number }) {
  const max = Math.max(...data, threshold ?? 0) * 1.05;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - (v / (max || 1)) * h;
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const gid = `g${color.slice(1)}${w}`;
  return (
    <svg width={w} height={h} className="block overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {threshold != null && (
        <line x1={0} x2={w} y1={y(threshold)} y2={y(threshold)} stroke={STATUS_COLOR.pull} strokeDasharray="3 3" strokeWidth={1} opacity={0.6} />
      )}
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.8} fill={color} />
    </svg>
  );
}

function Pill({ status, size = 13 }: { status: Engine["status"]; size?: number }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] font-semibold tracking-wide"
      style={{ color: c, background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}40`, fontSize: size }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${status === "pull" ? "pulse-dot" : ""}`} style={{ background: c }} />
      {STATUS_TEXT[status]}
    </span>
  );
}

function HealthBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full" style={{ width: `${Math.max(4, value * 100)}%`, background: color }} />
    </div>
  );
}

/** Collapsed engine card: ENG n + status, RUL, health bar, sparkline. Nothing else. */
export function CompactLabel({ engine, dim, hovered, dense = false }: { engine: Engine; dim: boolean; hovered: boolean; dense?: boolean }) {
  const selectEngine = useUI((s) => s.selectEngine);
  const hoverEngine = useUI((s) => s.hoverEngine);
  const c = STATUS_COLOR[engine.status];
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        selectEngine(engine.id);
      }}
      onPointerEnter={() => hoverEngine(engine.id)}
      onPointerLeave={() => hoverEngine(null)}
      className={`pointer-events-auto cursor-pointer select-none rounded-[10px] border bg-panel/85 backdrop-blur transition-all duration-300 ${
        dense ? "w-[112px] px-2 py-1.5" : "w-[126px] px-2.5 py-1.5"
      }`}
      style={{
        borderColor: hovered ? c : "var(--color-line2)",
        opacity: dim ? 0.12 : 1,
        transform: `translate(-50%, calc(-100% - 6px)) scale(${hovered ? 1.04 : 1})`,
        boxShadow: hovered ? `0 0 0 3px ${c}22, 0 8px 20px #02061766` : "0 1px 2px #0206172e, 0 6px 16px #02061747",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-[11px] font-bold tracking-tight text-ink">{engine.label}</span>
        <Pill status={engine.status} size={dense ? 9.5 : 10} />
      </div>
      <div className="mt-1 flex items-end justify-between gap-1.5">
        <div className="leading-none">
          <span className="font-display text-[17px] font-bold tabular-nums" style={{ color: c }}>
            {engine.rul}
          </span>
          <span className="ml-0.5 text-[10.5px] font-medium text-muted">cyc</span>
        </div>
        <Spark data={engine.rulTrend} color={c} w={dense ? 36 : 44} h={15} />
      </div>
      <div className="mt-1.5">
        <HealthBar value={engine.health} color={c} />
      </div>
    </div>
  );
}

export function Dossier({ engine }: { engine: Engine }) {
  const selectEngine = useUI((s) => s.selectEngine);
  const c = STATUS_COLOR[engine.status];
  const fam = FAMILIES[engine.family];
  const s = engine.sensors;
  const sensors: [string, string, string, string][] = [
    ["T24", s.T24.toFixed(1), "°R", "LPC outlet temp"],
    ["T30", s.T30.toFixed(0), "°R", "HPC outlet temp"],
    ["T50", s.T50.toFixed(0), "°R", "LPT outlet temp"],
    ["P30", s.P30.toFixed(1), "psia", "HPC outlet pressure"],
    ["Nf", s.Nf.toFixed(0), "rpm", "Fan speed"],
    ["Nc", s.Nc.toFixed(0), "rpm", "Core speed"],
    ["Ps30", s.Ps30.toFixed(2), "psia", "HPC static pressure"],
    ["phi", s.phi.toFixed(1), "", "Fuel flow / Ps30"],
  ];
  return (
    <div
      className="pointer-events-auto w-[352px] select-none rounded-[16px] border border-line bg-panel/90 p-4 text-[14px] text-ink"
      style={{ transform: "translate(70px, -55%)", boxShadow: `0 0 0 3px ${c}1a, 0 2px 4px #0206172e, 0 24px 60px #02061766` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-[18px] font-bold tracking-tight">{engine.label}</span>
            <Pill status={engine.status} />
          </div>
          <div className="mt-0.5 text-[13px] text-muted">
            {engine.serial} · {fam.name}
          </div>
        </div>
        <button
          onClick={() => selectEngine(null)}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded-lg border border-line text-[13px] text-muted transition hover:border-fyre hover:text-fyre"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <div className="leading-none">
          <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-dim">Remaining life</div>
          <div className="mt-1.5 font-display text-[40px] font-bold leading-none tabular-nums" style={{ color: c }}>
            {engine.rul}
            <span className="ml-1.5 text-[15px] font-medium text-muted">cycles</span>
          </div>
          <div className="mt-1.5 text-[13px] text-muted">
            80% band {engine.rulBand[0]}–{engine.rulBand[1]}
          </div>
        </div>
        <div className="ml-auto text-right">
          <Spark data={engine.rulTrend} color={c} w={124} h={48} threshold={PULL_T} />
          <div className="mt-1 text-[11.5px] text-dim">last 30 cycles · T = {PULL_T}</div>
        </div>
      </div>

      <div className="mt-3 rounded-xl px-3 py-2 text-[14px] font-semibold" style={{ background: `${c}10`, color: c, boxShadow: `inset 0 0 0 1px ${c}33` }}>
        {ADVICE[engine.status]}
        <div className="mt-0.5 text-[12px] font-normal text-muted">
          Pull at RUL ≤ {PULL_T} · watch at ≤ {PULL_T + WATCH_BAND}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ["Cycles", `${engine.cycles}`],
          ["Health", `${Math.round(engine.health * 100)}%`],
          ["EGT margin", `+${engine.egtMargin}°C`],
          ["Vibration", `${engine.vibration}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-panel2 px-2.5 py-2">
            <div className="text-[11px] font-medium text-dim">{k}</div>
            <div className="mt-0.5 font-display text-[15px] font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-2">
          {sensors.map(([k, v, u, name], i) => (
            <div key={k} className={`flex items-baseline justify-between px-3 py-1.5 ${i % 4 < 2 ? "bg-panel2/60" : ""}`} title={name}>
              <span className="font-mono text-[12.5px] font-semibold text-muted">{k}</span>
              <span className="font-mono text-[13.5px] tabular-nums text-ink">
                {v}
                {u && <span className="ml-1 text-[11px] text-dim">{u}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] text-dim">
        <span>{fam.live ? "Model: best kept by the FD001 loop" : "Model: simulated cluster"}</span>
        <span className={`font-semibold ${fam.live ? "text-gradient" : ""}`}>{fam.live ? "● LIVE" : "○ SIM"}</span>
      </div>
    </div>
  );
}
