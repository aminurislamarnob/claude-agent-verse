import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, OrthographicCamera, RoundedBox } from "@react-three/drei";
import type { Office } from "../types";
import { createAllocators, planFloor, routeToBreak, type Allocators, type BreakSpot, type FloorPlan, type Pod } from "./layout";
import { NavBridge, OverviewRig, VIEW_DIR, WalkRig, useNavKeys } from "./Navigator";
import { clampToRoom, createNavStore, nextAttention, type NavCommand, type ViewMode } from "./navigation";
import { MiniMap } from "../hud/MiniMap";
import { NavHelp, NavPad } from "../hud/NavPad";
import { BreakAllocator, BreakPresence } from "./breaks";
import { BeanBag, Room } from "./Room";
import { Label, LabelLayer } from "./Label";
import { FloorPlant } from "./Props";
import { Workstation, type Focus } from "./Workstation";
import { palette, teamColor } from "./theme";
import { signTexture } from "./textures";
import type { RoomTheme } from "./rooms";
import { DaylightContext, type Daylight } from "./daylight";

export type { Focus } from "./Workstation";

const ACTIVE_STATES = new Set(["working", "thinking", "waiting_on_user", "error"]);

// ── Pods ─────────────────────────────────────────────────────

function PodZone({
  pod,
  plan,
  breaks,
  focus,
  onSelect,
  far,
}: {
  pod: Pod;
  plan: FloorPlan;
  breaks: Map<number, BreakSpot>;
  focus: Focus;
  onSelect: (f: Focus) => void;
  far: boolean;
}) {
  const accent = teamColor(pod.projectKey);
  const carpet = useMemo(() => new THREE.Color(palette.rug).lerp(new THREE.Color(accent), 0.13), [accent]);
  const live = pod.desks.filter((d) => d.session).length;
  const waiting = pod.desks.filter((d) => d.session?.state === "waiting_on_user").length;
  return (
    <group>
      <RoundedBox
        args={[pod.width - 0.5, 0.014, pod.depth - 0.2]}
        radius={0.006}
        position={[pod.x + pod.width / 2, 0.007, pod.z + pod.depth / 2 - 0.05]}
        receiveShadow
      >
        <meshStandardMaterial color={carpet} roughness={1} />
      </RoundedBox>
      <PodSign pod={pod} accent={accent} live={live} waiting={waiting} far={far} />
      {pod.nooks.map((n, i) => (
        <Nook key={i} x={n.x} z={n.z} seed={i + pod.projectKey.length} />
      ))}
      {pod.desks.map((d) => {
        const spot = d.session ? breaks.get(d.session.pid) ?? null : null;
        const route = spot ? routeToBreak(plan, { x: d.x, z: d.z, podX: pod.x }, spot) : null;
        return (
          <group key={d.key} position={[d.x, 0, d.z]}>
            <Workstation session={d.session} accent={accent} focus={focus} onSelect={onSelect} deskKey={d.key} origin={d} route={route} spot={spot} />
          </group>
        );
      })}
    </group>
  );
}

/** Break-out corner filling an unused desk slot. */
function Nook({ x, z, seed }: { x: number; z: number; seed: number }) {
  return (
    <group position={[x, 0, z]}>
      {seed % 2 ? (
        <>
          <FloorPlant position={[-0.35, 0, 0.2]} size={0.95} />
          <BeanBag position={[0.35, 0, 0.75]} rotation={[0, -0.6, 0]} color="#c9a27e" />
        </>
      ) : (
        <>
          <BeanBag position={[-0.3, 0, 0.6]} rotation={[0, 0.5, 0]} color="#8a93a6" />
          <FloorPlant position={[0.4, 0, 0.15]} size={0.85} pot={palette.potDark} />
        </>
      )}
    </group>
  );
}

/** Floor-standing team sign at the left end of the pod. */
function PodSign({ pod, accent, live, waiting, far }: { pod: Pod; accent: string; live: number; waiting: number; far: boolean }) {
  const detail = `${live} agent${live === 1 ? "" : "s"}${waiting ? ` · ${waiting} waiting` : ""}`;
  const tex = useMemo(() => signTexture(pod.projectKey, detail, accent, waiting > 0), [pod.projectKey, detail, accent, waiting]);
  return (
    <group position={[pod.x + 0.38, 0, pod.z + 0.62]} rotation={[0, 0.55, 0]}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.04, 28]} />
        <meshStandardMaterial color={palette.deskLeg} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 1.2, 10]} />
        <meshStandardMaterial color={palette.deskLeg} roughness={0.4} metalness={0.5} />
      </mesh>
      <RoundedBox args={[1.6, 0.46, 0.03]} radius={0.014} position={[0, 1.4, 0]} castShadow>
        <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 1.4, 0.0155]}>
        <planeGeometry args={[1.58, 0.44]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.638, 0]}>
        <boxGeometry args={[1.6, 0.016, 0.032]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      {/* When zoomed out the sign is too small to read, so float a crisp label at its top. */}
      {far && (
        <Label position={[0, 1.7, 0]} zIndexRange={[10, 0]}>
          <div className="pod-label" style={{ ["--team" as string]: accent }}>
            <span className="pod-label__swatch" />
            <span className="pod-label__name">{pod.projectKey}</span>
            {waiting > 0 && <span className="pod-label__count"><b>{waiting} waiting</b></span>}
          </div>
        </Label>
      )}
    </group>
  );
}

