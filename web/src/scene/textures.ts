import * as THREE from "three";
import type { PlaneDims } from "../types";
import { BLUE, CYAN, INDIGO, LIGHT, VIOLET } from "./palette";

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function finish(c: HTMLCanvasElement, flipY = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = flipY;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** JetFyre livery on the fuselage UV (u = nose→tail, v = crown→right side→belly→left side→crown). */
export function liveryTexture(id: string, d: PlaneDims) {
  const key = `livery-${id}`;
  if (cache.has(key)) return cache.get(key)!;
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const hS = d.doubleDeck ? 1.24 : 1;
  const vOf = (cos: number) => Math.acos(Math.max(-1, Math.min(1, cos))) / (2 * Math.PI); // right side
  const Y = (v: number) => v * H;
  const X = (u: number) => u * W;

  // Pearl body with a soft crown highlight.
  const body = g.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, "#fbfcfe");
  body.addColorStop(0.25, "#f7f9fc");
  body.addColorStop(0.5, "#f1f4f8");
  body.addColorStop(0.75, "#f7f9fc");
  body.addColorStop(1, "#fbfcfe");
  g.fillStyle = body;
  g.fillRect(0, 0, W, H);

  // Grey belly (cos θ < -0.45).
  const vb = vOf(-0.45);
  const belly = g.createLinearGradient(0, Y(vb), 0, Y(1 - vb));
  belly.addColorStop(0, "#e7ecf2");
  belly.addColorStop(0.5, "#cfd7e2");
  belly.addColorStop(1, "#e7ecf2");
  g.fillStyle = belly;
  g.fillRect(0, Y(vb), W, Y(1 - vb) - Y(vb));

  // Radiant cheatline: cyan → blue → indigo → violet, widening towards the tail on both sides.
  const stripe = (vCenter: number) => {
    const grad = g.createLinearGradient(X(0.1), 0, X(1), 0);
    grad.addColorStop(0, CYAN);
    grad.addColorStop(0.35, BLUE);
    grad.addColorStop(0.7, INDIGO);
    grad.addColorStop(1, VIOLET);
    g.fillStyle = grad;
    g.beginPath();
    const w0 = 0.004 * H;
    const w1 = 0.016 * H;
    g.moveTo(X(0.09), Y(vCenter) - w0);
    g.lineTo(X(0.7), Y(vCenter) - w0 * 1.6);
    g.lineTo(X(1.0), Y(vCenter) - w1);
    g.lineTo(X(1.0), Y(vCenter) + w1 * 0.3);
    g.lineTo(X(0.7), Y(vCenter) + w0 * 1.6);
    g.lineTo(X(0.09), Y(vCenter) + w0);
    g.closePath();
    g.fill();
    g.fillStyle = LIGHT;
    g.fillRect(X(0.12), Y(vCenter) + w0 * 2.4, X(0.58), 2);
  };
  const vStripe = vOf(0.1 / hS);
  stripe(vStripe);
  stripe(1 - vStripe);

  // Cabin windows (one deck, or two on the A380, plus the 747 upper deck).
  const pitch = 0.53 / (d.length * 10);
  const winW = Math.max(3, pitch * 0.48 * W);
  const winH = Math.max(6, (0.4 / (2 * Math.PI * d.radius * 10)) * H);
  const row = (cos: number, from: number, to: number) => {
    const v1 = vOf(cos / hS);
    for (const v of [v1, 1 - v1]) {
      g.fillStyle = "#1b2433";
      for (let u = from; u < to; u += pitch) {
        if (u > 0.255 && u < 0.27) continue; // door gap
        if (u > 0.5 && u < 0.515) continue;
        g.beginPath();
        g.roundRect(X(u) - winW / 2, Y(v) - winH / 2, winW, winH, Math.min(winW, winH) / 2.2);
        g.fill();
      }
      // doors
      g.strokeStyle = "#b9c2ce";
      g.lineWidth = 2;
      for (const u of [0.13, 0.262, 0.508, 0.66]) {
        if (u > to + 0.01) continue;
        g.strokeRect(X(u) - winW * 1.2, Y(v) - winH * 1.6, winW * 2.4, winH * 3.6);
      }
    }
  };
  if (d.doubleDeck) {
    row(0.6, 0.12, 0.7);
    row(-0.02, 0.12, 0.72);
  } else {
    row(0.38, 0.13, 0.7);
  }
  if (d.hump) row(0.86, 0.1, 0.27);

  // Cockpit windows.
  g.fillStyle = "#121a26";
  const vc = vOf(0.5 / hS);
  for (const v of [vc, 1 - vc]) {
    g.beginPath();
    g.moveTo(X(0.03), Y(v) - winH);
    g.lineTo(X(0.06), Y(v) - winH * 1.3);
    g.lineTo(X(0.062), Y(v) + winH * 0.3);
    g.lineTo(X(0.034), Y(v) + winH * 0.6);
    g.closePath();
    g.fill();
  }
  g.fillRect(0, Y(0.92), X(0.034), Y(0.08));
  g.fillRect(0, 0, X(0.034), Y(0.08));

  // Wordmark above the windows: mirrored on the right side, flipped on the left (see UV notes).
  const word = (v: number, mirror: boolean) => {
    g.save();
    g.translate(X(0.27), Y(v));
    g.scale(mirror ? -1 : 1, mirror ? 1 : -1);
    g.font = `800 ${Math.round(H * 0.05)}px \"Space Grotesk\", Inter, system-ui, sans-serif`;
    g.textBaseline = "middle";
    g.fillStyle = "#0b1530";
    g.textAlign = "right";
    g.fillText("Jet", 0, 0);
    g.textAlign = "left";
    const wg = g.createLinearGradient(H * 0.0, 0, H * 0.15, 0);
    wg.addColorStop(0, CYAN);
    wg.addColorStop(0.5, BLUE);
    wg.addColorStop(1, VIOLET);
    g.fillStyle = wg;
    g.fillText("Fyre", H * 0.004, 0);
    g.restore();
  };
  const vw = vOf((d.doubleDeck ? 0.84 : 0.7) / hS);
  word(vw, true);
  word(1 - vw, false);

  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Fin gradient: cyan root → blue → indigo → violet tip (v = 0 root). */
export function finTexture() {
  const key = "fin";
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(64, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  g.fillStyle = "#f7f9fc";
  g.fillRect(0, 0, 64, 512);
  grad.addColorStop(0, CYAN);
  grad.addColorStop(0.35, BLUE);
  grad.addColorStop(0.68, INDIGO);
  grad.addColorStop(1, VIOLET);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 150); // blue tip band only
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Transparent wordmark + fan glyph for the fin decal planes. */
export function wordmarkTexture() {
  const key = "wordmark";
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(1024, 300);
  g.clearRect(0, 0, 1024, 300);
  // fan glyph
  g.save();
  g.translate(150, 150);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 16;
  g.beginPath();
  g.arc(0, 0, 100, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 12;
  g.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 4);
    g.beginPath();
    g.moveTo(-70, 0);
    g.lineTo(70, 0);
    g.stroke();
  }
  g.fillStyle = "#1d4ed8";
  g.beginPath();
  g.arc(0, 0, 20, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.font = "800 150px \"Space Grotesk\", Inter, system-ui, sans-serif";
  g.textBaseline = "middle";
  g.fillStyle = "#1d4ed8";
  g.fillText("JetFyre", 290, 160);
  const t = finish(c, true);
  cache.set(key, t);
  return t;
}

/** Soft radial glow (white centre → transparent), tint with material colour. */
export function glowTexture() {
  const key = "glow";
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = finish(c, true);
  cache.set(key, t);
  return t;
}
