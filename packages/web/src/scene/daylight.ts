import { createContext, useEffect, useState } from "react";
import * as THREE from "three";

// ── Daylight ─────────────────────────────────────────────────
// The office keeps real hours. The sun comes up behind the camera, crosses the
// room and sets through the west windows; the skyline outside fades to city
// lights; the pendants and desk lamps come on at dusk. Every part of the scene
// reads one `Daylight` record, so the look at any hour is a pure function of
// the clock, and `?time=` can pin or fast-forward it for review.

export interface SkyLook {
  top: string;
  horizon: string;
  /** Haze just above the rooftops. */
  glow: string;
  near: string;
  far: string;
  /** Share of windows lit in the buildings outside, 0‥1. */
  lit: number;
  stars: number;
  /** Sun height in the window, -1 (set) ‥ 1 (overhead); drawn only while positive. */
  sun: number;
  sunColor: string;
  moon: boolean;
}

export interface Daylight {
  /** Local hour, 0‥24. */
  hour: number;
  /** The one shadow-casting light: sunlight by day, the ceiling fittings after dark. */
  key: { dir: [number, number, number]; color: string; intensity: number };
  fill: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  ambient: number;
  /** 0 in daylight, 1 once the interior lighting has taken over. */
  interior: number;
  /** Lamps, pendants and desk lights are switched on. */
  lampsOn: boolean;
  sky: SkyLook;
  /** Page background behind the diorama. */
  page: { top: string; bottom: string };
}

interface Stop {
  h: number;
  sun: string;
  sunI: number;
  fill: string;
  fillI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  ambient: number;
  interior: number;
  sky: SkyLook;
  page: [string, string];
}

const NIGHT_SKY: SkyLook = {
  top: "#070d22",
  horizon: "#1a2448",
  glow: "#2a3561",
  near: "#161b2e",
  far: "#232a46",
  lit: 0.72,
  stars: 1,
  sun: -1,
  sunColor: "#ffffff",
  moon: true,
};

const night = (h: number): Stop => ({
  h,
  sun: "#aab8d8",
  sunI: 1.05,
  fill: "#ffd9a8",
  fillI: 0.3,
  hemiSky: "#c9bfae",
  hemiGround: "#2f2b2a",
  hemiI: 0.72,
  ambient: 0.22,
  interior: 1,
  sky: NIGHT_SKY,
  page: ["#33373f", "#1e2127"],
});

const day = (h: number, sky: SkyLook): Stop => ({
  h,
  sun: "#fff6ea",
  sunI: 2.15,
  fill: "#dfe8ff",
  fillI: 0.45,
  hemiSky: "#ffffff",
  hemiGround: "#d6c4a8",
  hemiI: 1.15,
  ambient: 0.25,
  interior: 0,
  sky,
  page: ["#f3efe8", "#e4ddd1"],
});

/** Keyframes around the clock; everything in between is interpolated. */
const STOPS: Stop[] = [
  night(0),
  night(5),
  {
    h: 6.25,
    sun: "#ffb389",
    sunI: 0.9,
    fill: "#c9c3e8",
    fillI: 0.35,
    hemiSky: "#d8c8dd",
    hemiGround: "#8a776f",
    hemiI: 0.85,
    ambient: 0.24,
    interior: 0.6,
    sky: { top: "#4f5f9c", horizon: "#f0a884", glow: "#ffd3ad", near: "#5f6378", far: "#848aa3", lit: 0.42, stars: 0.15, sun: 0.05, sunColor: "#ffd2a0", moon: false },
    page: ["#e6dad6", "#cdbfc3"],
  },
  day(8, { top: "#7fb0e6", horizon: "#dbe9f6", glow: "#fff4e0", near: "#b6bbca", far: "#cfd4df", lit: 0.06, stars: 0, sun: 0.3, sunColor: "#fff7e8", moon: false }),
  day(12, { top: "#5d9de0", horizon: "#cde2f4", glow: "#f7fbff", near: "#b2b8c6", far: "#cbd1dc", lit: 0.04, stars: 0, sun: 0.9, sunColor: "#ffffff", moon: false }),
  day(16, { top: "#78a9e2", horizon: "#e6dccb", glow: "#fff0d8", near: "#aeb0bd", far: "#c7c9d4", lit: 0.08, stars: 0, sun: 0.4, sunColor: "#fff1d6", moon: false }),
  {
    h: 17.75,
    sun: "#ffc28a",
    sunI: 2.0,
    fill: "#d9d6f0",
    fillI: 0.35,
    hemiSky: "#f3dfcb",
    hemiGround: "#c9a98c",
    hemiI: 0.85,
    ambient: 0.22,
    interior: 0.25,
    sky: { top: "#8aa6d6", horizon: "#f3b98f", glow: "#ffd9a6", near: "#948ea3", far: "#b3adbf", lit: 0.3, stars: 0, sun: 0.12, sunColor: "#ffb773", moon: false },
    page: ["#f1e6da", "#dccbbf"],
  },
  {
    h: 18.75,
    sun: "#ff9b6a",
    sunI: 0.6,
    fill: "#c6c3e4",
    fillI: 0.35,
    hemiSky: "#b8aec8",
    hemiGround: "#6e6270",
    hemiI: 0.82,
    ambient: 0.26,
    interior: 0.8,
    sky: { top: "#2a3669", horizon: "#e58a6f", glow: "#ffb088", near: "#3b4060", far: "#535a7c", lit: 0.6, stars: 0.4, sun: -0.05, sunColor: "#ff9b6a", moon: false },
    page: ["#8c8891", "#67636f"],
  },
  night(20),
  night(24),
];

