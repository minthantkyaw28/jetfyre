import { Html, Line } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useUI } from "../store";
import type { Engine as EngineT } from "../types";
import { CompactLabel, Dossier } from "./EngineLabel";
import { coreGeometry, nacelleGeometry } from "./geometry";
import { engineObjects, engineRadius } from "./registry";
import { BLUE, GLOW } from "./palette";
import { glowTexture } from "./textures";

interface Props {
  engine: EngineT;
  position: [number, number, number];
  Re: number;
  Le: number;
  pylonHeight: number;
  labelHeight: number;
  labelOut: number;
  dense: boolean;
  hideLabel?: boolean;
  worldScale: number;
}

const BLADES = 22;
const PARTICLES = 34;
const HOVER = new THREE.Color(BLUE);

export default function Engine({ engine, position, Re, Le, pylonHeight, labelHeight, labelOut, dense, hideLabel = false, worldScale }: Props) {
  const root = useRef<THREE.Group>(null);
  const fan = useRef<THREE.Group>(null);
  const blades = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const plume = useRef<THREE.MeshBasicMaterial>(null);
  const skin = useRef<THREE.MeshPhysicalMaterial>(null);
  const pts = useRef<THREE.Points>(null);

  const selected = useUI((s) => s.engineId === engine.id);
  const anySelected = useUI((s) => s.engineId !== null);
  const hovered = useUI((s) => s.hoverEngineId === engine.id);
  const selectEngine = useUI((s) => s.selectEngine);
  const hoverEngine = useUI((s) => s.hoverEngine);

  const color = useMemo(() => new THREE.Color(GLOW[engine.status]), [engine.status]);
  const nacelle = useMemo(() => nacelleGeometry(Re, Le), [Re, Le]);
  const core = useMemo(() => coreGeometry(Re, Le), [Re, Le]);
  const bladeGeo = useMemo(() => new THREE.BoxGeometry(0.05 * Re, 0.62 * Re, 0.012 * Re), [Re]);
  const glow = useMemo(() => glowTexture(), []);

  // Register for the camera rig.
  useEffect(() => {
    if (root.current) engineObjects.set(engine.id, root.current);
    engineRadius.set(engine.id, Re * worldScale);
    return () => {
      engineObjects.delete(engine.id);
      engineRadius.delete(engine.id);
    };
  }, [engine.id, Re, worldScale]);

  // Fan blade instances: rotate about the axis, push out radially, twist about the blade's own span.
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const rx = new THREE.Matrix4();
    const tr = new THREE.Matrix4();
    const tw = new THREE.Matrix4();
    for (let i = 0; i < BLADES; i++) {
      rx.makeRotationX((i / BLADES) * Math.PI * 2);
      tr.makeTranslation(0, 0.5 * Re, 0);
      tw.makeRotationY(0.95);
      m.copy(rx).multiply(tr).multiply(tw);
      blades.current?.setMatrixAt(i, m);
    }
    if (blades.current) blades.current.instanceMatrix.needsUpdate = true;
  }, [Re]);

  // Exhaust particles.
  const particles = useMemo(() => {
    const pos = new Float32Array(PARTICLES * 3);
    const life = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) life[i] = Math.random();
    return { pos, life };
  }, []);

  const speed = 9 + engine.health * 9;
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (fan.current) fan.current.rotation.x += dt * speed;
    const pulse = engine.status === "pull" ? 0.55 + 0.45 * Math.sin(t * 6) : engine.status === "watch" ? 0.75 + 0.15 * Math.sin(t * 2.5) : 0.85;
    if (ring.current) ring.current.opacity = pulse;
    if (plume.current) plume.current.opacity = 0.22 + 0.28 * pulse;
    if (skin.current) {
      const target = hovered ? 0.6 : selected ? 0.18 : 0;
      skin.current.emissiveIntensity += (target - skin.current.emissiveIntensity) * Math.min(1, dt * 8);
    }
    const g = pts.current?.geometry;
    if (g) {
      const p = particles.pos;
      for (let i = 0; i < PARTICLES; i++) {
        particles.life[i] += dt * (0.55 + (i % 5) * 0.08);
        if (particles.life[i] > 1) particles.life[i] -= 1;
        const l = particles.life[i];
        const a = i * 2.39996;
        const rr = 0.42 * Re * (0.3 + l * 0.9);
        p[i * 3] = -0.66 * Le - l * Le * 2.2;
        p[i * 3 + 1] = Math.cos(a + t * 0.6) * rr;
        p[i * 3 + 2] = Math.sin(a + t * 0.6) * rr;
      }
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoverEngine(engine.id);
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    hoverEngine(null);
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    selectEngine(engine.id);
  };

  const showLabel = !hideLabel && (!anySelected || selected);
  const lz = Math.sign(position[2] || 1) * labelOut; // push labels outboard so neighbours do not overlap
  const anchor: [number, number, number] = [0.62 * Le, labelHeight, lz];
  return (
    <group ref={root} position={position}>
      {/* pylon */}
      <mesh position={[-0.12 * Le, Re + pylonHeight / 2 - 0.05 * Re, 0]}>
        <boxGeometry args={[0.85 * Le, pylonHeight + 0.1 * Re, 0.14 * Re]} />
        <meshPhysicalMaterial color="#aab4c3" roughness={0.4} metalness={0.3} clearcoat={0.5} />
      </mesh>

      <group onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        {/* nacelle skin */}
        <mesh geometry={nacelle}>
          <meshPhysicalMaterial
            ref={skin}
            color="#3a4558"
            roughness={0.3}
            metalness={0.35}
            clearcoat={1}
            clearcoatRoughness={0.1}
            emissive={HOVER}
            emissiveIntensity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* polished intake lip */}
        <mesh position={[0.5 * Le, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.885 * Re, 0.035 * Re, 12, 64]} />
          <meshStandardMaterial color="#c9d1dc" metalness={1} roughness={0.18} />
        </mesh>
        {/* blue band */}
        <mesh position={[0.06 * Le, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.003 * Re, 1.003 * Re, 0.06 * Le, 64, 1, true]} />
          <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.4} roughness={0.35} metalness={0.2} />
        </mesh>
        {/* dark duct backing */}
        <mesh position={[0.3 * Le, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.83 * Re, 48]} />
          <meshStandardMaterial color="#0b0f16" roughness={0.9} />
        </mesh>
        {/* fan + spinner */}
        <group ref={fan} position={[0.4 * Le, 0, 0]}>
          <instancedMesh ref={blades} args={[bladeGeo, undefined, BLADES]}>
            <meshStandardMaterial color="#b8c2cf" metalness={0.95} roughness={0.28} />
          </instancedMesh>
          <mesh position={[0.02 * Le, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.24 * Re, 0.36 * Re, 32]} />
            <meshStandardMaterial color="#e9edf2" metalness={0.6} roughness={0.25} />
          </mesh>
          <mesh position={[0.2 * Re, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.05 * Re, 0.08 * Re, 16]} />
            <meshStandardMaterial color="#1a2230" />
          </mesh>
        </group>
        {/* core cowl + exhaust plug */}
        <mesh geometry={core}>
          <meshStandardMaterial color="#8d97a5" metalness={0.85} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* status exhaust ring + plume */}
      <mesh position={[-0.5 * Le, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.66 * Re, 0.035 * Re, 10, 56]} />
        <meshBasicMaterial ref={ring} color={color} transparent toneMapped={false} />
      </mesh>
      <mesh position={[-0.55 * Le, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[2.6 * Re, 2.6 * Re]} />
        <meshBasicMaterial
          ref={plume}
          map={glow}
          color={color}
          transparent
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <points ref={pts}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.05 * worldScale * Re * 3}
          map={glow}
          color={color}
          transparent
          opacity={0.35}
          depthWrite={false}
          toneMapped={false}
        />
      </points>

      {/* floating status label + leader line */}
      {showLabel && !selected && (
        <>
          <Line
            points={[
              [0.42 * Le, 0.9 * Re, 0],
              anchor,
            ]}
            color={GLOW[engine.status]}
            lineWidth={1}
            transparent
            opacity={0.7}
            dashed
            dashSize={0.04}
            gapSize={0.03}
          />
          <mesh position={anchor}>
            <sphereGeometry args={[0.035 * Re + 0.012, 12, 12]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <Html position={anchor} zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
            <CompactLabel engine={engine} dim={false} hovered={hovered} dense={dense} />
          </Html>
        </>
      )}
      {selected && !hideLabel && (
        <Html position={[0.1 * Le, 0.4 * Re, 0]} zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <Dossier engine={engine} />
        </Html>
      )}
    </group>
  );
}
