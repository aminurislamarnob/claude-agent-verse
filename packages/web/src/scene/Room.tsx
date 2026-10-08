import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { DeskPlant, FloorPlant, Mug } from "./Props";
import { palette } from "./theme";
import { posterTexture, screenTexture, skylineTexture, whiteboardTexture, woodTexture } from "./textures";
import { COFFEE_TABLE, LOUNGE, type FloorPlan } from "./layout";
import { HighTable, PlayZone } from "./PlayZone";

type GroupProps = ThreeElements["group"];

const WALL_H = 3.1;
const WALL_T = 0.14;
const SLAB = 0.35;

// ── Shell ────────────────────────────────────────────────────

function Floor({ plan }: { plan: FloorPlan }) {
  const w = plan.maxX - plan.minX + 1;
  const d = plan.maxZ - plan.minZ + 1;
  const tex = useMemo(() => {
    const t = woodTexture();
    t.repeat.set(w / 3, d / 3);
    return t;
  }, [w, d]);
  const cx = (plan.minX + plan.maxX + 1) / 2;
  const cz = (plan.minZ + plan.maxZ + 1) / 2;
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={tex} roughness={0.72} />
      </mesh>
      {/* diorama slab */}
      <RoundedBox args={[w + 0.02, SLAB, d + 0.02]} radius={0.05} position={[0, -SLAB / 2 - 0.004, 0]} receiveShadow>
        <meshStandardMaterial color="#e7e1d6" roughness={0.9} />
      </RoundedBox>
      <mesh position={[0, -SLAB - 0.03, 0]}>
        <boxGeometry args={[w - 0.2, 0.06, d - 0.2]} />
        <meshStandardMaterial color="#c9c1b3" roughness={1} />
      </mesh>
    </group>
  );
}

function Walls({ plan }: { plan: FloorPlan }) {
  const w = plan.maxX - plan.minX + 1;
  const d = plan.maxZ - plan.minZ + 1;
  const sky = useMemo(() => skylineTexture(), []);
  const winCount = Math.max(2, Math.floor((d - 1.2) / 2.2));
  const winSpan = (d - 1.2) / winCount;
  return (
    <group>
      {/* back wall */}
      <mesh position={[(plan.minX + plan.maxX + 1) / 2, WALL_H / 2, plan.minZ - WALL_T / 2]} receiveShadow castShadow>
        <boxGeometry args={[w + WALL_T * 2, WALL_H, WALL_T]} />
        <meshStandardMaterial color={palette.wall} roughness={0.92} />
      </mesh>
      <mesh position={[(plan.minX + plan.maxX + 1) / 2, 0.06, plan.minZ + 0.01]}>
        <boxGeometry args={[w, 0.12, 0.02]} />
        <meshStandardMaterial color={palette.wallTrim} roughness={0.8} />
      </mesh>
      {/* left wall: floor-to-ceiling glazing with the skyline behind */}
      <group position={[plan.minX - WALL_T / 2, 0, plan.minZ]}>
        <mesh position={[0, WALL_H / 2, d / 2]} castShadow receiveShadow>
          <boxGeometry args={[WALL_T, WALL_H, d]} />
          <meshStandardMaterial color={palette.wall} roughness={0.92} />
        </mesh>
        {Array.from({ length: winCount }).map((_, i) => {
          const z = 0.6 + winSpan * (i + 0.5);
          const ww = winSpan - 0.24;
          return (
            <group key={i} position={[WALL_T / 2 + 0.002, 1.6, z]} rotation={[0, Math.PI / 2, 0]}>
              <mesh>
                <planeGeometry args={[ww, 2.3]} />
                <meshBasicMaterial map={sky} toneMapped={false} />
              </mesh>
              {/* mullions */}
              {[-ww / 2, 0, ww / 2].map((x, k) => (
                <mesh key={k} position={[x, 0, 0.02]}>
                  <boxGeometry args={[0.05, 2.36, 0.04]} />
                  <meshStandardMaterial color={palette.ink} roughness={0.4} metalness={0.4} />
                </mesh>
              ))}
              {[-1.15, 1.15].map((y, k) => (
                <mesh key={k} position={[0, y, 0.02]}>
                  <boxGeometry args={[ww + 0.05, 0.05, 0.04]} />
                  <meshStandardMaterial color={palette.ink} roughness={0.4} metalness={0.4} />
                </mesh>
              ))}
            </group>
          );
        })}
      </group>
    </group>
  );
}

