import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BreakSpot, FloorPlan } from "./layout";
import type { Focus } from "./Workstation";
import {
  COMMAND_KEYS,
  HOLD_KEYS,
  LOOK_RATE,
  OVERVIEW_TURN,
  PAN_PX,
  RUN_FACTOR,
  TURN_RATE,
  WALK_EYE,
  WALK_SPEED,
  ZOOM_RATE,
  angleDelta,
  axesOf,
  clampPitch,
  clampToRoom,
  forwardOf,
  headingOf,
  isMoving,
  publishPose,
  rightOf,
  zoomBy,
  type NavCommand,
  type NavStore,
} from "./navigation";

// ── Camera rigs ──────────────────────────────────────────────
// OverviewRig drives the isometric camera: it frames the room, flies to a
// focused agent, and applies pan / turn / zoom from the held actions. WalkRig
// swaps in a perspective camera at eye height with WASD and mouse look. Both
// publish their pose to the store for the minimap.

const VIEW_DIR = new THREE.Vector3(1, 0.92, 1.12).normalize();
/** The default viewing direction, for a fresh walker heading. */
export { VIEW_DIR };

/**
 * Frames the room exactly: projects its bounding box into the default view and
 * returns the zoom (px per unit) and aim point that fill the free viewport.
 */
export function frameRoom(plan: FloorPlan, width: number, height: number, inset: { right: number; top: number }) {
  const cam = new THREE.OrthographicCamera();
  cam.position.copy(VIEW_DIR);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const box = new THREE.Box3(new THREE.Vector3(plan.minX - 0.15, -0.4, plan.minZ - 0.15), new THREE.Vector3(plan.maxX + 1, 3.1, plan.maxZ + 1));
  const ext = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    ext.expandByPoint(p.applyMatrix4(cam.matrixWorldInverse));
  }
  const freeW = width - inset.right - 48;
  const freeH = height - inset.top - 32;
  const zoom = Math.min(freeW / (ext.max.x - ext.min.x), freeH / (ext.max.y - ext.min.y));
  // Camera-space centre of the room, shifted so it lands in the middle of the free area.
  const center = ext.getCenter(new THREE.Vector3());
  center.x += inset.right / 2 / zoom;
  center.y += inset.top / 2 / zoom;
  return { zoom, target: center.applyMatrix4(cam.matrixWorld), cam };
}

/** Where a focused agent (or intern) is in the room right now. */
export function focusPoint(plan: FloorPlan, focus: Focus, breaks: Map<number, BreakSpot>): THREE.Vector3 | null {
  if (!focus) return null;
  const spot = !focus.subagentId && breaks.get(focus.pid);
  if (spot) return new THREE.Vector3(spot.x, 1.0, spot.z);
  for (const pod of plan.pods)
    for (const d of pod.desks) {
      if (d.session?.pid !== focus.pid) continue;
      if (focus.subagentId) {
        const idx = Object.keys(d.session.subagents ?? {}).indexOf(focus.subagentId);
        if (idx >= 0 && idx < 3) return new THREE.Vector3(d.x - 0.5 + idx * 0.55, 0.8, d.z + 1.42);
      }
      return new THREE.Vector3(d.x, 1.0, d.z);
    }
  return null;
}

const bounds = (plan: FloorPlan) => ({ minX: plan.minX, maxX: plan.maxX + 1, minZ: plan.minZ, maxZ: plan.maxZ + 1 });

const _dir = new THREE.Vector3();
const _off = new THREE.Vector3();

