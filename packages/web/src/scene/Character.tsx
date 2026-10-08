import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { AgentState } from "../types";
import { hash, stateColor, type Look } from "./theme";
import { hairGeometry } from "./hair";
import { rallyHit } from "./breaks";

// ── Chibi developer ──────────────────────────────────────────
// Pose and face are pure functions of Agent State, stance and break activity.
// Origin is the hip line (the seat surface when seated); the character faces +z.

export type Stance = "seated" | "standing" | "walking" | "running";
export type Activity = { kind: "pingpong"; side: 0 | 1 } | { kind: "coffee" } | { kind: "lounge"; sprawl?: boolean };
/** Hip line to sole when standing straight, in character units. */
export const STAND_HEIGHT = 0.578;

type Expression = "focused" | "curious" | "alert" | "happy" | "worried" | "neutral";

interface Pose {
  lean: number; // torso pitch (negative leans back)
  head: [number, number, number]; // pitch, yaw, roll
  l: [number, number, number]; // left shoulder x, shoulder z, elbow x
  r: [number, number, number];
}

const POSES: Record<AgentState, Pose> = {
  working: { lean: 0.12, head: [0.18, 0, 0], l: [-0.55, 0.15, -1.0], r: [-0.55, -0.15, -1.0] },
  thinking: { lean: 0.02, head: [-0.22, -0.25, 0.14], l: [-0.45, 0.12, -1.05], r: [-0.55, -0.55, -2.35] },
  waiting_on_user: { lean: -0.06, head: [-0.12, 0.3, -0.08], l: [-0.35, 0.1, -0.6], r: [-2.95, 0.3, -0.1] },
  idle: { lean: -0.28, head: [-0.12, 0.15, 0.06], l: [-2.5, -0.85, -2.1], r: [-2.5, 0.85, -2.1] },
  error: { lean: 0.05, head: [0.05, 0, 0], l: [-2.3, -0.7, -1.65], r: [-2.3, 0.7, -1.65] },
  ended: { lean: 0, head: [0, 0, 0], l: [-0.1, 0.1, -0.2], r: [-0.1, -0.1, -0.2] },
};

const EXPRESSION: Record<AgentState, Expression> = {
  working: "focused",
  thinking: "curious",
  waiting_on_user: "alert",
  idle: "happy",
  error: "worried",
  ended: "neutral",
};

/** Standing poses for break activities. Same shape as POSES; legs straight. */
const STANDING: Record<Activity["kind"] | "idle", Pose> = {
  idle: { lean: 0, head: [0, 0, 0], l: [0.05, -0.1, -0.15], r: [0.05, 0.1, -0.15] },
  lounge: { lean: 0, head: [0, 0, 0], l: [0.05, -0.1, -0.15], r: [0.05, 0.1, -0.15] },
  pingpong: { lean: 0.16, head: [0.1, 0, 0], l: [-0.55, -0.25, -1.0], r: [-0.85, 0.3, -0.7] },
  coffee: { lean: -0.02, head: [-0.05, 0, 0], l: [-0.5, 0.32, -1.55], r: [0.08, 0.12, -0.25] },
};

const damp = THREE.MathUtils.damp;
const _q = new THREE.Quaternion();
const FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