// ── Camera ───────────────────────────────────────────────────

function roomCenter(plan: FloorPlan) {
  return new THREE.Vector3((plan.minX + plan.maxX + 1) / 2, 0.4, (plan.minZ + plan.maxZ + 1) / 2);
}

/**
 * Shadows only change when agents change pose or the sun moves, so the shadow map
 * re-renders for a moment after each office update or change of light instead of
 * on every frame.
 */
function ShadowBudget({ version, light }: { version: unknown; light: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = true;
    const id = setTimeout(() => {
      gl.shadowMap.autoUpdate = false;
      gl.shadowMap.needsUpdate = true;
    }, 1500);
    return () => clearTimeout(id);
  }, [gl, version, light]);
  return null;
}

/** Reports whether the camera is zoomed out past the point where in-world text is legible. */
function ZoomWatcher({ threshold, onChange }: { threshold: number; onChange: (far: boolean) => void }) {
  const last = useRef<boolean | null>(null);
  useFrame(({ camera }) => {
    const far = (camera as THREE.OrthographicCamera).zoom < threshold;
    if (far !== last.current) {
      last.current = far;
      onChange(far);
    }
  });
  return null;
}

/** Drives the demand-mode render loop: brisk while agents move, slow when the office is calm. */
function FrameDriver({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!fps) return;
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [fps, invalidate]);
  return null;
}

/**
 * Daylight and the ceiling fittings. One shadow-casting key light plays the sun
 * by day and the overhead fittings after dark; its direction, colour and strength
 * come from the Daylight record, so shadows swing round the room with the hours.
 */
function Lights({ plan, daylight }: { plan: FloorPlan; daylight: Daylight }) {
  const c = roomCenter(plan);
  const span = Math.max(plan.maxX - plan.minX, plan.maxZ - plan.minZ) * 0.75 + 4;
  const light = useRef<THREE.DirectionalLight>(null);
  const [dx, dy, dz] = daylight.key.dir;
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.copy(c);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = cam.bottom = -span;
    cam.right = cam.top = span;
    cam.updateProjectionMatrix();
  });
  return (
    <>
      <hemisphereLight color={daylight.hemisphere.sky} groundColor={daylight.hemisphere.ground} intensity={daylight.hemisphere.intensity} />
      <ambientLight intensity={daylight.ambient} />
      <directionalLight
        ref={light}
        position={[c.x + dx * 22, dy * 22, c.z + dz * 22]}
        intensity={daylight.key.intensity}
        color={daylight.key.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[c.x + 10, 8, c.z + 12]} intensity={daylight.fill.intensity} color={daylight.fill.color} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -6]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-6, 3, 0]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} color="#ffe9d6" />
        <Lightformer form="ring" intensity={1.5} position={[5, 6, 5]} scale={2} />
      </Environment>
    </>
  );
}

// ── Scene ────────────────────────────────────────────────────