export function OverviewRig({
  room,
  plan,
  breaks,
  focus,
  insetRight,
  store,
  active,
}: {
  room: string;
  plan: FloorPlan;
  breaks: Map<number, BreakSpot>;
  focus: Focus;
  insetRight: number;
  store: NavStore;
  active: boolean;
}) {
  const { camera, size, controls, invalidate } = useThree() as unknown as {
    camera: THREE.OrthographicCamera;
    size: { width: number; height: number };
    controls: OrbitControlsImpl | null;
    invalidate: () => void;
  };
  const frame = frameRoom(plan, size.width, size.height, { right: insetRight, top: 72 });
  store.frame = { target: frame.target, zoom: frame.zoom };
  // Switching rooms re-frames even when both rooms happen to be the same size.
  const boundsKey = `${room},${plan.minX},${plan.maxX},${plan.minZ},${plan.maxZ},${size.width},${size.height},${insetRight}`;
  const focusKey = focus ? `${focus.pid}:${focus.subagentId ?? ""}:${breaks.get(focus.pid)?.id ?? ""}` : "";

  useEffect(() => {
    if (!active) return;
    const back = store.returnTo;
    store.returnTo = null;
    const p = focusPoint(plan, focus, breaks);
    if (back && !p) {
      // coming up from walk mode: look down at where you were standing
      store.goal = { target: new THREE.Vector3(back.x, 0.4, back.z), zoom: Math.max(camera.zoom, 60) };
    } else if (!p) {
      store.goal = { target: frame.target, zoom: frame.zoom };
    } else {
      const zoom = Math.max(frame.zoom * 2.6, 80);
      // Keep the focused agent centred in the area beside the side panel.
      const right = new THREE.Vector3().setFromMatrixColumn(frame.cam.matrixWorld, 0).multiplyScalar(insetRight / 2 / zoom);
      store.goal = { target: p.clone().add(right), zoom };
    }
    invalidate();
    // plan changes every tick; only re-aim when the room, the focus or the mode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, focusKey, active]);

  useFrame((_, dt) => {
    if (!active || !controls) return;
    const d = Math.min(dt, 0.1);
    const axes = axesOf(store.held);
    const moving = isMoving(axes);
    if (moving) {
      // the user has taken over; stop flying anywhere
      store.goal = null;
      _dir.subVectors(controls.target, camera.position);
      _dir.y = 0;
      _dir.normalize();
      const speed = (PAN_PX / camera.zoom) * (axes.run ? RUN_FACTOR : 1) * d;
      _off.set(_dir.x * axes.forward + -_dir.z * axes.right, 0, _dir.z * axes.forward + _dir.x * axes.right).multiplyScalar(speed);
      controls.target.add(_off);
      camera.position.add(_off);
      if (axes.turn) {
        _off.subVectors(camera.position, controls.target);
        _off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -axes.turn * OVERVIEW_TURN * d);
        camera.position.copy(controls.target).add(_off);
      }
      if (axes.zoom) {
        camera.zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom, camera.zoom * Math.exp(axes.zoom * ZOOM_RATE * d)));
        camera.updateProjectionMatrix();
      }
      controls.update();
      invalidate();
    }
    const g = store.goal;
    if (g) {
      const k = 1 - Math.exp(-d * 5);
      controls.target.lerp(g.target, k);
      camera.zoom += (g.zoom - camera.zoom) * k;
      const dist = camera.position.distanceTo(controls.target);
      _dir.subVectors(camera.position, controls.target).normalize();
      camera.position.copy(controls.target).add(_dir.multiplyScalar(dist));
      camera.updateProjectionMatrix();
      controls.update();
      if (controls.target.distanceTo(g.target) < 0.01 && Math.abs(camera.zoom - g.zoom) < 0.05) store.goal = null;
      else invalidate();
    }
    _dir.subVectors(controls.target, camera.position);
    publishPose(store, { mode: "overview", x: controls.target.x, z: controls.target.z, yaw: headingOf(_dir.x, _dir.z), zoom: camera.zoom });
  });

  return null;
}

const _look = new THREE.Vector3();

