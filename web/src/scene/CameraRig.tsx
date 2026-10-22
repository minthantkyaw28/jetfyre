import { SpotLight } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useUI } from "../store";
import { engineObjects, engineRadius, OVERVIEW, OVERVIEW_TARGET } from "./registry";

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

const FLIGHT_S = 1.6;
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const tmp = new THREE.Vector3();

/** Camera framing for an engine close-up: front-outboard, engine left of centre so the dossier fits on the right. */
function engineShot(enginePos: THREE.Vector3, r: number, up: THREE.Vector3, pos: THREE.Vector3, target: THREE.Vector3) {
  const side = Math.sign(enginePos.z) || 1;
  target.copy(enginePos).add(tmp.set(0, r * 0.3, 0));
  pos.copy(enginePos).add(tmp.set(1.0, 0.16, side * 0.42).normalize().multiplyScalar(r * 20));
  const fwd = new THREE.Vector3().subVectors(target, pos).normalize();
  const shift = new THREE.Vector3().crossVectors(fwd, up).normalize().multiplyScalar(r * 2.4);
  pos.add(shift);
  target.add(shift);
}

/**
 * Eased camera flights (easeInOutCubic over 1.6 s, no overshoot) to the selected engine or back to the
 * 3/4 hero angle, plus a volumetric spotlight that fades in on the selected engine.
 */
export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const engineId = useUI((s) => s.engineId);
  const planeId = useUI((s) => s.planeId);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  // Pull the overview back in narrow panes so the whole aircraft (tail included) stays in frame.
  const pullBack = Math.min(1.6, Math.max(1.0, 1.5 / aspect));
  const flight = useRef({
    active: false,
    t0: 0,
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    pos: new THREE.Vector3(...OVERVIEW),
    target: new THREE.Vector3(...OVERVIEW_TARGET),
  });
  const spot = useRef<THREE.SpotLight>(null);
  const spotLevel = useRef(0);

  // A user drag or wheel-zoom cancels an in-flight move and pauses the tour.
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      flight.current.active = false;
      useUI.getState().pauseTour();
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  // Start a new flight whenever the selection or the plane changes.
  useEffect(() => {
    const f = flight.current;
    f.fromPos.copy(camera.position);
    f.fromTarget.copy(controls ? controls.target : new THREE.Vector3(...OVERVIEW_TARGET));
    if (!engineId) {
      f.pos.set(...OVERVIEW).sub(tmp.set(...OVERVIEW_TARGET)).multiplyScalar(pullBack).add(tmp.set(...OVERVIEW_TARGET));
      f.target.set(...OVERVIEW_TARGET);
    }
    f.t0 = performance.now();
    f.active = true;
  }, [engineId, planeId, camera, controls, pullBack]);

  useFrame((_, dt) => {
    const f = flight.current;
    const obj = engineId ? engineObjects.get(engineId) : undefined;
    let enginePos: THREE.Vector3 | null = null;
    if (obj) {
      enginePos = obj.getWorldPosition(new THREE.Vector3());
      if (f.active) engineShot(enginePos, engineRadius.get(engineId!) ?? 0.2, camera.up, f.pos, f.target); // follows the settling plane
      if (spot.current) {
        spot.current.position.copy(enginePos).add(tmp.set(0.5, 2.2, (Math.sign(enginePos.z) || 1) * 0.7));
        spot.current.target.position.copy(enginePos);
        spot.current.target.updateMatrixWorld();
      }
    }

    if (f.active && controls) {
      const u = Math.min(1, (performance.now() - f.t0) / 1000 / FLIGHT_S);
      const e = easeInOutCubic(u);
      camera.position.lerpVectors(f.fromPos, f.pos, e);
      controls.target.lerpVectors(f.fromTarget, f.target, e);
      controls.update();
      if (u >= 1) f.active = false;
    }

    // Spotlight and its volumetric cone fade with the selection.
    spotLevel.current += ((enginePos ? 1 : 0) - spotLevel.current) * Math.min(1, dt * 2.5);
    const s = spot.current;
    if (s) {
      s.intensity = 10 * spotLevel.current;
      const cone = s.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
      const op = cone?.material?.uniforms?.opacity;
      if (op) op.value = 0.3 * spotLevel.current;
      s.visible = spotLevel.current > 0.01;
    }
  });

  return (
    <SpotLight
      ref={spot}
      color="#dbeafe"
      angle={0.32}
      penumbra={0.6}
      distance={3.4}
      attenuation={2.4}
      anglePower={5}
      opacity={0}
      intensity={0}
      decay={0}
      castShadow={false}
    />
  );
}
