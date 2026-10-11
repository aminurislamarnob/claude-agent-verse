import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { currentHour } from "./daylight";
import { palette } from "./theme";
import { clockFaceTexture, exitSignTexture } from "./textures";

type GroupProps = ThreeElements["group"];

// ── Building services & office equipment ─────────────────────
// The everyday kit that makes an office read as a workplace rather than a set:
// a clock that keeps real time, lights that come on at dusk, the printer corner,
// the water cooler, bins, coats by the door. Pure decoration; nothing here is
// clickable or tied to a Session.

/** Wall clock showing the office's local time; the hands move every frame. */
export function WallClock(props: GroupProps) {
  const face = useMemo(() => clockFaceTexture(), []);
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  useFrame(() => {
    const h = currentHour();
    if (hour.current) hour.current.rotation.z = -((h % 12) / 12) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(((h * 60) % 60) / 60) * Math.PI * 2;
    if (second.current) second.current.rotation.z = -(Math.floor((h * 3600) % 60) / 60) * Math.PI * 2;
  });
  const R = 0.19;
  return (
    <group {...props}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[R + 0.012, R + 0.012, 0.035, 48]} />
        <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.018]}>
        <circleGeometry args={[R, 48]} />
        <meshStandardMaterial map={face} roughness={0.5} />
      </mesh>
      <group position={[0, 0, 0.024]} userData={{ live: true }}>
        {/* each hand pivots at the centre and reaches out along +y, with a short tail */}
        <group ref={hour}>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.014, 0.12, 0.004]} />
            <meshStandardMaterial color="#1d1f24" roughness={0.4} />
          </mesh>
        </group>
        <group ref={minute}>
          <mesh position={[0, 0.065, 0.003]}>
            <boxGeometry args={[0.01, 0.17, 0.004]} />
            <meshStandardMaterial color="#1d1f24" roughness={0.4} />
          </mesh>
        </group>
        <group ref={second}>
          <mesh position={[0, 0.06, 0.006]}>
            <boxGeometry args={[0.004, 0.2, 0.003]} />
            <meshStandardMaterial color="#d6453d" roughness={0.4} />
          </mesh>
        </group>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.008]}>
          <cylinderGeometry args={[0.012, 0.012, 0.01, 12]} />
          <meshStandardMaterial color="#1d1f24" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

/** Wall-mounted split air-conditioner. */
export function ACUnit(props: GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[0.86, 0.28, 0.21]} radius={0.05} castShadow>
        <meshStandardMaterial color="#f4f3ef" roughness={0.45} />
      </RoundedBox>
      <mesh position={[0, -0.09, 0.09]} rotation={[0.45, 0, 0]}>
        <boxGeometry args={[0.76, 0.05, 0.012]} />
        <meshStandardMaterial color="#d9d6cf" roughness={0.6} />
      </mesh>
      <mesh position={[0.34, 0.02, 0.107]}>
        <circleGeometry args={[0.008, 10]} />
        <meshBasicMaterial color="#22c55e" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Pendant lamp on a cord from the ceiling line; the bulb glows once the lamps are on. */
export function Pendant({ on, drop = 0.8, ...props }: { on: boolean; drop?: number } & GroupProps) {
  return (
    <group {...props}>
      {/* ceiling rose where the cord leaves the (unseen) ceiling */}
      <mesh position={[0, -0.01, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 20]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.5} />
      </mesh>
      <mesh position={[0, -drop / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, drop, 6]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.6} />
      </mesh>
      <mesh position={[0, -drop - 0.07, 0]} castShadow>
        <coneGeometry args={[0.17, 0.16, 28, 1, true]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.45} metalness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -drop - 0.11, 0]}>
        <sphereGeometry args={[0.035, 14, 10]} />
        <meshBasicMaterial color={on ? "#ffe2b3" : "#e9e3d7"} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Arc floor lamp reaching over the sofa. */
export function ArcLamp({ on, ...props }: { on: boolean } & GroupProps) {
  const arm = useMemo(
    () => new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 2.35, 0.05), new THREE.Vector3(-0.6, 2.0, 0.75)),
    [],
  );
  const end = arm.getPoint(1);
  return (
    <group {...props}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.2, 0.04, 32]} />
        <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh castShadow>
        <tubeGeometry args={[arm, 24, 0.016, 8, false]} />
        <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.4} />
      </mesh>
      <group position={[end.x, end.y, end.z]}>
        <mesh position={[0, -0.14, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.24, 32, 1, true]} />
          <meshStandardMaterial color="#efe9df" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.16, 0]}>
          <sphereGeometry args={[0.04, 14, 10]} />
          <meshBasicMaterial color={on ? "#ffe6c0" : "#e9e3d7"} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Multifunction printer on a low cabinet with a couple of paper reams. Faces +z. */