export function WalkRig({ plan, breaks, focus, store }: { plan: FloorPlan; breaks: Map<number, BreakSpot>; focus: Focus; store: NavStore }) {
  const cam = useRef<THREE.PerspectiveCamera>(null);
  const { gl, invalidate } = useThree();
  const b = bounds(plan);

  // Drop in where the overview was looking, facing the way it faced.
  useEffect(() => {
    const p = store.pose;
    const [x, z] = clampToRoom(p.x, p.z, b);
    store.walker = { x, z, yaw: p.yaw, pitch: -0.06 };
    store.lookAt = null;
    invalidate();
    return () => {
      store.returnTo = { x: store.walker.x, z: store.walker.z };
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A focused agent turns the walker's head toward them.
  const focusKey = focus ? `${focus.pid}:${focus.subagentId ?? ""}:${breaks.get(focus.pid)?.id ?? ""}` : "";
  useEffect(() => {
    const p = focusPoint(plan, focus, breaks);
    store.lookAt = p ? { x: p.x, y: p.y, z: p.z } : null;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Mouse look: drag anywhere on the canvas, or lock the pointer for a true first-person feel.
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const look = (dx: number, dy: number) => {
      const w = store.walker;
      w.yaw -= dx * LOOK_RATE;
      w.pitch = clampPitch(w.pitch - dy * LOOK_RATE);
      store.lookAt = null;
      invalidate();
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || document.pointerLockElement === el) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement === el) {
        look(e.movementX, e.movementY);
        return;
      }
      if (!dragging) return;
      look(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl, store, invalidate]);

  useFrame((_, dt) => {
    const c = cam.current;
    if (!c) return;
    const d = Math.min(dt, 0.1);
    const w = store.walker;
    const axes = axesOf(store.held);
    let busy = false;
    if (isMoving(axes)) {
      busy = true;
      const speed = WALK_SPEED * (axes.run ? RUN_FACTOR : 1) * d;
      const [fx, fz] = forwardOf(w.yaw);
      const [rx, rz] = rightOf(w.yaw);
      const [x, z] = clampToRoom(w.x + (fx * axes.forward + rx * axes.right) * speed, w.z + (fz * axes.forward + rz * axes.right) * speed, b);
      w.x = x;
      w.z = z;
      if (axes.turn) {
        w.yaw -= axes.turn * TURN_RATE * d;
        store.lookAt = null;
      }
    }
    const at = store.lookAt;
    if (at) {
      _look.set(at.x - w.x, at.y - WALK_EYE, at.z - w.z);
      const yaw = headingOf(_look.x, _look.z);
      const pitch = clampPitch(Math.atan2(_look.y, Math.hypot(_look.x, _look.z)));
      const dy = angleDelta(w.yaw, yaw);
      const dp = pitch - w.pitch;
      const k = 1 - Math.exp(-d * 6);
      w.yaw += dy * k;
      w.pitch += dp * k;
      if (Math.abs(dy) < 0.005 && Math.abs(dp) < 0.005) store.lookAt = null;
      busy = true;
    }
    c.position.set(w.x, WALK_EYE, w.z);
    c.rotation.set(w.pitch, w.yaw, 0, "YXZ");
    publishPose(store, { mode: "walk", x: w.x, z: w.z, yaw: w.yaw, zoom: 1 });
    if (busy) invalidate();
  });

  return <PerspectiveCamera ref={cam} makeDefault fov={68} near={0.05} far={300} position={[store.walker.x, WALK_EYE, store.walker.z]} />;
}

/**
 * Lives inside the canvas so the HUD outside it can ask for frames, and turns a
 * double-click into a zoom toward that spot (overview) or a pointer lock (walk).
 */
export function NavBridge({ store }: { store: NavStore }) {
  const { gl, invalidate, camera, controls } = useThree() as unknown as {
    gl: THREE.WebGLRenderer;
    invalidate: () => void;
    camera: THREE.Camera;
    controls: OrbitControlsImpl | null;
  };
  store.kick = invalidate;
  useEffect(() => {
    const el = gl.domElement;
    const onDouble = (e: MouseEvent) => {
      if (store.mode === "walk") {
        el.requestPointerLock?.();
        return;
      }
      if (!controls || !(camera as THREE.OrthographicCamera).isOrthographicCamera) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector3(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1), 0);
      // where the click lands on the floor
      const origin = ndc.clone().unproject(camera);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      if (Math.abs(dir.y) < 1e-6) return;
      const t = -origin.y / dir.y;
      const hit = origin.add(dir.multiplyScalar(t));
      hit.y = 0.4;
      store.goal = { target: hit, zoom: zoomBy((camera as THREE.OrthographicCamera).zoom, 3, controls.minZoom, controls.maxZoom) };
      invalidate();
    };
    el.addEventListener("dblclick", onDouble);
    return () => el.removeEventListener("dblclick", onDouble);
  }, [gl, camera, controls, store, invalidate]);
  return null;
}

// ── Keyboard ─────────────────────────────────────────────────

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/** Window-level key handling: held keys feed the store, command keys call back. Browser shortcuts (with ⌘/Ctrl) are left alone. */
export function useNavKeys(store: NavStore, onCommand: (c: NavCommand) => void) {
  const cb = useRef(onCommand);
  cb.current = onCommand;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const held = HOLD_KEYS[e.code];
      if (held) {
        if (!e.repeat) {
          store.held.add(held);
          store.kick();
        }
        e.preventDefault();
        return;
      }
      const cmd = COMMAND_KEYS[e.code];
      if (cmd && !e.repeat) {
        cb.current(cmd);
        if (cmd !== "escape") e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const held = HOLD_KEYS[e.code];
      if (held) {
        store.held.delete(held);
        store.kick();
      }
    };
    const blur = () => {
      store.held.clear();
      store.kick();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [store]);
}
