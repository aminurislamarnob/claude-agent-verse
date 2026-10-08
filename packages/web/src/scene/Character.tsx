import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { AgentState } from "../types";
import { stateColor, type Look } from "./theme";

// ── Chibi developer ──────────────────────────────────────────
// A seated character whose pose and face are pure functions of Agent State.
// Origin is the seat surface; the character faces +z.

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

const damp = THREE.MathUtils.damp;
const _q = new THREE.Quaternion();
const FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

function useMaterials(look: Look) {
  return useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.62 }),
      hair: new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.75 }),
      top: new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.85 }),
      topShade: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.top).multiplyScalar(0.82), roughness: 0.9 }),
      pants: new THREE.MeshStandardMaterial({ color: "#2e323b", roughness: 0.85 }),
      shoe: new THREE.MeshStandardMaterial({ color: "#f5f4f1", roughness: 0.5 }),
      sole: new THREE.MeshStandardMaterial({ color: "#d6d3cd", roughness: 0.6 }),
      eye: new THREE.MeshStandardMaterial({ color: "#1b1c21", roughness: 0.15 }),
      white: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      blush: new THREE.MeshBasicMaterial({ color: "#ff8f8f", transparent: true, opacity: 0.32, depthWrite: false }),
      mouth: new THREE.MeshStandardMaterial({ color: "#5a2a2a", roughness: 0.5 }),
      frame: new THREE.MeshStandardMaterial({ color: "#1d1f24", roughness: 0.3, metalness: 0.4 }),
      gear: new THREE.MeshStandardMaterial({ color: "#2b2d33", roughness: 0.5 }),
    }),
    [look],
  );
}