export function PrinterStation(props: GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[0.82, 0.68, 0.5]} radius={0.015} position={[0, 0.34, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#e8e4dc" roughness={0.6} />
      </RoundedBox>
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.34, 0.252]}>
          <boxGeometry args={[0.36, 0.6, 0.004]} />
          <meshStandardMaterial color="#dcd7cd" roughness={0.7} />
        </mesh>
      ))}
      {/* printer body, scanner lid, output tray and control panel */}
      <group position={[-0.12, 0.68, 0]}>
        <RoundedBox args={[0.5, 0.36, 0.44]} radius={0.02} position={[0, 0.18, 0]} castShadow>
          <meshStandardMaterial color="#f1efea" roughness={0.5} />
        </RoundedBox>
        <RoundedBox args={[0.48, 0.03, 0.4]} radius={0.01} position={[0, 0.375, -0.01]} castShadow>
          <meshStandardMaterial color="#3b3d44" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0.16, 0.221]}>
          <boxGeometry args={[0.36, 0.05, 0.004]} />
          <meshStandardMaterial color="#2a2c33" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.1, 0.26]}>
          <boxGeometry args={[0.3, 0.004, 0.1]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.9} />
        </mesh>
        <mesh position={[0.17, 0.355, 0.17]} rotation={[-0.5, 0, 0]}>
          <planeGeometry args={[0.1, 0.06]} />
          <meshBasicMaterial color="#5b6cff" toneMapped={false} />
        </mesh>
      </group>
      {[0, 1].map((i) => (
        <RoundedBox key={i} args={[0.22, 0.05, 0.3]} radius={0.004} position={[0.26, 0.705 + i * 0.052, 0.02 - i * 0.01]} rotation={[0, i * 0.08, 0]} castShadow>
          <meshStandardMaterial color="#f7f5f0" roughness={0.9} />
        </RoundedBox>
      ))}
    </group>
  );
}

/** Water cooler with a half-empty bottle and a sleeve of cups. Faces +z. */
export function WaterCooler(props: GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[0.34, 0.98, 0.34]} radius={0.02} position={[0, 0.49, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f4f3ef" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.78, 0.172]}>
        <boxGeometry args={[0.26, 0.18, 0.004]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.5} />
      </mesh>
      {[
        ["#3b82f6", -0.05],
        ["#ef4444", 0.05],
      ].map(([c, x]) => (
        <mesh key={c as string} position={[x as number, 0.72, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.05, 8]} />
          <meshStandardMaterial color={c as string} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.6, 0.175]}>
        <boxGeometry args={[0.2, 0.03, 0.03]} />
        <meshStandardMaterial color="#d9d6cf" roughness={0.6} />
      </mesh>
      {/* bottle: water line part way down */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.13, 0.44, 24]} />
        <meshPhysicalMaterial color="#bfe3f5" transparent opacity={0.45} roughness={0.1} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.11, 0]}>
        <cylinderGeometry args={[0.112, 0.122, 0.26, 24]} />
        <meshStandardMaterial color="#7fc4ea" transparent opacity={0.55} roughness={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.46, 0]}>
        <cylinderGeometry args={[0.05, 0.1, 0.08, 20]} />
        <meshStandardMaterial color="#9fd0ec" transparent opacity={0.6} roughness={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[0.21, 0.52, 0.1]}>
        <cylinderGeometry args={[0.03, 0.028, 0.12, 12]} />
        <meshStandardMaterial color="#f4f2ee" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Three recycling bins in a row along local x. */