function useMaterials(look: Look) {
  return useMemo(() => {
    const skin = new THREE.Color(look.skin);
    return {
      // soft, slightly velvety skin reads as warm and toy-like
      skin: new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color("#ffd2c2"), sheenRoughness: 0.6 }),
      skinShade: new THREE.MeshStandardMaterial({ color: skin.clone().multiplyScalar(0.82), roughness: 0.7 }),
      nose: new THREE.MeshPhysicalMaterial({ color: skin.clone().lerp(new THREE.Color("#e8836f"), 0.28), roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color("#ffd2c2") }),
      hair: new THREE.MeshPhysicalMaterial({ color: look.hair, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(look.hair).lerp(new THREE.Color("#ffffff"), 0.35), sheenRoughness: 0.4 }),
      top: new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.85 }),
      topShade: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.top).multiplyScalar(0.82), roughness: 0.9 }),
      pants: new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.8 }),
      strap: new THREE.MeshStandardMaterial({ color: look.strap, roughness: 0.7 }),
      button: new THREE.MeshStandardMaterial({ color: "#e3c37a", roughness: 0.3, metalness: 0.7 }),
      shoe: new THREE.MeshPhysicalMaterial({ color: look.shoe, roughness: 0.45, clearcoat: 0.3 }),
      sole: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.shoe).lerp(new THREE.Color("#ffffff"), 0.55), roughness: 0.6 }),
      sclera: new THREE.MeshPhysicalMaterial({ color: "#fbfbf8", roughness: 0.25, clearcoat: 1 }),
      iris: new THREE.MeshPhysicalMaterial({ color: look.iris, roughness: 0.3, clearcoat: 1 }),
      pupil: new THREE.MeshStandardMaterial({ color: "#121318", roughness: 0.2 }),
      lash: new THREE.MeshStandardMaterial({ color: "#2a1d18", roughness: 0.6 }),
      brow: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair).multiplyScalar(0.85), roughness: 0.7 }),
      white: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      blush: new THREE.MeshBasicMaterial({ color: "#ff7f7f", transparent: true, opacity: 0.38, depthWrite: false }),
      mouth: new THREE.MeshStandardMaterial({ color: "#8a3838", roughness: 0.5 }),
      mouthDark: new THREE.MeshStandardMaterial({ color: "#5a2020", roughness: 0.6 }),
      tongue: new THREE.MeshStandardMaterial({ color: "#e57f7f", roughness: 0.6 }),
      frame: new THREE.MeshStandardMaterial({ color: "#1d1f24", roughness: 0.3, metalness: 0.4 }),
      gear: new THREE.MeshStandardMaterial({ color: "#2b2d33", roughness: 0.5 }),
    };
  }, [look]);
}

function Hair({ look, mat }: { look: Look; mat: THREE.Material }) {
  const geometry = hairGeometry(look.hairStyle, hash(look.hair + look.top + look.skin));
  return <mesh geometry={geometry} material={mat} castShadow />;
}

function Beanie({ color }: { color: string }) {
  return (
    <group rotation={[-0.3, 0, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.252, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.038, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.243, 0.03, 10, 32]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.26, 0]} castShadow>
        <sphereGeometry args={[0.05, 14, 12]} />
        <meshStandardMaterial color="#f4f2ee" roughness={1} />
      </mesh>
    </group>
  );
}

/** Arm chain: shoulder → upper arm → elbow → forearm → hand. Hangs along -y at rest. */
function Arm({
  side,
  refs,
  mats,
  children,
}: {
  side: 1 | -1;
  refs: { shoulder: React.RefObject<THREE.Group | null>; elbow: React.RefObject<THREE.Group | null> };
  mats: ReturnType<typeof useMaterials>;
  children?: React.ReactNode;
}) {
  return (
    <group ref={refs.shoulder} position={[side * 0.18, 0.31, 0]}>
      <mesh material={mats.top} position={[0, -0.08, 0]} castShadow>
        <capsuleGeometry args={[0.052, 0.1, 6, 12]} />
      </mesh>
      <group ref={refs.elbow} position={[0, -0.17, 0]}>
        <mesh material={mats.top} position={[0, -0.06, 0]} castShadow>
          <capsuleGeometry args={[0.046, 0.07, 6, 12]} />
        </mesh>
        <mesh material={mats.topShade} position={[0, -0.115, 0]}>
          <cylinderGeometry args={[0.044, 0.044, 0.025, 14]} />
        </mesh>
        {/* chubby mitten hand with a little thumb */}
        <mesh material={mats.skin} position={[0, -0.16, 0]} scale={[1, 1.05, 0.9]} castShadow>
          <sphereGeometry args={[0.056, 18, 14]} />
        </mesh>
        <mesh material={mats.skin} position={[-side * 0.035, -0.15, 0.03]} scale={[0.7, 1, 0.7]}>
          <sphereGeometry args={[0.022, 10, 8]} />
        </mesh>
        {children}
      </group>
    </group>
  );
}