const _a = new THREE.Color();
const _b = new THREE.Color();
function mixColor(a: string, b: string, t: number): string {
  return "#" + _a.set(a).lerp(_b.set(b), t).getHexString();
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixSky(a: SkyLook, b: SkyLook, t: number): SkyLook {
  return {
    top: mixColor(a.top, b.top, t),
    horizon: mixColor(a.horizon, b.horizon, t),
    glow: mixColor(a.glow, b.glow, t),
    near: mixColor(a.near, b.near, t),
    far: mixColor(a.far, b.far, t),
    lit: mix(a.lit, b.lit, t),
    stars: mix(a.stars, b.stars, t),
    sun: mix(a.sun, b.sun, t),
    sunColor: mixColor(a.sunColor, b.sunColor, t),
    moon: t < 0.5 ? a.moon : b.moon,
  };
}

/**
 * Where the sunlight comes from at `hour`. The back wall faces north, so the sun
 * rises on the camera's side (+x), passes high over the front of the room (+z)
 * and sets beyond the windows (-x). Kept at least 17° up so the floor stays lit.
 */
export function sunDirection(hour: number): [number, number, number] {
  const f = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
  const azimuth = f * Math.PI;
  const elevation = Math.max(0.3, Math.sin(f * Math.PI) * 1.05);
  return [Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation) + 0.35];
}

/** Direction of the ceiling fittings' light once the sun is gone: nearly overhead, a little toward the camera. */
const CEILING_DIR: [number, number, number] = [0.3, 1, 0.42];

/** The look of the office at a local hour (0‥24, fractional). */
export function daylightAt(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].h <= h) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
  const interior = mix(a.interior, b.interior, t);
  const sun = sunDirection(h);
  const dir = new THREE.Vector3(...sun).lerp(new THREE.Vector3(...CEILING_DIR).normalize(), interior).normalize();
  return {
    hour: h,
    key: { dir: [dir.x, dir.y, dir.z], color: mixColor(a.sun, b.sun, t), intensity: mix(a.sunI, b.sunI, t) },
    fill: { color: mixColor(a.fill, b.fill, t), intensity: mix(a.fillI, b.fillI, t) },
    hemisphere: { sky: mixColor(a.hemiSky, b.hemiSky, t), ground: mixColor(a.hemiGround, b.hemiGround, t), intensity: mix(a.hemiI, b.hemiI, t) },
    ambient: mix(a.ambient, b.ambient, t),
    interior,
    lampsOn: interior >= 0.5,
    sky: mixSky(a.sky, b.sky, t),
    page: { top: mixColor(a.page[0], b.page[0], t), bottom: mixColor(a.page[1], b.page[1], t) },
  };
}

// ── Clock source ─────────────────────────────────────────────

export type TimeOverride = { kind: "fixed"; hour: number } | { kind: "cycle" } | null;

/** Seconds for a full day in `?time=cycle` mode. */
export const CYCLE_SECONDS = 48;

/** `?time=HH`, `?time=HH:MM`, `?time=HH.H` pin the clock; `?time=cycle` runs a day in CYCLE_SECONDS. */
export function parseTimeOverride(search: string): TimeOverride {
  const raw = new URLSearchParams(search).get("time");
  if (raw === null) return null;
  if (raw === "cycle") return { kind: "cycle" };
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(raw.trim());
  let hour: number;
  if (m) hour = Number(m[1]) + Number(m[2] ?? 0) / 60;
  else if (/^\d{1,2}(\.\d+)?$/.test(raw.trim())) hour = Number(raw);
  else return null;
  return hour >= 0 && hour < 24 ? { kind: "fixed", hour } : null;
}

/** Fractional local hour for a timestamp, honouring an override. */
export function hourAt(now: number, override: TimeOverride): number {
  if (override?.kind === "fixed") return override.hour;
  if (override?.kind === "cycle") return ((now / 1000) % CYCLE_SECONDS) * (24 / CYCLE_SECONDS);
  const d = new Date(now);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

const override: TimeOverride = typeof window === "undefined" ? null : parseTimeOverride(window.location.search);

/** The hour the office shows right now. */
export function currentHour(now = Date.now()): number {
  return hourAt(now, override);
}

/** True while `?time=` is pinning or fast-forwarding the clock. */
export const timeOverridden = override !== null;

/** The look in force for the scene below; defaults to noon for anything rendered outside a provider. */
export const DaylightContext = createContext<Daylight>(daylightAt(12));

/** The office's current look, refreshed every minute (or continuously in cycle mode). */
export function useDaylight(): Daylight {
  const [hour, setHour] = useState(() => currentHour());
  useEffect(() => {
    const period = override?.kind === "cycle" ? 100 : 60_000;
    const id = setInterval(() => setHour(currentHour()), period);
    return () => clearInterval(id);
  }, []);
  // Quantise to the minute so a frame of jitter never re-renders the scene.
  return daylightAt(Math.round(hour * 60) / 60);
}