export function RecyclingBins(props: GroupProps) {
  const bins = ["#3b82f6", "#22a35a", "#4a4d55"];
  return (
    <group {...props}>
      {bins.map((c, i) => (
        <group key={c} position={[(i - 1) * 0.34, 0, 0]}>
          <RoundedBox args={[0.3, 0.56, 0.3]} radius={0.02} position={[0, 0.28, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={c} roughness={0.6} />
          </RoundedBox>
          <RoundedBox args={[0.32, 0.05, 0.32]} radius={0.015} position={[0, 0.585, 0]} castShadow>
            <meshStandardMaterial color="#2b2d33" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0.4, 0.152]}>
            <planeGeometry args={[0.14, 0.14]} />
            <meshStandardMaterial color="#f4f2ee" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Coat stand by the door with a jacket, a tote and an umbrella. */
export function CoatStand({ accent = palette.accent, ...props }: { accent?: string } & GroupProps) {
  return (
    <group {...props}>
      <mesh position={[0, 0.015, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.19, 0.03, 28]} />
        <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.02, 1.78, 10]} />
        <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.3} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.07, 1.74, Math.sin(a) * 0.07]} rotation={[Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]}>
            <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
            <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.3} />
          </mesh>
        );
      })}
      {/* jacket hung on a hook, hood folded over the shoulder */}
      <group position={[0.12, 1.36, 0.05]} rotation={[0.05, 0.3, -0.08]}>
        <RoundedBox args={[0.3, 0.6, 0.14]} radius={0.06} castShadow>
          <meshStandardMaterial color="#2f3440" roughness={0.9} />
        </RoundedBox>
        <RoundedBox args={[0.2, 0.12, 0.1]} radius={0.05} position={[0, 0.3, -0.03]} castShadow>
          <meshStandardMaterial color="#262a33" roughness={0.9} />
        </RoundedBox>
      </group>
      {/* tote bag on the opposite hook */}
      <group position={[-0.1, 1.4, -0.08]} rotation={[0, -0.6, 0.06]}>
        <RoundedBox args={[0.22, 0.28, 0.07]} radius={0.02} castShadow>
          <meshStandardMaterial color={accent} roughness={0.95} />
        </RoundedBox>
        <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.07, 0.006, 6, 20, Math.PI]} />
          <meshStandardMaterial color="#c9a27e" roughness={0.8} />
        </mesh>
      </group>
      {/* umbrella leaning on the base */}
      <mesh position={[0.1, 0.42, -0.1]} rotation={[0.1, 0, 0.22]} castShadow>
        <cylinderGeometry args={[0.018, 0.028, 0.84, 10]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Wall-bracketed fire extinguisher. Faces +x off a wall at local x = 0. */
export function FireExtinguisher(props: GroupProps) {
  return (
    <group {...props}>
      <mesh position={[0.02, 0.2, 0]}>
        <boxGeometry args={[0.04, 0.08, 0.1]} />
        <meshStandardMaterial color="#2b2d33" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0.1, 0, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.4, 20]} />
        <meshStandardMaterial color="#d6453d" roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0.1, 0.23, 0]}>
        <cylinderGeometry args={[0.02, 0.045, 0.07, 14]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0.1, 0.29, 0.03]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.02, 0.025, 0.1]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0.12, 0.05, -0.08]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.3, 6]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.6} />
      </mesh>
      <mesh position={[0.1, 0.02, 0.0661]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.06, 0.12]} />
        <meshStandardMaterial color="#f4f2ee" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Light switch and thermostat beside the door. Faces +x off a wall at local x = 0. */
export function WallSwitches(props: GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[0.012, 0.09, 0.09]} radius={0.004} position={[0.006, 0, 0]}>
        <meshStandardMaterial color="#f7f6f2" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0.013, 0.01, 0]}>
        <boxGeometry args={[0.006, 0.03, 0.05]} />
        <meshStandardMaterial color="#e5e2da" roughness={0.5} />
      </mesh>
      <group position={[0, 0.28, 0]}>
        <mesh position={[0.012, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.024, 28]} />
          <meshStandardMaterial color="#f7f6f2" roughness={0.4} />
        </mesh>
        <mesh position={[0.0245, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.03, 20]} />
          <meshBasicMaterial color="#111" />
        </mesh>
        <mesh position={[0.025, 0.004, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.024, 0.008]} />
          <meshBasicMaterial color="#7fe0b7" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Illuminated EXIT sign on the wall above the door. Faces +x off a wall at local x = 0. */
export function ExitSign(props: GroupProps) {
  const tex = useMemo(() => exitSignTexture(), []);
  return (
    <group {...props}>
      <RoundedBox args={[0.035, 0.19, 0.5]} radius={0.01} position={[0.018, 0, 0]} castShadow>
        <meshStandardMaterial color="#1d1f24" roughness={0.4} />
      </RoundedBox>
      <mesh position={[0.037, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.47, 0.17]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Ribbed entrance mat. */
export function DoorMat(props: GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[0.8, 0.014, 1.15]} radius={0.006} position={[0, 0.007, 0]} receiveShadow>
        <meshStandardMaterial color="#4b4e57" roughness={1} />
      </RoundedBox>
      <RoundedBox args={[0.68, 0.016, 1.02]} radius={0.004} position={[0, 0.008, 0]} receiveShadow>
        <meshStandardMaterial color="#5a5d66" roughness={1} />
      </RoundedBox>
    </group>
  );
}

/** Bowl of fruit. */
export function FruitBowl(props: GroupProps) {
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <sphereGeometry args={[0.11, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#efe9df" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {[
        [0.03, 0.065, 0.02, "#e8a33d"],
        [-0.035, 0.06, -0.01, "#d6453d"],
        [0.0, 0.07, -0.05, "#7fb069"],
        [0.0, 0.115, -0.01, "#e8a33d"],
      ].map(([x, y, z, c], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
          <sphereGeometry args={[0.036, 14, 10]} />
          <meshStandardMaterial color={c as string} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Electric kettle. */
export function Kettle(props: GroupProps) {
  return (
    <group {...props}>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.085, 0.2, 20]} />
        <meshStandardMaterial color={palette.aluminum} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.215, 0]}>
        <cylinderGeometry args={[0.03, 0.07, 0.03, 20]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.4} />
      </mesh>
      <mesh position={[0.09, 0.14, 0]} rotation={[0, 0, 0.4]}>
        <boxGeometry args={[0.02, 0.1, 0.03]} />
        <meshStandardMaterial color="#1d1f24" roughness={0.4} />
      </mesh>
    </group>
  );
}
