import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { PLANES, planeById } from "../data/fleet";
import { useUI } from "../store";
import type { PlaneId } from "../types";
import Airliner from "./Airliner";
import { Backdrop, Lights } from "./Backdrop";
import CameraRig from "./CameraRig";
import Overlays from "./Overlays";
import { OVERVIEW } from "./registry";

/** Keeps the outgoing plane mounted for ~1 s so it can glide out while the new one glides in. */
function PlaneStage({ planeId }: { planeId: PlaneId }) {
  const [stage, setStage] = useState<{ current: PlaneId; leaving: PlaneId | null }>({ current: planeId, leaving: null });
  useEffect(() => {
    setStage((s) => (s.current === planeId ? s : { current: planeId, leaving: s.current }));
    const t = window.setTimeout(() => setStage((s) => ({ ...s, leaving: null })), 1000);
    return () => window.clearTimeout(t);
  }, [planeId]);
  return (
    <>
      {stage.leaving && stage.leaving !== stage.current && <Airliner key={stage.leaving} plane={planeById(stage.leaving)} leaving />}
      <Airliner key={stage.current} plane={planeById(stage.current)} />
    </>
  );
}

export default function FleetScene() {
  const planeId = useUI((s) => s.planeId);
  const engineId = useUI((s) => s.engineId);
  const autoRotate = useUI((s) => s.autoRotate);
  const intro = useUI((s) => s.tour === "on" && s.tourPhase === "intro");
  const selectEngine = useUI((s) => s.selectEngine);
  const setPlane = useUI((s) => s.setPlane);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") selectEngine(null);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const i = PLANES.findIndex((p) => p.id === useUI.getState().planeId);
        const n = (i + (e.key === "ArrowRight" ? 1 : PLANES.length - 1)) % PLANES.length;
        setPlane(PLANES[n].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectEngine, setPlane]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-bg">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: OVERVIEW, fov: 36, near: 0.05, far: 300 }}
        gl={{ antialias: true }}
        onPointerMissed={() => {
          if (useUI.getState().engineId) selectEngine(null);
        }}
      >
        <fog attach="fog" args={["#0e2a78", 18, 48]} />
        <Suspense fallback={null}>
          <Backdrop />
          <Lights />
          <PlaneStage planeId={planeId} />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          autoRotate={autoRotate && !engineId}
          autoRotateSpeed={intro ? 4.4 : 0.8} // intro: about a third of a turn over 4.5 s
          minDistance={0.8}
          maxDistance={28}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI * 0.88}
        />
        <CameraRig />
      </Canvas>
      <Overlays />
    </div>
  );
}
