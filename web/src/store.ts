import { create } from "zustand";
import { engineById, planeById } from "./data/fleet";
import type { FamilyId, PlaneId } from "./types";

/** Tour = the self-running showcase: plane intro → zoom + spotlight on its worst engine → zoom out → next plane. */
export type TourMode = "on" | "paused" | "off";
export type TourPhase = "intro" | "focus" | "release";

export const TOUR_ORDER: PlaneId[] = ["b777", "a380", "b747", "a350", "a320"];
export const TOUR_MS: Record<TourPhase, number> = { intro: 4500, focus: 6500, release: 2200 };
export const TOUR_RESUME_MS = 30000; // auto-resume after this long without interaction

interface UIState {
  planeId: PlaneId;
  engineId: string | null; // selected (zoomed + spotlit) engine
  hoverEngineId: string | null;
  autoRotate: boolean;
  tour: TourMode;
  tourPhase: TourPhase;
  phaseStartedAt: number; // ms timestamp, for progress bars
  resumeAt: number | null;
  setPlane: (id: PlaneId) => void; // user actions pause the tour
  selectEngine: (id: string | null) => void;
  hoverEngine: (id: string | null) => void;
  toggleAutoRotate: () => void;
  pauseTour: () => void; // call on any manual interaction with the scene (drag, click)
  setTour: (on: boolean) => void; // the explicit toggle button
}

const paused = () => ({ tour: "paused" as const, resumeAt: Date.now() + TOUR_RESUME_MS });

export const useUI = create<UIState>((set, get) => ({
  planeId: TOUR_ORDER[0], // the twin whose engine family is driven by the live C-MAPSS run
  engineId: null,
  hoverEngineId: null,
  autoRotate: true,
  tour: "on",
  tourPhase: "intro",
  phaseStartedAt: Date.now(),
  resumeAt: null,
  setPlane: (id) =>
    set({ planeId: id, engineId: null, hoverEngineId: null, autoRotate: true, ...(get().tour === "on" ? paused() : {}) }),
  selectEngine: (id) => set({ engineId: id, autoRotate: !id, ...(get().tour === "on" ? paused() : {}) }),
  hoverEngine: (id) => set({ hoverEngineId: id }),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  pauseTour: () => {
    if (get().tour !== "off") set(paused());
  },
  setTour: (on) =>
    set(on ? { tour: "on", resumeAt: null, tourPhase: "intro", phaseStartedAt: Date.now(), engineId: null, autoRotate: true }
           : { tour: "off", resumeAt: null }),
}));

/** The engine family whose research cluster the right-hand panels show. */
export function useActiveFamily(): FamilyId {
  return useUI((s) => (s.engineId ? engineById(s.engineId)?.family : undefined) ?? planeById(s.planeId).family);
}

export function worstEngineId(planeId: PlaneId): string {
  return [...planeById(planeId).engines].sort((a, b) => a.rul - b.rul)[0].id;
}

/** Drives the tour. Uses setState directly so the tour's own moves don't count as user interaction. */
export function startTourDriver(): () => void {
  const tick = () => {
    const s = useUI.getState();
    const now = Date.now();
    if (s.tour === "paused" && s.resumeAt && now >= s.resumeAt) {
      useUI.setState({ tour: "on", resumeAt: null, tourPhase: "release", phaseStartedAt: now, engineId: null, autoRotate: true });
      return;
    }
    if (s.tour !== "on" || now - s.phaseStartedAt < TOUR_MS[s.tourPhase]) return;
    if (s.tourPhase === "intro") {
      useUI.setState({ tourPhase: "focus", phaseStartedAt: now, engineId: worstEngineId(s.planeId), autoRotate: false });
    } else if (s.tourPhase === "focus") {
      useUI.setState({ tourPhase: "release", phaseStartedAt: now, engineId: null, autoRotate: true });
    } else {
      const next = TOUR_ORDER[(TOUR_ORDER.indexOf(s.planeId) + 1) % TOUR_ORDER.length];
      useUI.setState({ tourPhase: "intro", phaseStartedAt: now, planeId: next, engineId: null, hoverEngineId: null, autoRotate: true });
    }
  };
  const id = window.setInterval(tick, 200);
  return () => window.clearInterval(id);
}
