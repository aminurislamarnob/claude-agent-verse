import type * as THREE from "three";
import type { Session } from "../types";

// ── Navigation ───────────────────────────────────────────────
// Getting around the office like a game: WASD and the arrow keys move, Q/E turn,
// +/- zoom, and the same actions sit on the on-screen pad. Overview mode drives
// the isometric camera; walk mode drops you into the room at eye height with
// mouse look. The store below is shared by the HUD (outside the canvas) and the
// camera rigs (inside it); everything else here is pure and tested.

export type ViewMode = "overview" | "walk";

/** Continuous actions, held down from a key or a pad button. */
export type NavAction = "forward" | "back" | "left" | "right" | "turnLeft" | "turnRight" | "zoomIn" | "zoomOut" | "run";

/** One-shot commands. */
export type NavCommand = "fit" | "toggleMode" | "nextAttention" | "escape" | "help";

/** `KeyboardEvent.code` → held action. */
export const HOLD_KEYS: Readonly<Record<string, NavAction>> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyQ: "turnLeft",
  KeyE: "turnRight",
  Equal: "zoomIn",
  NumpadAdd: "zoomIn",
  PageUp: "zoomIn",
  Minus: "zoomOut",
  NumpadSubtract: "zoomOut",
  PageDown: "zoomOut",
  ShiftLeft: "run",
  ShiftRight: "run",
};

/** `KeyboardEvent.code` → command, fired on keydown. */
export const COMMAND_KEYS: Readonly<Record<string, NavCommand>> = {
  Home: "fit",
  Digit0: "fit",
  Numpad0: "fit",
  KeyV: "toggleMode",
  KeyN: "nextAttention",
  Escape: "escape",
  KeyH: "help",
  Slash: "help",
};

/** Tuning, in world units (one desk is 1.5 wide) and seconds. */
export const WALK_EYE = 1.45;
export const WALK_SPEED = 2.4;
export const RUN_FACTOR = 2.1;
export const TURN_RATE = 1.7;
/** Radians of look per pixel of mouse travel. */
export const LOOK_RATE = 0.0042;
export const WALK_PITCH = 1.15;
/** Screen pixels per second the overview pans at, whatever the zoom. */
export const PAN_PX = 560;
export const OVERVIEW_TURN = 1.4;
/** Zoom multiplies by e^(rate·s) while held. */
export const ZOOM_RATE = 1.5;
export const ZOOM_STEP = 1.25;

export interface Axes {
  forward: number;
  right: number;
  turn: number;
  zoom: number;
  run: boolean;
}

/** Collapse the held actions into signed axes; diagonals are normalised so they aren't faster. */
export function axesOf(held: ReadonlySet<NavAction>): Axes {
  let forward = (held.has("forward") ? 1 : 0) - (held.has("back") ? 1 : 0);
  let right = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  const len = Math.hypot(forward, right);
  if (len > 1) {
    forward /= len;
    right /= len;
  }
  return {
    forward,
    right,
    turn: (held.has("turnRight") ? 1 : 0) - (held.has("turnLeft") ? 1 : 0),
    zoom: (held.has("zoomIn") ? 1 : 0) - (held.has("zoomOut") ? 1 : 0),
    run: held.has("run"),
  };
}

export const isMoving = (a: Axes) => a.forward !== 0 || a.right !== 0 || a.turn !== 0 || a.zoom !== 0;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Keep a point on the floor, a little in from the walls and the slab edge. */
export function clampToRoom(x: number, z: number, b: Bounds, margin = 0.35): [number, number] {
  const cx = Math.min(Math.max(x, b.minX + margin), b.maxX - margin);
  const cz = Math.min(Math.max(z, b.minZ + margin), b.maxZ - margin);
  return [cx, cz];
}

export const clampPitch = (p: number) => Math.max(-WALK_PITCH, Math.min(WALK_PITCH, p));

/** Yaw (rotation about y, three.js convention) whose forward direction is (fx, fz). */
export function headingOf(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz);
}

/** Unit forward vector on the floor for a yaw. */
export function forwardOf(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

/** Unit right-hand vector on the floor for a yaw. */
export function rightOf(yaw: number): [number, number] {
  return [Math.cos(yaw), -Math.sin(yaw)];
}

/** Shortest signed difference from `from` to `to`, in radians. */
export function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function zoomBy(zoom: number, steps: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, zoom * Math.pow(ZOOM_STEP, steps)));
}

/**
 * The next agent that needs you: everyone waiting on you first, then errors,
 * oldest session first; cycles on from `currentPid` and wraps round.
 */
export function nextAttention(sessions: Session[], currentPid: number | null): Session | null {
  const rank = (s: Session) => (s.state === "waiting_on_user" ? 0 : s.state === "error" ? 1 : 2);
  const list = sessions.filter((s) => rank(s) < 2).sort((a, b) => rank(a) - rank(b) || a.startedAt - b.startedAt || a.pid - b.pid);
  if (!list.length) return null;
  const i = currentPid === null ? -1 : list.findIndex((s) => s.pid === currentPid);
  return list[(i + 1) % list.length];
}

// ── Store ────────────────────────────────────────────────────

export interface Walker {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface Goal {
  target: THREE.Vector3;
  zoom: number;
}

/** Where the camera is, for the minimap. */
export interface CameraPose {
  mode: ViewMode;
  x: number;
  z: number;
  yaw: number;
  zoom: number;
}

export interface NavStore {
  mode: ViewMode;
  held: Set<NavAction>;
  walker: Walker;
  /** A point to turn the walker toward; cleared when reached or when the user looks around. */
  lookAt: { x: number; y: number; z: number } | null;
  /** Where the overview camera is heading; null once it has arrived or the user takes over. */
  goal: Goal | null;
  /** The last whole-room framing, for Home. */
  frame: Goal | null;
  /** Where the walker was standing when walk mode ended, so the overview picks up there. */
  returnTo: { x: number; z: number } | null;
  pose: CameraPose;
  /** Asks the canvas for a frame; set by the bridge inside it. */
  kick: () => void;
  listeners: Set<() => void>;
}

export function createNavStore(): NavStore {
  return {
    mode: "overview",
    held: new Set(),
    walker: { x: 0, z: 0, yaw: 0, pitch: 0 },
    lookAt: null,
    goal: null,
    frame: null,
    returnTo: null,
    pose: { mode: "overview", x: 0, z: 0, yaw: 0, zoom: 40 },
    kick: () => {},
    listeners: new Set(),
  };
}

/** Record a new camera pose and tell the minimap, but only if it actually moved. */
export function publishPose(store: NavStore, pose: CameraPose): void {
  const p = store.pose;
  if (p.mode === pose.mode && Math.abs(p.x - pose.x) < 1e-3 && Math.abs(p.z - pose.z) < 1e-3 && Math.abs(p.yaw - pose.yaw) < 1e-3 && Math.abs(p.zoom - pose.zoom) < 1e-2) return;
  store.pose = pose;
  for (const l of store.listeners) l();
}

export function hold(store: NavStore, action: NavAction, on: boolean): void {
  if (on) store.held.add(action);
  else store.held.delete(action);
  store.kick();
}