// ── Lounge & culture pieces ──────────────────────────────────

function Sofa(props: GroupProps) {
  const fabric = "#8a93a6";
  return (
    <group {...props}>
      <RoundedBox args={[2.1, 0.32, 0.86]} radius={0.08} position={[0, 0.26, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={fabric} roughness={1} />
      </RoundedBox>
      <RoundedBox args={[2.1, 0.5, 0.24]} radius={0.1} position={[0, 0.62, -0.32]} castShadow>
        <meshStandardMaterial color={fabric} roughness={1} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.2, 0.46, 0.86]} radius={0.09} position={[s * 1.0, 0.45, 0]} castShadow>
          <meshStandardMaterial color={fabric} roughness={1} />
        </RoundedBox>
      ))}
      {[-0.45, 0.45].map((x, i) => (
        <RoundedBox key={i} args={[0.86, 0.14, 0.6]} radius={0.06} position={[x, 0.48, 0.06]} castShadow>
          <meshStandardMaterial color="#9aa3b5" roughness={1} />
        </RoundedBox>
      ))}
      {/* cushions */}
      <RoundedBox args={[0.36, 0.34, 0.12]} radius={0.06} position={[-0.62, 0.7, -0.14]} rotation={[-0.2, 0.2, 0.1]} castShadow>
        <meshStandardMaterial color={palette.accent} roughness={1} />
      </RoundedBox>
      <RoundedBox args={[0.34, 0.32, 0.12]} radius={0.06} position={[0.66, 0.7, -0.14]} rotation={[-0.2, -0.2, -0.08]} castShadow>
        <meshStandardMaterial color="#e8e4dc" roughness={1} />
      </RoundedBox>
      {[-0.95, 0.95].map((x) =>
        [-0.35, 0.35].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.05, z]}>
            <cylinderGeometry args={[0.025, 0.02, 0.1, 8]} />
            <meshStandardMaterial color={palette.ink} />
          </mesh>
        )),
      )}
    </group>
  );
}

function CoffeeTable(props: GroupProps) {
  return (
    <group {...props}>
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.04, 40]} />
        <meshStandardMaterial color="#b89470" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.04, 0.12, 0.34, 16]} />
        <meshStandardMaterial color={palette.ink} roughness={0.4} metalness={0.4} />
      </mesh>
      <Mug position={[0.12, 0.38, 0.05]} color={palette.accent} />
      <RoundedBox args={[0.22, 0.02, 0.3]} radius={0.005} position={[-0.12, 0.39, -0.04]} rotation={[0, 0.4, 0]}>
        <meshStandardMaterial color="#2f3440" roughness={0.6} />
      </RoundedBox>
    </group>
  );
}

/** Knit pouf: soft cylinder with a piped top edge. */
export function BeanBag({ color = "#d9a066", ...props }: { color?: string } & GroupProps) {
  return (
    <group {...props}>
      <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.27, 0.25, 0.3, 36]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, 0.32, 0]} scale={[1, 0.18, 1]} castShadow>
        <sphereGeometry args={[0.27, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.268, 0.012, 8, 40]} />
        <meshStandardMaterial color={new THREE.Color(color).multiplyScalar(0.85)} roughness={1} />
      </mesh>
      <mesh position={[0, 0.33, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.03, 16]} />
        <meshStandardMaterial color={new THREE.Color(color).multiplyScalar(0.8)} roughness={1} />
      </mesh>
    </group>
  );
}

