import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useUI } from "../store";
import type { Plane } from "../types";
import Engine from "./Engine";
import {
  fenceSections,
  finFrame,
  fuselageGeometry,
  fuselageShape,
  loft,
  tailplaneSections,
  wingFrame,
  wingSections,
} from "./geometry";
import { INDIGO, NEON } from "./palette";
import { finTexture, liveryTexture, wordmarkTexture } from "./textures";

/** Every plane is normalised to roughly the same on-screen size. */
export const planeScale = (p: Plane) => 7.6 / Math.max(p.dims.length, p.dims.span);

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export default function Airliner({ plane, leaving = false }: { plane: Plane; leaving?: boolean }) {
  const d = plane.dims;
  const s = planeScale(plane);
  const group = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const left = useRef<number | null>(null);
  const settle = useRef(0); // 0 = bobbing, 1 = held still for a close-up
  const anySelected = useUI((st) => st.engineId !== null);

  const parts = useMemo(() => {
    const f = fuselageShape(d);
    const w = wingFrame(d, f);
    const fin = finFrame(d, f);
    const wingGeo = loft(wingSections(d, w));
    const fenceGeo = d.winglet === "fence" ? loft(fenceSections(d, w), { capStart: true }) : null;
    const tailGeo = loft(tailplaneSections(d, f));
    const finGeo = loft(fin.sections, { capStart: true });

    // Engines: numbered left-wing outboard (1) to right-wing outboard (n). Left wing is -Z.
    const half = w.half;
    const fr = d.enginePositions;
    const zs = fr.length === 2 ? [-fr[1], -fr[0], fr[0], fr[1]] : [-fr[0], fr[0]];
    const Re = d.engineRadius;
    const Le = d.engineLength;
    const engines = plane.engines.map((e, i) => {
      const z = (zs[i] ?? 0) * half;
      const az = Math.abs(z);
      const chord = w.chordAt(az);
      const wingLow = w.yAt(az) - 0.05 * chord;
      const y = wingLow - 0.22 * Re - Re;
      const x = w.leAt(az) + 0.16 * Le;
      const outboard = fr.length === 2 && Math.abs(zs[i]) === fr[1];
      // 4-engine planes: outboard labels sit higher and further out along the wing, inboard ones lower.
      const labelHeight = fr.length === 2 ? 1.3 * Re + (outboard ? 1.15 : 0.3) / s : 1.6 * Re + 0.6 / s;
      const labelOut = (fr.length === 2 ? (outboard ? 1.2 : 0.38) : 0.42) / s;
      return { e, pos: [x, y, z] as [number, number, number], pylon: wingLow - (y + Re) + 0.02, labelHeight, labelOut };
    });

    // Fin wordmark decal placement (mid-height of the fin).
    const h = fin.height * 0.42;
    const chordH = fin.rootC + (fin.tipC - fin.rootC) * (h / fin.height);
    const leH = fin.rootLE - h * fin.tanSweep;
    const decal = {
      x: leH - chordH * 0.47,
      y: fin.rootY + h,
      z: 0.058 * chordH + 0.004,
      w: chordH * 0.78,
    };
    const fairing = { x: w.xRoot - d.chordRoot * 0.42, y: -f.R * f.hScale * 0.74, sx: d.chordRoot * 0.62, sy: f.R * 0.36, sz: f.R * 0.82 };
    return { f, w, wingGeo, fenceGeo, tailGeo, finGeo, engines, decal, fairing };
  }, [d, plane.engines, s]);

  const livery = useMemo(() => liveryTexture(plane.id, d), [plane.id, d]);
  const fusGeo = useMemo(() => fuselageGeometry(d), [d]);
  const fin = useMemo(() => finTexture(), []);
  const word = useMemo(() => wordmarkTexture(), []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    if (leaving && left.current === null) left.current = t;
    const p = easeOut(Math.min(1, (t - born.current) / 1.0)); // glide in over ~1 s
    const q = left.current === null ? 0 : easeInOut(Math.min(1, (t - left.current) / 0.9)); // glide out
    settle.current += ((anySelected && !leaving ? 1 : 0) - settle.current) * Math.min(1, dt * 3);
    const bob = 1 - settle.current;
    g.position.set(-9 * (1 - p) + 10 * q, Math.sin(t * 0.8) * 0.07 * bob + (1 - p) * 0.6 + q * 0.9, 0);
    g.rotation.x = Math.sin(t * 0.55) * 0.03 * bob + (1 - p) * -0.35 + q * 0.25; // roll (forward is +X)
    g.rotation.z = Math.sin(t * 0.4 + 1) * 0.012 * bob + (1 - p) * 0.06 + q * 0.12; // pitch
    g.scale.setScalar(s * (0.86 + 0.14 * p) * (1 - 0.2 * q));
    g.visible = q < 0.999;
  });

  const skin = (
    <meshPhysicalMaterial map={livery} roughness={0.3} metalness={0.06} clearcoat={1} clearcoatRoughness={0.1} />
  );
  const wingMat = (
    <meshPhysicalMaterial color="#e6ebf2" roughness={0.4} metalness={0.15} clearcoat={0.45} clearcoatRoughness={0.3} side={THREE.DoubleSide} />
  );

  return (
    <group ref={group} scale={s * 0.86} position={[-9, 0.6, 0]}>
      <mesh geometry={fusGeo}>{skin}</mesh>
      {/* belly fairing */}
      <mesh position={[parts.fairing.x, parts.fairing.y, 0]} scale={[parts.fairing.sx, parts.fairing.sy, parts.fairing.sz]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshPhysicalMaterial color="#a3aebd" roughness={0.45} metalness={0.15} clearcoat={0.6} />
      </mesh>

      {/* wings (right as built, left mirrored) */}
      <mesh geometry={parts.wingGeo}>{wingMat}</mesh>
      <mesh geometry={parts.wingGeo} scale={[1, 1, -1]}>{wingMat}</mesh>
      {parts.fenceGeo && (
        <>
          <mesh geometry={parts.fenceGeo}>
            <meshPhysicalMaterial color={INDIGO} emissive={INDIGO} emissiveIntensity={0.25} roughness={0.35} clearcoat={0.8} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={parts.fenceGeo} scale={[1, 1, -1]}>
            <meshPhysicalMaterial color={INDIGO} emissive={INDIGO} emissiveIntensity={0.25} roughness={0.35} clearcoat={0.8} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}

      {/* tailplane */}
      <mesh geometry={parts.tailGeo}>{wingMat}</mesh>
      <mesh geometry={parts.tailGeo} scale={[1, 1, -1]}>{wingMat}</mesh>

      {/* fin in the JetFyre gradient + wordmark decals */}
      <mesh geometry={parts.finGeo}>
        <meshPhysicalMaterial map={fin} roughness={0.32} metalness={0.1} clearcoat={1} clearcoatRoughness={0.12} side={THREE.DoubleSide} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[parts.decal.x, parts.decal.y, side * parts.decal.z]}
          rotation={[0, side === 1 ? 0 : Math.PI, 0]}
        >
          <planeGeometry args={[parts.decal.w, parts.decal.w * 0.29]} />
          <meshBasicMaterial map={word} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}

      {/* anti-collision beacons */}
      <mesh position={[parts.f.xAt(0.3), parts.f.topAt(0.3) + 0.01, 0]}>
        <sphereGeometry args={[0.025, 10, 10]} />
        <meshBasicMaterial color={NEON.pull} toneMapped={false} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={`nav${side}`} position={[parts.w.leAt(parts.w.half * 0.99) - 0.05, parts.w.yAt(parts.w.half * 0.99) + 0.01, side * parts.w.half * 0.985]}>
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshBasicMaterial color={side === 1 ? NEON.ok : NEON.pull} toneMapped={false} />
        </mesh>
      ))}

      {parts.engines.map(({ e, pos, pylon, labelHeight, labelOut }) => (
        <Engine
          key={e.id}
          engine={e}
          position={pos}
          Re={d.engineRadius}
          Le={d.engineLength}
          pylonHeight={Math.max(0.02, pylon)}
          labelHeight={labelHeight}
          labelOut={labelOut}
          dense={plane.engineCount === 4}
          hideLabel={leaving}
          worldScale={s}
        />
      ))}
    </group>
  );
}