export function Character({
  look,
  state,
  accent,
  floor = -0.44,
  stance = "seated",
  activity,
  stride,
  ...props
}: {
  look: Look;
  state: AgentState;
  accent: string;
  /** floor height in local units when seated */
  floor?: number;
  stance?: Stance;
  activity?: Activity;
  /** Distance walked, in radians of gait cycle; advanced by whoever moves the character. */
  stride?: React.RefObject<number>;
} & ThreeElements["group"]) {
  const mats = useMaterials(look);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const lS = useRef<THREE.Group>(null);
  const lE = useRef<THREE.Group>(null);
  const rS = useRef<THREE.Group>(null);
  const rE = useRef<THREE.Group>(null);
  const bubble = useRef<THREE.Group>(null);
  const alert = useRef<THREE.Group>(null);
  const paddle = useRef<THREE.Group>(null);
  const paddleFace = useRef<THREE.Group>(null);
  const sweat = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const rig = useRef<THREE.Group>(null);
  const hips = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const mug = useRef<THREE.Group>(null);
  const bat = useRef<THREE.Group>(null);
  const seed = useMemo(() => Math.random() * 100, []);
  const moving = stance === "walking" || stance === "running";
  const expr: Expression = stance === "running" ? "alert" : EXPRESSION[state];

  useFrame(({ clock, camera }, dt) => {
    const t = clock.elapsedTime + seed;
    const seated = stance === "seated";
    const running = stance === "running";
    const pose = seated ? POSES[state] : moving ? STANDING.idle : STANDING[activity?.kind ?? "idle"];
    const k = moving ? 14 : 8;
    const d = Math.min(dt, 0.1);
    const g = stride?.current ?? 0;
    const gait = moving ? Math.sin(g) : 0;

    // ping-pong swing: a quick backswing then a forward stroke as the ball arrives
    const hit = activity?.kind === "pingpong" && !moving ? rallyHit(clock.elapsedTime, activity.side) : 0;
    // coffee: an unhurried sip every few seconds
    const sip = activity?.kind === "coffee" && !moving ? Math.max(0, Math.sin(t * 0.9) - 0.6) / 0.4 : 0;

    if (rig.current) {
      const bob = running ? Math.abs(Math.sin(g)) * 0.06 : moving ? Math.abs(Math.sin(g)) * 0.025 : 0;
      rig.current.position.y = damp(rig.current.position.y, bob, 20, d);
    }
    // legs: seated thighs forward; standing straight; walking and running swing in opposition
    for (let i = 0; i < 2; i++) {
      const hip = hips.current[i];
      const knee = knees.current[i];
      if (!hip || !knee) continue;
      const phase = Math.sin(g + i * Math.PI);
      let h = 0;
      let kn = 0;
      if (seated && activity?.kind === "lounge" && activity.sprawl) {
        // sunk into a bean bag: knees up a little, legs stretched out
        h = -1.75 - i * 0.12;
        kn = 1.0 + i * 0.1;
      } else if (seated) {
        h = -Math.PI / 2;
        kn = Math.PI / 2;
      } else if (moving) {
        const amp = running ? 0.85 : 0.5;
        h = phase * amp;
        kn = (running ? 0.35 : 0.1) + Math.max(0, Math.sin(g + i * Math.PI + 1.3)) * (running ? 1.5 : 0.7);
      } else if (activity?.kind === "pingpong") {
        h = -0.22;
        kn = 0.42;
      }
      hip.rotation.x = damp(hip.rotation.x, h, k, d);
      knee.rotation.x = damp(knee.rotation.x, kn, k, d);
    }

    if (torso.current) {
      const breathe = Math.sin(t * 1.6) * 0.012;
      const bounce = state === "waiting_on_user" && seated ? Math.abs(Math.sin(t * 5)) * 0.03 : 0;
      const sprawl = seated && activity?.kind === "lounge" && activity.sprawl ? -0.22 : 0;
      const lean = running ? 0.32 : stance === "walking" ? 0.06 : pose.lean + sprawl;
      torso.current.rotation.x = damp(torso.current.rotation.x, lean + breathe, k, d);
      torso.current.rotation.y = damp(torso.current.rotation.y, moving ? gait * 0.12 : hit * 0.35, k, d);
      torso.current.position.y = damp(torso.current.position.y, bounce, k, d);
    }
    if (head.current) {
      let [px, py, pz] = pose.head;
      if (seated) {
        if (state === "working") px += Math.sin(t * 2.2) * 0.04;
        if (state === "thinking") pz += Math.sin(t * 0.9) * 0.08;
        if (state === "idle") py += Math.sin(t * 0.5) * 0.25;
        if (state === "error") py += Math.sin(t * 9) * 0.12;
      } else if (moving) {
        px = running ? -0.15 : 0;
      } else if (activity?.kind === "coffee") {
        py += Math.sin(t * 0.4) * 0.3;
        px -= sip * 0.25;
      }
      head.current.rotation.x = damp(head.current.rotation.x, px, k, d);
      head.current.rotation.y = damp(head.current.rotation.y, py, k, d);
      head.current.rotation.z = damp(head.current.rotation.z, pz, k, d);
    }
    // arms
    const typing = state === "working" && seated ? 0.12 : 0;
    const wave = state === "waiting_on_user" && seated ? Math.sin(t * 5) * 0.22 : 0;
    const set = (s: React.RefObject<THREE.Group | null>, e: React.RefObject<THREE.Group | null>, p: [number, number, number], extraX: number, extraZ: number, extraE = 0) => {
      if (!s.current || !e.current) return;
      s.current.rotation.x = damp(s.current.rotation.x, p[0] + extraX, k, d);
      s.current.rotation.z = damp(s.current.rotation.z, p[1] + extraZ, k, d);
      e.current.rotation.x = damp(e.current.rotation.x, p[2] - extraX * 0.6 + extraE, k, d);
    };
    if (moving) {
      const amp = running ? 0.9 : 0.45;
      const elbow = running ? -1.45 : -0.3;
      set(lS, lE, [0, -0.1, elbow], -gait * amp, 0);
      set(rS, rE, [0, 0.1, elbow], gait * amp, 0);
    } else {
      set(lS, lE, pose.l, Math.sin(t * 14) * typing - sip * 0.75, sip * 0.15, -sip * 0.35);
      set(rS, rE, pose.r, Math.sin(t * 14 + 2) * typing - hit * 0.7, wave + hit * 0.35);
    }
    if (mug.current) {
      mug.current.visible = activity?.kind === "coffee" && !moving;
      // keep the cup upright whatever the arm is doing
      mug.current.parent!.getWorldQuaternion(_q).invert();
      mug.current.quaternion.copy(_q);
    }
    if (bat.current) bat.current.visible = activity?.kind === "pingpong" && !moving;

    // blink: quick close every few seconds; focused eyes stay narrowed
    if (eyes.current) {
      const open = expr === "focused" ? 0.72 : expr === "alert" ? 1.12 : expr === "happy" ? 0.9 : 1;
      const blink = (t % 3.7) < 0.12 ? 0.1 : 1;
      eyes.current.scale.y = damp(eyes.current.scale.y, open * blink, 20, d);
      const look = expr === "curious" ? 0.03 : 0;
      eyes.current.position.y = damp(eyes.current.position.y, look, k, d);
    }
    if (bubble.current) {
      bubble.current.visible = state === "thinking";
      bubble.current.children.forEach((c, i) => {
        if (i >= 3) c.position.y = 0.0 + Math.max(0, Math.sin(t * 4 - (i - 3) * 0.8)) * 0.025;
      });
    }
    if (paddle.current) paddle.current.visible = state === "waiting_on_user";
    if (paddleFace.current && state === "waiting_on_user") {
      // Disk's flat face is local +y; turn it toward the camera.
      const parent = paddleFace.current.parent!;
      parent.getWorldQuaternion(_q).invert();
      paddleFace.current.quaternion.copy(_q).multiply(camera.quaternion).multiply(FACE_UP);
    }
    if (alert.current) {
      alert.current.visible = state === "error";
      alert.current.position.y = 0.98 + Math.abs(Math.sin(t * 3)) * 0.03;
      alert.current.rotation.y = Math.sin(t * 2) * 0.3;
    }
    if (sweat.current) {
      sweat.current.visible = state === "error";
      sweat.current.position.y = 0.05 - ((t * 0.5) % 1) * 0.07;
    }
    if (ring.current) {
      const pulse = state === "waiting_on_user" || state === "error" ? 1 + ((t * 1.2) % 1) * 0.6 : 1;
      ring.current.scale.setScalar(pulse);
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = state === "waiting_on_user" || state === "error" ? 0.55 * (1.6 - pulse) / 0.6 : 0.0;
      ring.current.position.y = (seated ? floor : -STAND_HEIGHT) + 0.01;
    }
  });

  // positive tilt raises the inner ends of the brows
  const browTilt = { focused: -0.22, curious: 0.08, alert: 0.12, happy: 0.04, worried: 0.38, neutral: 0 }[expr];
  const browLift = { focused: -0.01, curious: 0.02, alert: 0.03, happy: 0.012, worried: 0.012, neutral: 0 }[expr];

  return (
    <group {...props}>
      {/* state ring on the floor */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, floor + 0.01, 0.05]}>
        <ringGeometry args={[0.36, 0.42, 48]} />
        <meshBasicMaterial color={stateColor[state]} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>

      <group ref={rig}>
      {/* legs: hip → thigh → knee → shin → shoe; hang straight down at rest */}
      {[-1, 1].map((s, i) => (
        <group key={s} ref={(g) => void (hips.current[i] = g)} position={[s * 0.085, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh material={mats.pants} position={[0, -0.12, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.2, 6, 12]} />
          </mesh>
          <group ref={(g) => void (knees.current[i] = g)} position={[0, -0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={mats.pants} position={[0, -0.17, 0]} castShadow>
              <capsuleGeometry args={[0.058, 0.2, 6, 12]} />
            </mesh>
            {/* oversized, rounded sneakers */}
            <RoundedBox args={[0.125, 0.09, 0.21]} radius={0.042} smoothness={5} position={[0, -0.345, 0.055]} material={mats.shoe} castShadow />
            <RoundedBox args={[0.13, 0.024, 0.215]} radius={0.011} position={[0, -0.386, 0.055]} material={mats.sole} />
          </group>
        </group>
      ))}

      <group ref={torso} position={[0, 0.06, -0.02]}>
        {/* hoodie body */}
        <mesh material={mats.top} position={[0, 0.17, 0]} castShadow>
          <capsuleGeometry args={[0.165, 0.16, 8, 20]} />
        </mesh>
        {look.outfit === "hoodie" ? (
          <>
            <mesh material={mats.topShade} position={[0, 0.3, -0.12]} rotation={[0.5, 0, 0]} castShadow>
              <torusGeometry args={[0.1, 0.045, 10, 20]} />
            </mesh>
            <RoundedBox args={[0.2, 0.08, 0.04]} radius={0.02} position={[0, 0.1, 0.15]} material={mats.topShade} />
            {[-1, 1].map((s) => (
              <mesh key={s} material={mats.white} position={[s * 0.035, 0.24, 0.158]}>
                <cylinderGeometry args={[0.005, 0.005, 0.08, 6]} />
              </mesh>
            ))}
          </>
        ) : (
          <>
            {/* overalls: denim lower half, bib, straps with brass buttons */}
            <mesh material={mats.pants} position={[0, 0.13, 0]} castShadow>
              <sphereGeometry args={[0.172, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            </mesh>
            <mesh material={mats.pants} position={[0, 0.13, 0]}>
              <cylinderGeometry args={[0.172, 0.172, 0.04, 24]} />
            </mesh>
            <RoundedBox args={[0.19, 0.13, 0.03]} radius={0.012} position={[0, 0.17, 0.152]} rotation={[-0.08, 0, 0]} material={mats.pants} />
            {[-1, 1].map((s) => (
              <group key={s}>
                <RoundedBox args={[0.04, 0.2, 0.022]} radius={0.008} position={[s * 0.068, 0.27, 0.13]} rotation={[-0.45, 0, 0]} material={mats.strap} />
                <mesh material={mats.button} position={[s * 0.068, 0.215, 0.168]}>
                  <sphereGeometry args={[0.015, 12, 10]} />
                </mesh>
              </group>
            ))}
          </>
        )}
        {/* lanyard badge in team colour */}
        <mesh position={[0.07, 0.19, 0.165]} rotation={[0.1, 0, 0.08]}>
          <boxGeometry args={[0.045, 0.06, 0.006]} />
          <meshStandardMaterial color={accent} roughness={0.4} />
        </mesh>

        <Arm side={-1} refs={{ shoulder: lS, elbow: lE }} mats={mats}>
          {/* coffee on break */}
          <group ref={mug} position={[0.0, -0.17, 0.05]} visible={false}>
            <mesh castShadow>
              <cylinderGeometry args={[0.04, 0.035, 0.085, 18]} />
              <meshStandardMaterial color="#f4f2ee" roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.043, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.036, 18]} />
              <meshStandardMaterial color="#5b3a26" roughness={0.3} />
            </mesh>
            <mesh position={[0.045, 0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.02, 0.006, 6, 12, Math.PI]} />
              <meshStandardMaterial color="#f4f2ee" roughness={0.35} />
            </mesh>
          </group>
        </Arm>
        <Arm side={1} refs={{ shoulder: rS, elbow: rE }} mats={mats}>
          {/* ping-pong bat: handle in the fist, blade facing forward */}
          <group ref={bat} visible={false}>
            <mesh position={[0, -0.2, 0.01]}>
              <cylinderGeometry args={[0.012, 0.014, 0.08, 8]} />
              <meshStandardMaterial color="#c9a27e" roughness={0.6} />
            </mesh>
            <group position={[0, -0.3, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.075, 0.075, 0.012, 28]} />
                <meshStandardMaterial color="#d6453d" roughness={0.6} />
              </mesh>
              <mesh position={[0, -0.0065, 0]}>
                <cylinderGeometry args={[0.075, 0.075, 0.002, 28]} />
                <meshStandardMaterial color="#1d1f24" roughness={0.6} />
              </mesh>
            </group>
          </group>
          {/* "!" paddle held up while waiting on you; extends past the hand along the arm */}
          <group ref={paddle} visible={false}>
            <mesh position={[0, -0.27, 0]}>
              <cylinderGeometry args={[0.009, 0.009, 0.22, 8]} />
              <meshStandardMaterial color="#c9a27e" roughness={0.6} />
            </mesh>
            {/* billboarded so the "!" always faces the viewer */}
            <group ref={paddleFace} position={[0, -0.45, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.125, 0.125, 0.02, 36]} />
                <meshStandardMaterial color={stateColor.waiting_on_user} emissive={stateColor.waiting_on_user} emissiveIntensity={0.35} roughness={0.35} />
              </mesh>
              <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0105, 0]}>
                <mesh position={[0, 0.022, 0]}>
                  <planeGeometry args={[0.03, 0.085]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
                <mesh position={[0, -0.05, 0]}>
                  <circleGeometry args={[0.018, 16]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            </group>
          </group>
        </Arm>

        {/* head: big, round and soft, with baby-chubby cheeks */}
        <group ref={head} position={[0, 0.56, 0.01]}>
          <mesh material={mats.skin} scale={[1, 0.94, 0.96]} castShadow>
            <sphereGeometry args={[0.235, 44, 34]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={`ear${s}`} position={[s * 0.232, -0.025, 0]} rotation={[0, s * 0.35, 0]}>
              <mesh material={mats.skin} scale={[0.45, 0.85, 0.7]}>
                <sphereGeometry args={[0.07, 18, 14]} />
              </mesh>
              <mesh material={mats.skinShade} position={[s * 0.012, 0, 0.014]} scale={[0.28, 0.58, 0.42]}>
                <sphereGeometry args={[0.07, 14, 10]} />
              </mesh>
            </group>
          ))}

          {look.beanie ? <Beanie color={accent} /> : <Hair look={look} mat={mats.hair} />}

          {/* face */}
          <group position={[0, -0.02, 0]}>
            {[-1, 1].map((s) => (
              <mesh key={`cheek${s}`} material={mats.skin} position={[s * 0.115, -0.085, 0.115]} scale={[1, 0.85, 0.9]}>
                <sphereGeometry args={[0.1, 24, 18]} />
              </mesh>
            ))}
            {/* big glossy eyes: white, coloured iris, pupil, two highlights, upper lashes */}
            <group ref={eyes}>
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.088, -0.015, 0.188]} rotation={[0, s * 0.3, 0]}>
                  <mesh material={mats.sclera} scale={[0.058, 0.066, 0.036]}>
                    <sphereGeometry args={[1, 24, 18]} />
                  </mesh>
                  <group position={[0, -0.004, 0.026]}>
                    <mesh material={mats.iris} scale={[0.041, 0.046, 0.016]}>
                      <sphereGeometry args={[1, 22, 16]} />
                    </mesh>
                    <mesh material={mats.pupil} position={[0, 0, 0.009]} scale={[0.022, 0.025, 0.01]}>
                      <sphereGeometry args={[1, 16, 12]} />
                    </mesh>
                    <mesh material={mats.white} position={[0.014, 0.017, 0.02]}>
                      <sphereGeometry args={[0.011, 10, 8]} />
                    </mesh>
                    <mesh material={mats.white} position={[-0.012, -0.015, 0.019]}>
                      <sphereGeometry args={[0.005, 8, 6]} />
                    </mesh>
                  </group>
                  <mesh material={mats.lash} position={[0, 0.002, 0.012]} rotation={[0, 0, Math.PI * 0.14]} scale={[1, 1.12, 1]}>
                    <torusGeometry args={[0.06, 0.0075, 6, 18, Math.PI * 0.72]} />
                  </mesh>
                  <mesh material={mats.lash} position={[s * 0.062, 0.03, 0.006]} rotation={[0, 0, -s * 0.9]}>
                    <capsuleGeometry args={[0.005, 0.016, 4, 6]} />
                  </mesh>
                </group>
              ))}
            </group>
            {/* arched brows */}
            {[-1, 1].map((s) => (
              <mesh key={`brow${s}`} material={mats.brow} position={[s * 0.09, 0.07 + browLift, 0.207]} rotation={[-0.15, s * 0.3, Math.PI * 0.2 - s * browTilt]} scale={[1, 1, 0.6]}>
                <torusGeometry args={[0.045, 0.0085, 6, 14, Math.PI * 0.6]} />
              </mesh>
            ))}
            {/* button nose */}
            <mesh material={mats.nose} position={[0, -0.075, 0.205]} scale={[1.15, 0.85, 0.8]}>
              <sphereGeometry args={[0.026, 18, 14]} />
            </mesh>
            {/* rosy cheeks */}
            {[-1, 1].map((s) => (
              <mesh key={`blush${s}`} material={mats.blush} position={[s * 0.128, -0.08, 0.2]} rotation={[0.1, s * 0.5, 0]}>
                <circleGeometry args={[0.04, 24]} />
              </mesh>
            ))}
            <group position={[0, -0.118, 0.18]} rotation={[0.75, 0, 0]}>
              <Mouth expr={expr} mats={mats} />
            </group>
          </group>

          {look.glasses && (
            <group position={[0, -0.035, 0.235]}>
              {[-1, 1].map((s) => (
                <mesh key={s} material={mats.frame} position={[s * 0.088, 0, 0]}>
                  <torusGeometry args={[0.068, 0.007, 8, 32]} />
                </mesh>
              ))}
              <mesh material={mats.frame} position={[0, 0.008, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.005, 0.005, 0.04, 6]} />
              </mesh>
            </group>
          )}

          {look.headphones && (
            <group>
              <mesh material={mats.gear} rotation={[0, 0, 0]} position={[0, 0.02, -0.01]}>
                <torusGeometry args={[0.255, 0.016, 10, 36, Math.PI]} />
              </mesh>
              {[-1, 1].map((s) => (
                <RoundedBox key={s} args={[0.05, 0.11, 0.09]} radius={0.025} position={[s * 0.245, 0.0, -0.01]} material={mats.gear} />
              ))}
            </group>
          )}

          {/* sweat drop (error) */}
          <mesh ref={sweat} position={[0.215, 0.04, 0.13]} scale={[0.028, 0.04, 0.028]} visible={false}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshStandardMaterial color="#8ec5ff" roughness={0.1} transparent opacity={0.85} />
          </mesh>
        </group>
      </group>

      </group>

      {/* thought bubble (thinking) */}
      <group ref={bubble} position={[0.3, 1.0, 0.05]} visible={false}>
        <mesh position={[-0.13, -0.17, 0]}>
          <sphereGeometry args={[0.025, 12, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
        <mesh position={[-0.07, -0.09, 0]}>
          <sphereGeometry args={[0.04, 14, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
        <RoundedBox args={[0.3, 0.16, 0.08]} radius={0.075} position={[0.08, 0.05, 0]}>
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </RoundedBox>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[0.01 + i * 0.07, 0.05, 0.045]}>
            <mesh>
              <sphereGeometry args={[0.018, 12, 10]} />
              <meshBasicMaterial color={stateColor.thinking} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* red alert badge beside the head on error */}
      <group ref={alert} position={[-0.27, 0.98, 0.05]} visible={false}>
        <mesh>
          <sphereGeometry args={[0.085, 24, 18]} />
          <meshStandardMaterial color={stateColor.error} emissive={stateColor.error} emissiveIntensity={0.45} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.018, 0.072]}>
          <capsuleGeometry args={[0.012, 0.038, 4, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, -0.042, 0.074]}>
          <sphereGeometry args={[0.013, 10, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}

/** Mouth shapes, drawn on a plane tilted to follow the lower face. */
function Mouth({ expr, mats }: { expr: Expression; mats: ReturnType<typeof useMaterials> }) {
  switch (expr) {
    case "happy":
      // open, toothless grin with a little tongue
      return (
        <group>
          <mesh material={mats.mouthDark} scale={[1, 0.75, 1]}>
            <circleGeometry args={[0.036, 24, Math.PI, Math.PI]} />
          </mesh>
          <mesh material={mats.tongue} position={[0, -0.019, 0.001]} scale={[1, 0.55, 1]}>
            <circleGeometry args={[0.018, 16]} />
          </mesh>
          <mesh material={mats.mouth} position={[0, 0, 0.001]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.004, 0.068, 4, 6]} />
          </mesh>
        </group>
      );
    case "alert":
      return (
        <mesh material={mats.mouthDark} scale={[0.022, 0.028, 1]}>
          <circleGeometry args={[1, 20]} />
        </mesh>
      );
    case "worried":
      return (
        <mesh material={mats.mouth} position={[0, -0.01, 0]}>
          <torusGeometry args={[0.022, 0.006, 8, 16, Math.PI]} />
        </mesh>
      );
    case "curious":
      return (
        <mesh material={mats.mouth} position={[0.012, 0, 0]} rotation={[0, 0, Math.PI + 0.35]}>
          <torusGeometry args={[0.018, 0.006, 8, 16, Math.PI * 0.8]} />
        </mesh>
      );
    case "focused":
      return (
        <mesh material={mats.mouth} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.006, 0.024, 4, 8]} />
        </mesh>
      );
    default:
      return (
        <mesh material={mats.mouth} position={[0, 0.008, 0]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.026, 0.0065, 8, 18, Math.PI]} />
        </mesh>
      );
  }
}