function Whiteboard(props: GroupProps) {
  const tex = useMemo(() => whiteboardTexture(), []);
  return (
    <group {...props}>
      <RoundedBox args={[2.5, 1.3, 0.04]} radius={0.02} castShadow>
        <meshStandardMaterial color={palette.aluminum} metalness={0.5} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0, 0.021]}>
        <planeGeometry args={[2.42, 1.22]} />
        <meshStandardMaterial map={tex} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.68, 0.05]}>
        <boxGeometry args={[1.2, 0.03, 0.08]} />
        <meshStandardMaterial color={palette.aluminum} metalness={0.5} roughness={0.4} />
      </mesh>
      {["#ef4444", "#3b82f6", "#1d1f24"].map((c, i) => (
        <mesh key={c} position={[-0.3 + i * 0.12, -0.655, 0.06]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
          <meshStandardMaterial color={c} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Wall-mounted team dashboard. */
function WallScreen(props: GroupProps) {
  const tex = useMemo(() => screenTexture("dashboard", "wall"), []);
  return (
    <group {...props}>
      <RoundedBox args={[1.9, 1.08, 0.05]} radius={0.015} castShadow>
        <meshStandardMaterial color={palette.screenBezel} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.027]}>
        <planeGeometry args={[1.84, 1.02]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Credenza(props: GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[1.9, 0.56, 0.46]} radius={0.02} position={[0, 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#ebe5da" roughness={0.6} />
      </RoundedBox>
      {[-0.63, 0, 0.63].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.232]}>
          <boxGeometry args={[0.6, 0.5, 0.005]} />
          <meshStandardMaterial color="#e2dbcf" roughness={0.7} />
        </mesh>
      ))}
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.01, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.4]} />
          <meshStandardMaterial color={palette.ink} />
        </mesh>
      ))}
      <DeskPlant position={[-0.7, 0.58, 0]} pot={palette.potDark} />
      {/* books */}
      {["#d97757", "#2f3440", "#5b6cff", "#e8e4dc"].map((c, i) => (
        <mesh key={c} position={[0.3 + i * 0.05, 0.71, 0]} rotation={[0, 0, i === 3 ? -0.25 : 0]} castShadow>
          <boxGeometry args={[0.04, 0.24 - (i % 2) * 0.03, 0.18]} />
          <meshStandardMaterial color={c} roughness={0.8} />
        </mesh>
      ))}
      {/* tiny robot figure */}
      <group position={[0.75, 0.58, 0]}>
        <RoundedBox args={[0.1, 0.1, 0.08]} radius={0.02} position={[0, 0.06, 0]}>
          <meshStandardMaterial color={palette.accent} roughness={0.5} />
        </RoundedBox>
        <RoundedBox args={[0.13, 0.1, 0.1]} radius={0.03} position={[0, 0.16, 0]}>
          <meshStandardMaterial color="#f4f2ee" roughness={0.4} />
        </RoundedBox>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.03, 0.165, 0.051]}>
            <circleGeometry args={[0.012, 12]} />
            <meshBasicMaterial color="#1d1f24" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** "</>" neon sign built from glowing tubes. */
