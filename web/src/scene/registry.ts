import type * as THREE from "three";

/** Engine id -> its scene object, so the camera rig can fly to whichever engine is selected. */
export const engineObjects = new Map<string, THREE.Object3D>();
/** Engine id -> world-space nacelle radius, used to frame the close-up. */
export const engineRadius = new Map<string, number>();

/** The overview camera position and target every plane returns to. */
export const OVERVIEW: [number, number, number] = [7.4, 3.5, 10.0];
export const OVERVIEW_TARGET: [number, number, number] = [0, 0.05, 0];