export function OfficeScene({
  office,
  room,
  daylight,
  focus,
  onSelect,
  insetRight = 0,
}: {
  /** The sessions in the room on screen. */
  office: Office;
  room: RoomTheme;
  /** The hour's light, from `useDaylight`. */
  daylight: Daylight;
  focus: Focus;
  onSelect: (f: Focus) => void;
  /** Pixels on the right covered by HUD panels; the camera frames the remaining area. */
  insetRight?: number;
}) {
  // Each room keeps its own sticky desk and break slots, so switching back finds everyone where they were.
  const rooms = useRef(new Map<string, { desks: Allocators; breaks: BreakAllocator }>());
  let slots = rooms.current.get(room.kind);
  if (!slots) rooms.current.set(room.kind, (slots = { desks: createAllocators(), breaks: new BreakAllocator() }));
  const { desks, breaks: breakAlloc } = slots;
  const plan = useMemo(() => planFloor(office, desks), [office, desks]);
  const breaks = useMemo(() => breakAlloc.sync(Object.values(office.sessions), plan.amenities.spots), [office, plan, breakAlloc]);
  const presence = useMemo(() => new Set<string>(), []);

  const [visible, setVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const busy = Object.values(office.sessions).some(
    (s) => ACTIVE_STATES.has(s.state) || Object.values(s.subagents ?? {}).some((a) => ACTIVE_STATES.has(a.state)),
  );
  // a rally needs smooth frames; coffee chat is fine at the idle rate
  const rally = [...breaks.values()].some((s) => s.activity === "pingpong");
  const fps = !visible ? 0 : busy || rally ? 30 : 10;
  const [far, setFar] = useState(true);
  const center = roomCenter(plan);

  // ── Navigation ─────────────────────────────────────────────
  const store = useMemo(createNavStore, []);
  const [mode, setMode] = useState<ViewMode>("overview");
  const [help, setHelp] = useState(false);
  store.mode = mode;
  const ortho = useRef<THREE.OrthographicCamera>(null);
  const fit = useCallback(() => {
    if (store.frame) store.goal = { target: store.frame.target.clone(), zoom: store.frame.zoom };
    store.kick();
  }, [store]);
  const toggleMode = useCallback(() => {
    setMode((m) => (m === "overview" ? "walk" : "overview"));
    setHelp(false);
  }, []);
  const command = useCallback(
    (c: NavCommand) => {
      switch (c) {
        case "fit":
          if (mode === "overview") fit();
          return;
        case "toggleMode":
          return toggleMode();
        case "help":
          return setHelp((h) => !h);
        case "nextAttention": {
          const next = nextAttention(Object.values(office.sessions), focus?.pid ?? null);
          if (next) onSelect({ pid: next.pid });
          return;
        }
        case "escape":
          if (help) return setHelp(false);
          if (focus) return onSelect(null);
          if (mode === "walk") setMode("overview");
          return;
      }
    },
    [mode, fit, toggleMode, office, focus, onSelect, help],
  );
  useNavKeys(store, command);
  const jump = useCallback(
    (x: number, z: number) => {
      const [cx, cz] = clampToRoom(x, z, { minX: plan.minX, maxX: plan.maxX + 1, minZ: plan.minZ, maxZ: plan.maxZ + 1 });
      if (store.mode === "walk") {
        store.walker.x = cx;
        store.walker.z = cz;
        store.lookAt = null;
      } else {
        store.goal = { target: new THREE.Vector3(cx, 0.4, cz), zoom: Math.max(store.pose.zoom, 40) };
      }
      store.kick();
    },
    [store, plan.minX, plan.maxX, plan.minZ, plan.maxZ],
  );

  const labelLayer = useRef<HTMLDivElement>(null);

  return (
    <LabelLayer.Provider value={labelLayer}>
      <div ref={labelLayer} className="label-layer" />
      <Canvas
        frameloop={visible ? "demand" : "never"}
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => onSelect(null)}
      >
        <OrthographicCamera ref={ortho} makeDefault position={center.clone().add(VIEW_DIR.clone().multiplyScalar(60)).toArray()} zoom={40} near={0.1} far={400} />
        <OrbitControls
          makeDefault
          camera={ortho.current ?? undefined}
          enabled={mode === "overview"}
          target={center.toArray() as [number, number, number]}
          enableDamping={false}
          minPolarAngle={0.55}
          maxPolarAngle={1.2}
          minAzimuthAngle={0.12}
          maxAzimuthAngle={1.45}
          minZoom={12}
          maxZoom={260}
          screenSpacePanning
          zoomToCursor
          onStart={() => {
            // a drag takes over from any flight in progress
            store.goal = null;
          }}
        />
        <OverviewRig room={room.kind} plan={plan} breaks={breaks} focus={focus} insetRight={insetRight} store={store} active={mode === "overview"} />
        {mode === "walk" && <WalkRig plan={plan} breaks={breaks} focus={focus} store={store} />}
        <NavBridge store={store} />
        <FrameDriver fps={fps} />
        <ShadowBudget version={office} light={daylight.hour} />
        <ZoomWatcher threshold={72} onChange={setFar} />
        <Lights plan={plan} daylight={daylight} />
        <DaylightContext.Provider value={daylight}>
          <BreakPresence.Provider value={presence}>
            <Room plan={plan} theme={room} />
            {plan.pods.map((pod) => (
              <PodZone key={pod.projectKey} pod={pod} plan={plan} breaks={breaks} focus={focus} onSelect={onSelect} far={far && mode === "overview"} />
            ))}
          </BreakPresence.Provider>
        </DaylightContext.Provider>
      </Canvas>
      <MiniMap plan={plan} office={office} breaks={breaks} store={store} onJump={jump} />
      <NavPad store={store} mode={mode} onToggleMode={toggleMode} onFit={fit} onHelp={() => setHelp((h) => !h)} helpOpen={help} insetRight={insetRight} />
      {help && <NavHelp mode={mode} onClose={() => setHelp(false)} insetRight={insetRight} />}
    </LabelLayer.Provider>
  );
}