function NeonSign({ color = "#ff8a5c", ...props }: { color?: string } & GroupProps) {
  const bars: [number, number, number, number][] = [
    // x, y, length, angle
    [-0.42, 0.09, 0.26, 0.6],
    [-0.42, -0.09, 0.26, -0.6],
    [0, 0, 0.5, -0.35],
    [0.42, 0.09, 0.26, -0.6],
    [0.42, -0.09, 0.26, 0.6],
  ];
  return (
    <group {...props}>
      <RoundedBox args={[1.25, 0.62, 0.03]} radius={0.02}>
        <meshStandardMaterial color="#1d1f24" roughness={0.3} transparent opacity={0.9} />
      </RoundedBox>
      {bars.map(([x, y, len, a], i) => (
        <mesh key={i} position={[x, y, 0.04]} rotation={[0, 0, Math.PI / 2 + a]}>
          <capsuleGeometry args={[0.022, len, 6, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
      <pointLight position={[0, 0, 0.4]} color={color} intensity={1.2} distance={2.5} decay={2} />
    </group>
  );
}

function Poster({ kind, ...props }: { kind: "ship" | "grid" | "pixel" } & GroupProps) {
  const tex = useMemo(() => posterTexture(kind), [kind]);
  return (
    <group {...props}>
      <RoundedBox args={[0.66, 0.86, 0.03]} radius={0.01} castShadow>
        <meshStandardMaterial color={palette.ink} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0, 0.016]}>
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
    </group>
  );
}

function CoffeeBar(props: GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[2.2, 0.9, 0.62]} radius={0.02} position={[0, 0.45, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2b2d33" roughness={0.55} />
      </RoundedBox>
      <RoundedBox args={[2.26, 0.04, 0.66]} radius={0.01} position={[0, 0.92, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#efece6" roughness={0.3} />
      </RoundedBox>
      {/* espresso machine */}
      <group position={[-0.55, 0.94, -0.06]}>
        <RoundedBox args={[0.5, 0.42, 0.38]} radius={0.03} position={[0, 0.21, 0]} castShadow>
          <meshStandardMaterial color={palette.aluminum} metalness={0.75} roughness={0.25} />
        </RoundedBox>
        <mesh position={[0, 0.3, 0.2]}>
          <boxGeometry args={[0.38, 0.12, 0.02]} />
          <meshStandardMaterial color="#1d1f24" roughness={0.3} />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.13, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.1, 12]} />
            <meshStandardMaterial color="#1d1f24" metalness={0.5} roughness={0.3} />
          </mesh>
        ))}
        <Mug position={[0.1, 0.0, 0.24]} scale={0.8} />
      </group>
      {/* grinder */}
      <group position={[0.0, 0.94, -0.1]}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.09, 0.3, 20]} />
          <meshStandardMaterial color="#1d1f24" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.38, 0]} castShadow>
          <coneGeometry args={[0.09, 0.18, 20]} />
          <meshStandardMaterial color="#c9c6c0" transparent opacity={0.6} roughness={0.1} />
        </mesh>
      </group>
      {/* cups */}
      {[0.4, 0.55, 0.7].map((x, i) => (
        <Mug key={x} position={[x, 0.94, 0.1]} color={["#f4f2ee", palette.accent, "#2f3440"][i]} />
      ))}
      {/* open shelf above */}
      <group position={[0, 2.0, -0.2]}>
        <RoundedBox args={[2.0, 0.04, 0.26]} radius={0.01} castShadow>
          <meshStandardMaterial color="#b89470" roughness={0.5} />
        </RoundedBox>
        {[-0.7, -0.45, -0.2].map((x, i) => (
          <mesh key={x} position={[x, 0.13, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.22, 16]} />
            <meshStandardMaterial color={["#e8e4dc", "#c9a27e", "#3b3d44"][i]} roughness={0.4} transparent opacity={0.92} />
          </mesh>
        ))}
        <DeskPlant position={[0.5, 0.02, 0]} />
      </group>
    </group>
  );
}

