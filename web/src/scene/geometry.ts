import * as THREE from "three";
import type { PlaneDims } from "../types";

// Convention: nose points +X, up is +Y, right wing is +Z (pilot's right).

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface FuselageShape {
  L: number;
  R: number;
  hScale: number;
  r: (t: number) => number; // radius at t (0 = nose, 1 = tail)
  yc: (t: number) => number; // centre-line height at t
  hump: (t: number) => number; // 747 upper-deck bulge at t
  xAt: (t: number) => number; // x coordinate of t
  topAt: (t: number) => number; // y of the fuselage crown at t
}

export function fuselageShape(d: PlaneDims): FuselageShape {
  const L = d.length;
  const R = d.radius;
  const hScale = d.doubleDeck ? 1.24 : 1.0;
  const NOSE = 0.11;
  const TAIL = 0.68;
  const r = (t: number) => {
    if (t < NOSE) {
      const u = t / NOSE;
      return R * Math.pow(1 - Math.pow(1 - u, 2.3), 0.5);
    }
    if (t > TAIL) {
      const u = (t - TAIL) / (1 - TAIL);
      return R * (1 - 0.92 * Math.pow(u, 1.45));
    }
    return R;
  };
  const yc = (t: number) => {
    let y = 0;
    if (t < NOSE) y -= R * 0.12 * Math.pow(1 - t / NOSE, 2);
    if (t > TAIL) y += (R - r(t)) * hScale * 0.84; // upswept tail: the belly rises, the crown stays level
    return y;
  };
  const hump = (t: number) => (d.hump ? R * 0.44 * smoothstep(0.035, 0.13, t) * (1 - smoothstep(0.2, 0.37, t)) : 0);
  const xAt = (t: number) => L / 2 - t * L;
  const topAt = (t: number) => yc(t) + r(t) * hScale + hump(t);
  return { L, R, hScale, r, yc, hump, xAt, topAt };
}

