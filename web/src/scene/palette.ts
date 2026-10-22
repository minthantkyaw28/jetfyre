import type { EngineStatus } from "../types";

/** Status colours for UI text/pills (match the CSS tokens ok / watch / pull). */
export const NEON: Record<EngineStatus, string> = { ok: "#059669", watch: "#d97706", pull: "#e11d48" };
/** Brighter variants for 3D glows so they read against graphite nacelles and a white studio. */
export const GLOW: Record<EngineStatus, string> = { ok: "#10b981", watch: "#f59e0b", pull: "#f43f5e" };

// JetFyre radiant blue: cyan → blue → indigo → violet.
export const CYAN = "#06b6d4";
export const BLUE = "#2563eb";
export const INDIGO = "#6366f1";
export const VIOLET = "#a855f7";
export const LIGHT = "#0ea5e9";
export const INK = "#0b1530";
export const STUDIO_TOP = "#12306a";
export const STUDIO_BOTTOM = "#040a1a";
export const FLOOR = "#050d22";