function Arcade(props: GroupProps) {
  const ref = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.color.setHSL((clock.elapsedTime * 0.05) % 1, 0.65, 0.6);
  });
  return (
    <group {...props}>
      <RoundedBox args={[0.7, 1.75, 0.7]} radius={0.03} position={[0, 0.875, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#5b6cff" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 1.25, 0.31]} rotation={[-0.25, 0, 0]}>
        <planeGeometry args={[0.52, 0.42]} />
        <meshBasicMaterial ref={ref} color="#8b5cf6" toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.62, 0.352]}>
        <planeGeometry args={[0.6, 0.14]} />
        <meshBasicMaterial color="#ffcb6b" toneMapped={false} />
      </mesh>
      <RoundedBox args={[0.68, 0.06, 0.3]} radius={0.01} position={[0, 0.98, 0.42]} rotation={[0.25, 0, 0]}>
        <meshStandardMaterial color="#1d1f24" roughness={0.5} />
      </RoundedBox>
      <mesh position={[-0.15, 1.03, 0.44]}>
        <sphereGeometry args={[0.035, 12, 10]} />
        <meshStandardMaterial color="#ef4444" roughness={0.3} />
      </mesh>
      {["#22c55e", "#f59e0b", "#3b82f6"].map((c, i) => (
        <mesh key={c} position={[0.05 + i * 0.08, 1.01, 0.45]}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 12]} />
          <meshStandardMaterial color={c} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function ServerRack(props: GroupProps) {
  const leds = useRef<THREE.InstancedMesh>(null);
  const COUNT = 24;
  useFrame(({ clock }) => {
    const m = leds.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const on = Math.sin(clock.elapsedTime * (2 + (i % 5)) + i * 1.7) > 0.2;
      m.setColorAt(i, c.set(on ? (i % 7 === 0 ? "#f59e0b" : "#22c55e") : "#1f2a22"));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  const setLeds = (m: THREE.InstancedMesh | null) => {
    (leds as React.MutableRefObject<THREE.InstancedMesh | null>).current = m;
    if (!m) return;
    const mat = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) {
      mat.makeTranslation(-0.18 + (i % 4) * 0.05, 0.35 + Math.floor(i / 4) * 0.22, 0.311);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
  };
  return (
    <group {...props}>
      <RoundedBox args={[0.62, 1.7, 0.6]} radius={0.02} position={[0, 0.85, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#25272d" roughness={0.45} metalness={0.3} />
      </RoundedBox>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[0, 0.35 + i * 0.22, 0.302]}>
          <boxGeometry args={[0.54, 0.16, 0.01]} />
          <meshStandardMaterial color="#33363e" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      <instancedMesh ref={setLeds} args={[undefined, undefined, COUNT]}>
        <sphereGeometry args={[0.012, 8, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Bookshelf(props: GroupProps) {
  const books = useMemo(() => {
    const colors = ["#d97757", "#2f3440", "#5b6cff", "#e8e4dc", "#14a38b", "#c9a27e", "#9aa3b5"];
    const list: { x: number; y: number; h: number; c: string; tilt: number }[] = [];
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -0.5;
      let n = 0;
      while (x < 0.45) {
        if ((shelf * 7 + n) % 9 === 4) {
          x += 0.22;
          n++;
          continue;
        }
        const h = 0.2 + ((shelf * 13 + n * 7) % 5) * 0.025;
        list.push({ x, y: 0.08 + shelf * 0.45, h, c: colors[(shelf * 3 + n) % colors.length], tilt: n % 11 === 6 ? 0.25 : 0 });
        x += 0.055;
        n++;
      }
    }
    return list;
  }, []);
  return (
    <group {...props}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, 0.04 + i * 0.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.15, 0.03, 0.34]} />
          <meshStandardMaterial color="#b89470" roughness={0.5} />
        </mesh>
      ))}
      {[-0.575, 0.575].map((x) => (
        <mesh key={x} position={[x, 0.92, 0]} castShadow>
          <boxGeometry args={[0.03, 1.84, 0.34]} />
          <meshStandardMaterial color="#b89470" roughness={0.5} />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + b.h / 2, 0]} rotation={[0, 0, b.tilt]} castShadow>
          <boxGeometry args={[0.045, b.h, 0.24]} />
          <meshStandardMaterial color={b.c} roughness={0.8} />
        </mesh>
      ))}
      <DeskPlant position={[0.32, 1.39, 0]} pot={palette.potDark} />
    </group>
  );
}

function Rug({ w, d, ...props }: { w: number; d: number } & GroupProps) {
  return (
    <group {...props}>
      <RoundedBox args={[w, 0.015, d]} radius={0.007} position={[0, 0.008, 0]} receiveShadow>
        <meshStandardMaterial color={palette.rug} roughness={1} />
      </RoundedBox>
    </group>
  );
}

// ── Room assembly ────────────────────────────────────────────

/**
 * The office shell plus culture pieces along the back and left walls.
 * Back-wall pieces are laid out left to right and dropped when the room is too narrow.
 */
export function Room({ plan }: { plan: FloorPlan }) {
  const bz = plan.minZ; // back wall interior face
  const lx = plan.minX; // left wall interior face
  const right = plan.maxX + 1;

  const zones = plan.amenities.zones.map(({ kind, x }) => {
    switch (kind) {
      case "lounge":
        return (
          <group key={kind} position={[x, 0, bz]}>
            <Whiteboard position={[0, 1.75, 0.03]} />
            <Rug w={3.0} d={2.2} position={[0, 0, 1.45]} />
            <Sofa position={[LOUNGE.sofa.x, 0, LOUNGE.sofa.z]} />
            <CoffeeTable position={[LOUNGE.table.x, 0, LOUNGE.table.z]} />
            {LOUNGE.poufs.map((p, i) => (
              <BeanBag key={i} position={[p.x, 0, p.z]} rotation={[0, -0.8, 0]} color={i ? "#d9a066" : "#8a93a6"} />
            ))}
          </group>
        );
      case "coffee":
        return (
          <group key={kind} position={[x, 0, bz]}>
            <CoffeeBar position={[0, 0, 0.36]} />
            <HighTable position={[COFFEE_TABLE.x, 0, COFFEE_TABLE.z]} />
            <Mug position={[COFFEE_TABLE.x + 0.1, 0.857, COFFEE_TABLE.z + 0.08]} color={palette.accent} />
          </group>
        );
      case "play":
        return <PlayZone key={kind} position={[x, 0, bz]} tableZ={plan.amenities.table.z - bz} />;
      case "screen":
        return (
          <group key={kind} position={[x, 0, bz]}>
            <WallScreen position={[0, 1.65, 0.04]} />
            <Credenza position={[0, 0, 0.3]} />
          </group>
        );
      case "neon":
        return (
          <group key={kind} position={[x, 0, bz]}>
            <NeonSign position={[0, 1.95, 0.03]} />
            <Poster kind="ship" position={[-0.35, 0.95, 0.03]} rotation={[0, 0, 0.02]} />
            <Poster kind="grid" position={[0.38, 0.95, 0.03]} rotation={[0, 0, -0.02]} />
          </group>
        );
      case "arcade":
        return (
          <group key={kind} position={[x, 0, bz]}>
            <Arcade position={[-0.15, 0, 0.42]} />
            <Poster kind="pixel" position={[0.45, 1.7, 0.03]} />
          </group>
        );
    }
  });

  const sideLen = plan.maxZ + 1 - bz;

  return (
    <group>
      <Floor plan={plan} />
      <Walls plan={plan} />
      {zones}
      {/* corner + left-wall pieces */}
      <FloorPlant position={[lx + 0.5, 0, bz + 0.5]} size={1.25} />
      <FloorPlant position={[right - 0.45, 0, bz + 0.45]} size={1.05} pot={palette.potDark} />
      <group position={[lx + 0.35, 0, 0]}>
        <ServerRack position={[0, 0, bz + 1.6]} rotation={[0, Math.PI / 2, 0]} />
        <Bookshelf position={[0.0, 0, bz + 3.0]} rotation={[0, Math.PI / 2, 0]} />
        {sideLen > 8 && <FloorPlant position={[0.25, 0, bz + 4.4]} size={0.95} />}
        {sideLen > 10 && <BeanBag position={[0.75, 0, bz + 5.6]} rotation={[0, 1.2, 0]} color="#8a93a6" />}
        {sideLen > 13 && <FloorPlant position={[0.25, 0, plan.maxZ + 0.3]} size={1.1} pot={palette.potDark} />}
      </group>
    </group>
  );
}
