import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { HairStyle } from "./theme";

// ── Stylised hair ────────────────────────────────────────────
// Chunky, sculpted clumps in the style of feature-animation characters. Each style
// is built from simple primitives and merged into one geometry, cached per style
// and variant, so a full office of characters costs one draw call per head of hair.
// Coordinates are in head space: head radius 0.235, face toward +z.

const cache = new Map<string, THREE.BufferGeometry>();

function rand(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function place(g: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  _m.compose(new THREE.Vector3(...pos), _q.setFromEuler(_e.set(...rot)), new THREE.Vector3(...scale));
  return g.applyMatrix4(_m);
}

/** Shell over the scalp: covers the back and crown, leaves the face open. */
function cap(radius = 0.252, theta = Math.PI * 0.5, tilt = -0.38) {
  return place(new THREE.SphereGeometry(radius, 36, 24, 0, Math.PI * 2, 0, theta), [0, 0, 0], [tilt, 0, 0]);
}

/** Point on the head at polar angle `polar` from the crown, `azimuth` around (0 = face). */
function onHead(polar: number, azimuth: number, r: number): [number, number, number] {
  return [Math.sin(polar) * Math.sin(azimuth) * r, Math.cos(polar) * r, Math.sin(polar) * Math.cos(azimuth) * r];
}

/** A soft clump: an ellipsoid leaning out from the scalp. */
function clump(polar: number, azimuth: number, size: number, stretch = 1.35, r = 0.24) {
  const g = new THREE.SphereGeometry(size, 16, 12);
  return place(g, onHead(polar, azimuth, r), [polar * 0.9, azimuth, 0], [1, stretch, 1]);
}

/**
 * A curl: a thick comma-shaped swirl (an open ring wrapped round a ball) lying on
 * the scalp, spun at random so neighbouring curls don't line up.
 */
function curl(polar: number, azimuth: number, size: number, spin: number, r = 0.25) {
  const arc = Math.PI * 1.45;
  const ringR = size * 0.62;
  const tube = size * 0.4;
  const ring = new THREE.TorusGeometry(ringR, tube, 10, 22, arc);
  const core = new THREE.SphereGeometry(size * 0.5, 14, 10);
  const tip = place(new THREE.SphereGeometry(tube * 0.95, 10, 8), [Math.cos(arc) * ringR, Math.sin(arc) * ringR, 0]);
  const pos = onHead(polar, azimuth, r);
  const out = new THREE.Vector3(...pos).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
  _m.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 0.75));
  return [ring, core, tip].map((g) => g.applyMatrix4(_m));
}

function build(style: HairStyle, variant: number): THREE.BufferGeometry {
  const r = rand(variant * 7919 + style.length * 31);
  const parts: THREE.BufferGeometry[] = [];
  switch (style) {
    case "curly": {
      // a full, rounded mass of hair, then swirled curls all over it
      parts.push(cap(0.262, Math.PI * 0.58, -0.4));
      parts.push(place(new THREE.SphereGeometry(0.2, 24, 16), [0, 0.12, -0.04], [0, 0, 0], [1.2, 0.85, 1.15]));
      const rings: [number, number, number][] = [
        [0.0, 1, 0.1],
        [0.42, 7, 0.095],
        [0.85, 11, 0.088],
        [1.25, 12, 0.08],
        [1.65, 10, 0.07],
      ];
      for (const [polar, count, size] of rings) {
        for (let i = 0; i < count; i++) {
          const az = (i / count) * Math.PI * 2 + r() * 0.45 + polar;
          // leave the forehead and face clear below the hairline
          const front = Math.cos(az);
          if (polar > 0.75 && front > 0.4) continue;
          if (polar > 1.15 && front > -0.05) continue;
          parts.push(...curl(polar + (r() - 0.5) * 0.12, az, size * (0.85 + r() * 0.3), r() * Math.PI * 2, 0.262 + size * 0.25));
        }
      }
      // a few curls tumbling onto the forehead
      parts.push(...curl(0.6, -0.4, 0.075, 1.2, 0.27), ...curl(0.66, 0.15, 0.07, 4.0, 0.268), ...curl(0.58, 0.55, 0.065, 2.4, 0.266));
      break;
    }
    case "crop": {
      parts.push(cap(0.252, Math.PI * 0.5));
      for (let i = 0; i < 6; i++) parts.push(clump(0.6 + r() * 0.08, -0.7 + i * 0.28, 0.062, 1.35)); // fringe
      for (let i = 0; i < 5; i++) parts.push(clump(0.25 + r() * 0.2, i * 1.25, 0.085, 1.2)); // crown volume
      break;
    }
    case "swoop": {
      parts.push(cap(0.252, Math.PI * 0.5));
      // big side-swept quiff
      parts.push(place(new THREE.SphereGeometry(0.13, 20, 14), [0.04, 0.2, 0.1], [0.5, 0, -0.45], [1.25, 0.6, 1]));
      parts.push(place(new THREE.SphereGeometry(0.1, 18, 12), [-0.09, 0.19, 0.06], [0.3, 0, 0.3], [1.2, 0.65, 1]));
      for (let i = 0; i < 4; i++) parts.push(clump(0.35 + r() * 0.3, Math.PI * 0.6 + i * 0.6, 0.085, 1.2));
      break;
    }
    case "bob": {
      parts.push(cap(0.262, Math.PI * 0.6, -0.42));
      for (const s of [-1, 1]) parts.push(place(new THREE.SphereGeometry(1, 18, 14), [s * 0.19, -0.04, -0.01], [0, 0, s * 0.12], [0.085, 0.19, 0.17]));
      parts.push(place(new THREE.SphereGeometry(1, 20, 14), [0, -0.02, -0.14], [0, 0, 0], [0.22, 0.2, 0.13]));
      for (let i = 0; i < 5; i++) parts.push(clump(0.64, -0.75 + i * 0.37, 0.058, 1.35)); // bangs
      break;
    }
    case "bun": {
      parts.push(cap(0.254, Math.PI * 0.52));
      parts.push(place(new THREE.SphereGeometry(0.1, 20, 16), [0, 0.27, -0.07]));
      parts.push(place(new THREE.TorusGeometry(0.075, 0.02, 8, 20), [0, 0.215, -0.06], [Math.PI / 2 - 0.3, 0, 0]));
      for (let i = 0; i < 4; i++) parts.push(clump(0.66, -0.55 + i * 0.37, 0.05, 1.3)); // wisps
      break;
    }
    case "buzz":
      parts.push(cap(0.243, Math.PI * 0.44, -0.3));
      break;
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

export function hairGeometry(style: HairStyle, variant: number): THREE.BufferGeometry {
  const key = `${style}:${variant % 3}`;
  let g = cache.get(key);
  if (!g) cache.set(key, (g = build(style, variant % 3)));
  return g;
}