/** Fuselage as a ring-lofted tube. UV: u = t along the body, v = angle / 2π (0 = crown, .25 = right side, .5 = belly). */
export function fuselageGeometry(d: PlaneDims) {
  const s = fuselageShape(d);
  const N = 140;
  const M = 56;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = 0.5 * (1 - Math.cos((Math.PI * i) / N)); // dense at nose and tail
    const r = s.r(t);
    const yc = s.yc(t);
    const x = s.xAt(t);
    const h = s.hump(t);
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const y = yc + r * c * s.hScale + h * Math.pow(Math.max(0, c), 1.3);
      pos.push(x, y, r * sn);
      uv.push(t, j / M);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = (i + 1) * (M + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface Section {
  le: THREE.Vector3; // leading-edge point
  chord: number; // chord length (runs towards -X)
  n: THREE.Vector3; // thickness direction
  th: number; // thickness ratio
}

const nacaHalf = (x: number) =>
  5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);

/** Loft symmetric airfoil sections into a closed surface (tip capped). UV v = section fraction. */
export function loft(sections: Section[], { capStart = false, capEnd = true, K = 22 } = {}) {
  const xs = Array.from({ length: K + 1 }, (_, i) => 0.5 * (1 - Math.cos((Math.PI * i) / K)));
  const loop: [number, number][] = [];
  for (let i = K; i >= 0; i--) loop.push([xs[i], 1]);
  for (let i = 1; i <= K; i++) loop.push([xs[i], -1]);
  const P = loop.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  sections.forEach((s, k) => {
    loop.forEach(([xc, side], p) => {
      v.copy(s.le);
      v.x -= xc * s.chord;
      v.addScaledVector(s.n, side * nacaHalf(xc) * s.th * s.chord);
      pos.push(v.x, v.y, v.z);
      uv.push(p / (P - 1), sections.length > 1 ? k / (sections.length - 1) : 0);
    });
  });
  for (let k = 0; k < sections.length - 1; k++) {
    for (let p = 0; p < P - 1; p++) {
      const a = k * P + p;
      const b = (k + 1) * P + p;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const cap = (k: number) => {
    const base = k * P;
    const c = new THREE.Vector3();
    for (let p = 0; p < P; p++) c.add(new THREE.Vector3(pos[(base + p) * 3], pos[(base + p) * 3 + 1], pos[(base + p) * 3 + 2]));
    c.divideScalar(P);
    const ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    uv.push(0.5, k / Math.max(1, sections.length - 1));
    for (let p = 0; p < P - 1; p++) idx.push(ci, base + p, base + p + 1);
  };
  if (capStart) cap(0);
  if (capEnd) cap(sections.length - 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(0, 0, 1);
const DIHEDRAL = Math.tan(0.095);

export interface WingFrame {
  half: number;
  xRoot: number; // root leading-edge x
  yRoot: number;
  leAt: (z: number) => number; // leading-edge x at spanwise z
  chordAt: (z: number) => number;
  yAt: (z: number) => number; // wing reference plane height at z
}

export function wingFrame(d: PlaneDims, f: FuselageShape): WingFrame {
  const half = d.span / 2;
  const tanS = Math.tan(d.sweep);
  const xRoot = f.xAt(d.wingX);
  const yRoot = -0.56 * f.R * f.hScale;
  const zk = 0.32 * half;
  const cK = Math.max(d.chordTip * 1.15, d.chordRoot - zk * tanS);
  const chordAt = (z: number) =>
    z <= zk ? d.chordRoot + (cK - d.chordRoot) * (z / zk) : cK + (d.chordTip - cK) * ((z - zk) / (half - zk));
  return { half, xRoot, yRoot, leAt: (z) => xRoot - z * tanS, chordAt, yAt: (z) => yRoot + z * DIHEDRAL };
}

/** Right wing (z >= 0) sections, including the winglet. Mirror for the left wing. */
export function wingSections(d: PlaneDims, w: WingFrame): Section[] {
  const sec = (z: number, th: number, extra?: Partial<Section>): Section => ({
    le: new THREE.Vector3(w.leAt(z), w.yAt(z), z),
    chord: w.chordAt(z),
    n: UP.clone(),
    th,
    ...extra,
  });
  const zk = 0.32 * w.half;
  const out: Section[] = [sec(0, 0.15), sec(zk, 0.12)];
  const tipZ = d.winglet === "raked" ? 0.9 * w.half : 0.975 * w.half;
  const tip = sec(tipZ, 0.1);
  out.push(tip);
  const tanS = Math.tan(d.sweep);
  if (d.winglet === "raked") {
    const dz = w.half - tipZ;
    out.push({
      le: new THREE.Vector3(tip.le.x - dz * Math.tan(d.sweep + 0.42), tip.le.y + dz * DIHEDRAL * 1.4, w.half),
      chord: tip.chord * 0.32,
      n: UP.clone(),
      th: 0.09,
    });
  } else if (d.winglet === "curved" || d.winglet === "sharklet") {
    const curved = d.winglet === "curved";
    const rr = (curved ? 0.05 : 0.016) * d.span;
    const rise = (curved ? 0.028 : 0.05) * d.span;
    const steps = curved ? 6 : 3;
    for (let i = 1; i <= steps; i++) {
      const phi = (i / steps) * (Math.PI / 2) * (curved ? 0.92 : 1);
      const arc = rr * phi;
      out.push({
        le: new THREE.Vector3(tip.le.x - arc * Math.tan(d.sweep + 0.2), tip.le.y + rr * (1 - Math.cos(phi)), tipZ + rr * Math.sin(phi)),
        chord: tip.chord * (1 - 0.35 * (i / steps)),
        n: new THREE.Vector3(0, Math.cos(phi), -Math.sin(phi)),
        th: 0.09,
      });
    }
    const last = out[out.length - 1];
    out.push({
      le: new THREE.Vector3(last.le.x - rise * Math.tan(d.sweep + 0.35), last.le.y + rise, last.le.z + rise * 0.06),
      chord: tip.chord * (curved ? 0.34 : 0.4),
      n: new THREE.Vector3(0, 0.1, -1).normalize(),
      th: 0.08,
    });
  }
  void tanS;
  return out;
}

/** A380-style wingtip fence (vertical plate above and below the tip). */
export function fenceSections(d: PlaneDims, w: WingFrame): Section[] {
  const z = 0.975 * w.half;
  const c = w.chordAt(z) * 0.75;
  const x = w.leAt(z) + 0.08 * c;
  const y = w.yAt(z);
  const lo = 0.011 * d.span;
  const hi = 0.02 * d.span;
  const mk = (dy: number, k: number): Section => ({
    le: new THREE.Vector3(x - (dy + lo) * 0.9 * 0.5, y + dy, z + 0.01),
    chord: c * k,
    n: SIDE.clone(),
    th: 0.08,
  });
  return [mk(-lo, 0.55), mk(0, 1), mk(hi, 0.45)];
}

export function tailplaneSections(d: PlaneDims, f: FuselageShape): Section[] {
  const t0 = 0.82;
  const rootC = 0.1 * f.L;
  const half = 0.17 * d.span;
  const sweep = Math.tan(d.sweep + 0.08);
  const x0 = f.xAt(t0);
  const y0 = f.yc(0.87) + f.r(0.87) * 0.05;
  const mk = (z: number, k: number, th: number): Section => ({
    le: new THREE.Vector3(x0 - z * sweep, y0 + z * Math.tan(0.11), z),
    chord: rootC * k,
    n: UP.clone(),
    th,
  });
  return [mk(0, 1, 0.12), mk(half, 0.36, 0.09)];
}

export interface FinFrame {
  sections: Section[];
  rootLE: number;
  rootY: number;
  rootC: number;
  tipC: number;
  height: number;
  tanSweep: number;
}

export function finFrame(d: PlaneDims, f: FuselageShape): FinFrame {
  const rootC = 0.19 * f.L;
  const tipC = 0.36 * rootC;
  const height = d.tailHeight;
  const tanSweep = Math.tan(0.74);
  const rootLE = f.xAt(0.73);
  const rootY = f.topAt(0.84) - 0.06 * f.R;
  const mk = (h: number, th: number): Section => ({
    le: new THREE.Vector3(rootLE - h * tanSweep, rootY + h, 0),
    chord: rootC + (tipC - rootC) * (h / height),
    n: SIDE.clone(),
    th,
  });
  return { sections: [mk(-0.08 * height, 0.12), mk(0, 0.12), mk(height * 0.5, 0.11), mk(height, 0.1)], rootLE, rootY, rootC, tipC, height, tanSweep };
}

/** Nacelle lathe profile (r, axial) — intake at +axial. Rotate so +Y -> +X. */
export function nacelleGeometry(Re: number, Le: number) {
  const pts = [
    [0.8, 0.22],
    [0.85, 0.45],
    [0.89, 0.5],
    [0.955, 0.488],
    [1.0, 0.3],
    [0.99, 0.04],
    [0.9, -0.28],
    [0.7, -0.5],
    [0.64, -0.47],
    [0.62, -0.3],
  ].map(([r, y]) => new THREE.Vector2(r * Re, y * Le));
  const g = new THREE.LatheGeometry(pts, 64);
  g.rotateZ(-Math.PI / 2);
  return g;
}

export function coreGeometry(Re: number, Le: number) {
  const pts = [
    [0.6, -0.36],
    [0.58, -0.5],
    [0.5, -0.64],
    [0.46, -0.66],
    [0.3, -0.66],
    [0.12, -0.8],
    [0.0, -0.86],
  ].map(([r, y]) => new THREE.Vector2(r * Re, y * Le));
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateZ(-Math.PI / 2);
  return g;
}
