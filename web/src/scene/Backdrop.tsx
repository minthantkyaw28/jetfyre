import { ContactShadows, Environment, Grid, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useUI } from "../store";
import { BLUE, CYAN, FLOOR, INDIGO, STUDIO_BOTTOM, STUDIO_TOP } from "./palette";

export const FLOOR_Y = -2.15;

/** Vertical studio gradient for the inverted backdrop sphere (v = 0 bottom, 1 top). */
function studioTexture() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, STUDIO_TOP);
  grad.addColorStop(0.45, "#0c1d45");
  grad.addColorStop(0.55, FLOOR);
  grad.addColorStop(1, STUDIO_BOTTOM);
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dimmed-white photo studio: gradient cyclorama, seamless floor, faint grid, soft contact shadow. */
export function Backdrop() {
  const tex = useMemo(() => studioTexture(), []);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.06;
  });
  return (
    <>
      <mesh>
        <sphereGeometry args={[90, 48, 24]} />
        <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* seamless floor that fades into the cyclorama through the fog */}
      <mesh position={[0, FLOOR_Y - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[70, 64]} />
        <meshStandardMaterial color={FLOOR} roughness={1} metalness={0} envMapIntensity={0.2} />
      </mesh>
      <Grid
        position={[0, FLOOR_Y, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#16306a"
        sectionSize={2.5}
        sectionThickness={0.9}
        sectionColor="#2c55a8"
        fadeDistance={22}
        fadeStrength={1.8}
        infiniteGrid
      />
      <ContactShadows position={[0, FLOOR_Y + 0.005, 0]} scale={16} far={4.5} blur={2.8} opacity={0.65} resolution={512} color="#000814" />
      {/* turntable rings */}
      <mesh position={[0, FLOOR_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.55, 4.58, 128]} />
        <meshBasicMaterial color={BLUE} transparent opacity={0.22} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, FLOOR_Y + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.85, 4.93, 96, 1, 0, Math.PI * 1.35]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.25} toneMapped={false} />
      </mesh>
    </>
  );
}

/** Bright studio lighting: hemisphere + key + fill + gentle blue rim, Lightformer environment. Dims on close-up. */
export function Lights() {
  const scene = useThree((s) => s.scene);
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const engineId = useUI((s) => s.engineId);
  const dim = useRef(0);
  useFrame((_, dt) => {
    dim.current += ((engineId ? 1 : 0) - dim.current) * Math.min(1, dt * 3);
    const k = 1 - 0.45 * dim.current;
    scene.environmentIntensity = 0.85 * k + 0.1;
    if (key.current) key.current.intensity = 2.0 * k;
    if (hemi.current) hemi.current.intensity = 1.1 * k;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", "#1d3a70", 1.1]} />
      <directionalLight ref={key} position={[6, 10, 7]} intensity={2.0} color="#ffffff" />
      <directionalLight position={[-8, 4, 5]} intensity={0.9} color="#f1f5ff" />
      <directionalLight position={[-4, 3, -9]} intensity={1.2} color="#60a5fa" />
      <directionalLight position={[7, 1.5, -7]} intensity={0.7} color={INDIGO} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#e9edf3"]} />
        <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[14, 7, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[-9, 2, 3]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[9, 1.5, -3]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={1.4} color={BLUE} position={[0, 2, -10]} scale={5} />
        <Lightformer form="rect" intensity={0.6} color={CYAN} position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[12, 12, 1]} />
      </Environment>
    </>
  );
}