function Hair({ look, mat }: { look: Look; mat: THREE.Material }) {
  const cap = (thetaLen: number, r = 0.243) => (
    <mesh material={mat} castShadow>
      <sphereGeometry args={[r, 32, 20, 0, Math.PI * 2, 0, thetaLen]} />
    </mesh>
  );
  switch (look.hairStyle) {
    case "buzz":
      return <group rotation={[-0.25, 0, 0]}>{cap(Math.PI * 0.42, 0.236)}</group>;
    case "bun":
      return (
        <group rotation={[-0.3, 0, 0]}>
          {cap(Math.PI * 0.48)}
          <mesh material={mat} position={[0, 0.25, -0.06]} castShadow>
            <sphereGeometry args={[0.085, 20, 16]} />
          </mesh>
        </group>
      );
    case "curly":
      return (
        <group>
          <group rotation={[-0.3, 0, 0]}>{cap(Math.PI * 0.46)}</group>
          {Array.from({ length: 14 }).map((_, i) => {
            const a = (i / 14) * Math.PI * 2;
            const ring = i % 2 ? 0.17 : 0.11;
            return (
              <mesh key={i} material={mat} position={[Math.cos(a) * ring, 0.17 + (i % 2) * 0.04, Math.sin(a) * ring - 0.02]} castShadow>
                <sphereGeometry args={[0.07, 14, 12]} />
              </mesh>
            );
          })}
        </group>
      );
    case "bob":
      return (
        <group>
          <group rotation={[-0.42, 0, 0]}>{cap(Math.PI * 0.56, 0.25)}</group>
          {[-1, 1].map((s) => (
            <mesh key={s} material={mat} position={[s * 0.19, -0.05, -0.02]} scale={[0.07, 0.17, 0.15]} castShadow>
              <sphereGeometry args={[1, 16, 12]} />
            </mesh>
          ))}
          <mesh material={mat} position={[0, -0.03, -0.13]} scale={[0.2, 0.18, 0.12]} castShadow>
            <sphereGeometry args={[1, 18, 14]} />
          </mesh>
        </group>
      );
    case "swoop":
      return (
        <group>
          <group rotation={[-0.32, 0, 0]}>{cap(Math.PI * 0.47)}</group>
          <mesh material={mat} position={[0.06, 0.17, 0.1]} rotation={[0.4, 0, -0.5]} scale={[0.16, 0.07, 0.11]} castShadow>
            <sphereGeometry args={[1, 18, 12]} />
          </mesh>
        </group>
      );
    default:
      return (
        <group>
          <group rotation={[-0.34, 0, 0]}>{cap(Math.PI * 0.47)}</group>
          {[-0.09, -0.02, 0.06].map((x, i) => (
            <mesh key={i} material={mat} position={[x, 0.15, 0.17]} rotation={[0.9, 0, (i - 1) * 0.3]} scale={[0.06, 0.035, 0.05]} castShadow>
              <sphereGeometry args={[1, 12, 10]} />
            </mesh>
          ))}
        </group>
      );
  }
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
        <mesh material={mats.skin} position={[0, -0.155, 0]} castShadow>
          <sphereGeometry args={[0.046, 16, 12]} />
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
  ...props
}: { look: Look; state: AgentState; accent: string; /** floor height in local units */ floor?: number } & ThreeElements["group"]) {
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
  const seed = useMemo(() => Math.random() * 100, []);
  const expr = EXPRESSION[state];

  useFrame(({ clock, camera }, dt) => {
    const t = clock.elapsedTime + seed;
    const pose = POSES[state];
    const k = 8;
    const d = Math.min(dt, 0.1);

    if (torso.current) {
      const breathe = Math.sin(t * 1.6) * 0.012;
      const bounce = state === "waiting_on_user" ? Math.abs(Math.sin(t * 5)) * 0.03 : 0;
      torso.current.rotation.x = damp(torso.current.rotation.x, pose.lean + breathe, k, d);
      torso.current.position.y = damp(torso.current.position.y, bounce, k, d);
    }
    if (head.current) {
      let [px, py, pz] = pose.head;
      if (state === "working") px += Math.sin(t * 2.2) * 0.04;
      if (state === "thinking") pz += Math.sin(t * 0.9) * 0.08;
      if (state === "idle") py += Math.sin(t * 0.5) * 0.25;
      if (state === "error") py += Math.sin(t * 9) * 0.12;
      head.current.rotation.x = damp(head.current.rotation.x, px, k, d);
      head.current.rotation.y = damp(head.current.rotation.y, py, k, d);
      head.current.rotation.z = damp(head.current.rotation.z, pz, k, d);
    }
    // arms
    const typing = state === "working" ? 0.12 : 0;
    const wave = state === "waiting_on_user" ? Math.sin(t * 5) * 0.22 : 0;
    const set = (s: React.RefObject<THREE.Group | null>, e: React.RefObject<THREE.Group | null>, p: [number, number, number], extraX: number, extraZ: number) => {
      if (!s.current || !e.current) return;
      s.current.rotation.x = damp(s.current.rotation.x, p[0] + extraX, k, d);
      s.current.rotation.z = damp(s.current.rotation.z, p[1] + extraZ, k, d);
      e.current.rotation.x = damp(e.current.rotation.x, p[2] - extraX * 0.6, k, d);
    };
    set(lS, lE, pose.l, Math.sin(t * 14) * typing, 0);
    set(rS, rE, pose.r, Math.sin(t * 14 + 2) * typing, wave);

    // blink: quick close every few seconds; focused eyes stay narrowed
    if (eyes.current) {
      const open = expr === "focused" ? 0.62 : expr === "alert" ? 1.18 : 1;
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
    }
  });

  const eyeVisible = expr !== "happy";
  const browTilt = { focused: 0.28, curious: -0.18, alert: -0.3, happy: 0, worried: -0.42, neutral: 0 }[expr];
  const browLift = { focused: -0.012, curious: 0.025, alert: 0.035, happy: 0.018, worried: 0.02, neutral: 0 }[expr];

  return (
    <group {...props}>
      {/* state ring on the floor */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, floor + 0.01, 0.05]}>
        <ringGeometry args={[0.36, 0.42, 48]} />
        <meshBasicMaterial color={stateColor[state]} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* legs (seated): thighs forward, shins down */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.085, 0.07, 0]}>
          <mesh material={mats.pants} position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.2, 6, 12]} />
          </mesh>
          <mesh material={mats.pants} position={[0, -0.17, 0.25]} castShadow>
            <capsuleGeometry args={[0.058, 0.2, 6, 12]} />
          </mesh>
          <RoundedBox args={[0.1, 0.07, 0.17]} radius={0.032} position={[0, -0.36, 0.29]} material={mats.shoe} castShadow />
          <mesh material={mats.sole} position={[0, -0.39, 0.29]}>
            <boxGeometry args={[0.1, 0.016, 0.165]} />
          </mesh>
        </group>
      ))}

      <group ref={torso} position={[0, 0.06, -0.02]}>
        {/* hoodie body */}
        <mesh material={mats.top} position={[0, 0.17, 0]} castShadow>
          <capsuleGeometry args={[0.165, 0.16, 8, 20]} />
        </mesh>
        <mesh material={mats.topShade} position={[0, 0.3, -0.12]} rotation={[0.5, 0, 0]} castShadow>
          <torusGeometry args={[0.1, 0.045, 10, 20]} />
        </mesh>
        <RoundedBox args={[0.2, 0.08, 0.04]} radius={0.02} position={[0, 0.1, 0.15]} material={mats.topShade} />
        {[-1, 1].map((s) => (
          <mesh key={s} material={mats.white} position={[s * 0.035, 0.24, 0.158]}>
            <cylinderGeometry args={[0.005, 0.005, 0.08, 6]} />
          </mesh>
        ))}
        {/* lanyard badge in team colour */}
        <mesh position={[0.07, 0.19, 0.165]} rotation={[0.1, 0, 0.08]}>
          <boxGeometry args={[0.045, 0.06, 0.006]} />
          <meshStandardMaterial color={accent} roughness={0.4} />
        </mesh>

        <Arm side={-1} refs={{ shoulder: lS, elbow: lE }} mats={mats} />
        <Arm side={1} refs={{ shoulder: rS, elbow: rE }} mats={mats}>
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

        {/* head */}
        <group ref={head} position={[0, 0.56, 0.01]}>
          <mesh material={mats.skin} scale={[1, 0.94, 0.96]} castShadow>
            <sphereGeometry args={[0.235, 36, 28]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={mats.skin} position={[s * 0.228, -0.01, 0]} scale={[0.5, 0.8, 0.6]}>
              <sphereGeometry args={[0.06, 14, 12]} />
            </mesh>
          ))}

          {look.beanie ? <Beanie color={accent} /> : <Hair look={look} mat={mats.hair} />}

          {/* face */}
          <group position={[0, -0.02, 0]}>
            <group ref={eyes}>
              {eyeVisible &&
                [-1, 1].map((s) => (
                  <group key={s} position={[s * 0.082, 0, 0.205]}>
                    <mesh material={mats.eye} scale={[0.035, 0.048, 0.018]}>
                      <sphereGeometry args={[1, 18, 14]} />
                    </mesh>
                    <mesh material={mats.white} position={[0.01, 0.016, 0.014]}>
                      <sphereGeometry args={[0.0095, 10, 8]} />
                    </mesh>
                  </group>
                ))}
            </group>
            {!eyeVisible &&
              [-1, 1].map((s) => (
                <mesh key={s} material={mats.eye} position={[s * 0.082, -0.005, 0.212]} rotation={[0, 0, 0]}>
                  <torusGeometry args={[0.028, 0.0075, 8, 16, Math.PI]} />
                </mesh>
              ))}
            {/* brows */}
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                material={mats.hair}
                position={[s * 0.085, 0.075 + browLift, 0.2]}
                rotation={[0, 0, Math.PI / 2 - s * browTilt]}
              >
                <capsuleGeometry args={[0.009, 0.04, 4, 8]} />
              </mesh>
            ))}
            {/* cheeks */}
            {[-1, 1].map((s) => (
              <mesh key={s} material={mats.blush} position={[s * 0.135, -0.055, 0.19]} rotation={[0, s * 0.55, 0]}>
                <circleGeometry args={[0.032, 20]} />
              </mesh>
            ))}
            {/* mouth */}
            <Mouth expr={expr} mats={mats} />
          </group>

          {look.glasses && (
            <group position={[0, -0.02, 0.222]}>
              {[-1, 1].map((s) => (
                <mesh key={s} material={mats.frame} position={[s * 0.082, 0, 0]}>
                  <torusGeometry args={[0.05, 0.0065, 8, 28]} />
                </mesh>
              ))}
              <mesh material={mats.frame} position={[0, 0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.005, 0.005, 0.064, 6]} />
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

function Mouth({ expr, mats }: { expr: Expression; mats: ReturnType<typeof useMaterials> }) {
  const y = -0.085;
  const z = 0.214;
  switch (expr) {
    case "happy":
      return (
        <mesh material={mats.mouth} position={[0, y + 0.012, z]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.03, 0.008, 8, 18, Math.PI]} />
        </mesh>
      );
    case "alert":
      return (
        <mesh material={mats.mouth} position={[0, y - 0.005, z]} scale={[0.024, 0.03, 0.01]}>
          <sphereGeometry args={[1, 14, 12]} />
        </mesh>
      );
    case "worried":
      return (
        <mesh material={mats.mouth} position={[0, y - 0.018, z]}>
          <torusGeometry args={[0.026, 0.007, 8, 18, Math.PI]} />
        </mesh>
      );
    case "curious":
      return (
        <mesh material={mats.mouth} position={[0.02, y, z]} rotation={[0, 0, Math.PI / 2 + 0.25]}>
          <capsuleGeometry args={[0.007, 0.022, 4, 8]} />
        </mesh>
      );
    case "focused":
      return (
        <mesh material={mats.mouth} position={[0, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.0065, 0.026, 4, 8]} />
        </mesh>
      );
    default:
      return (
        <mesh material={mats.mouth} position={[0, y + 0.006, z]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.022, 0.007, 8, 18, Math.PI]} />
        </mesh>
      );
  }
}
