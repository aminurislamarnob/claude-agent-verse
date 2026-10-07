import { useMemo, useState } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { Label } from "./Label";
import type { ThreeEvent } from "@react-three/fiber";
import type { AgentState, Session, Subagent } from "../types";
import { Character } from "./Character";
import { DeskLamp, DeskPlant, Display, Headphones, Laptop, MechanicalKeyboard, Mouse, Mug, Notebooks, OfficeChair } from "./Props";
import { hash, lookFor, palette, stateColor, stateLabel } from "./theme";
import type { ScreenKind } from "./textures";

export type Focus = { pid: number; subagentId?: string } | null;

const DESK_TOP = 0.74;
const SEAT = 0.49;
const CHAR_SCALE = 1.22;
/** Tags float just above the head, or above the alert bubble when waiting. */
const tagHeight = (state: AgentState) => (state === "waiting_on_user" ? 1.28 : state === "thinking" ? 1.3 : state === "error" ? 1.2 : 1.1);

const ACTIVE: AgentState[] = ["working", "thinking", "waiting_on_user", "error"];

/** Screen content follows what the agent is doing; the seed keeps neighbours varied. */
function screenFor(state: AgentState | null, tool: string | undefined, seed: number): ScreenKind {
  if (state === "working" && tool) {
    if (/bash|terminal|shell/i.test(tool)) return "terminal";
    if (/web|fetch|browser|chrome|search/i.test(tool)) return "browser";
  }
  return (["code", "code", "design", "dashboard", "code", "browser"] as const)[seed % 6];
}

const screenTint: Partial<Record<AgentState, string>> = {
  error: "#ffb4b4",
  waiting_on_user: "#ffe2b0",
};

const feltCache = new Map<string, string>();
/** Team colour softened toward warm grey, like acoustic felt. */
function felt(accent: string) {
  let c = feltCache.get(accent);
  if (!c) feltCache.set(accent, (c = "#" + new THREE.Color(accent).lerp(new THREE.Color("#cfc8bc"), 0.38).getHexString()));
  return c;
}

function Desk({ accent, occupied }: { accent: string; occupied: boolean }) {
  return (
    <group>
      <RoundedBox args={[1.5, 0.04, 0.78]} radius={0.015} position={[0, DESK_TOP - 0.02, 0.55]} castShadow receiveShadow>
        <meshStandardMaterial color={palette.deskTop} roughness={0.55} />
      </RoundedBox>
      {/* slim steel frame */}
      {[-1, 1].map((s) =>
        [0.24, 0.86].map((z) => (
          <mesh key={`${s}${z}`} position={[s * 0.69, (DESK_TOP - 0.04) / 2, z]} castShadow>
            <boxGeometry args={[0.035, DESK_TOP - 0.04, 0.035]} />
            <meshStandardMaterial color={palette.deskLeg} roughness={0.35} metalness={0.6} />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.69, DESK_TOP - 0.06, 0.55]}>
          <boxGeometry args={[0.03, 0.03, 0.62]} />
          <meshStandardMaterial color={palette.deskLeg} roughness={0.35} metalness={0.6} />
        </mesh>
      ))}
      {/* felt modesty panel in the team colour */}
      <RoundedBox args={[1.32, 0.3, 0.03]} radius={0.012} position={[0, DESK_TOP - 0.22, 0.88]} castShadow>
        <meshStandardMaterial color={felt(accent)} roughness={1} />
      </RoundedBox>
      {/* felt desk mat under keyboard and mouse */}
      <RoundedBox args={[0.74, 0.004, 0.27]} radius={0.002} position={[0.08, DESK_TOP + 0.002, 0.37]} receiveShadow>
        <meshStandardMaterial color={occupied ? "#4a4d55" : "#8d9099"} roughness={1} />
      </RoundedBox>
    </group>
  );
}

function AgentTag({ name, state, tool, emphasis }: { name: string; state: AgentState; tool?: string; emphasis: boolean }) {
  const waiting = state === "waiting_on_user";
  return (
    <div className={`agent-tag ${waiting ? "agent-tag--waiting" : ""} ${emphasis ? "agent-tag--emphasis" : ""}`} style={{ ["--tag" as string]: stateColor[state] }}>
      <span className="agent-tag__dot" />
      {waiting ? (
        <span className="agent-tag__label">Waiting on you</span>
      ) : (
        <>
          <span className="agent-tag__name">{name}</span>
          {state === "working" && tool ? <span className="agent-tag__tool">{tool}</span> : state !== "idle" && <span className="agent-tag__tool">{stateLabel[state]}</span>}
        </>
      )}
    </div>
  );
}

function Intern({
  sub,
  index,
  accent,
  focused,
  onSelect,
}: {
  sub: Subagent;
  index: number;
  accent: string;
  focused: boolean;
  onSelect: () => void;
}) {
  const look = useMemo(() => lookFor(sub.subagentId, { intern: true }), [sub.subagentId]);
  const [hover, setHover] = useState(false);
  const x = -0.5 + index * 0.55;
  return (
    <group
      position={[x, 0, 1.42]}
      rotation={[0, -0.25, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
    >
      {/* stool */}
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.13, 0.34, 24]} />
        <meshStandardMaterial color={palette.fabricWarm} roughness={0.95} />
      </mesh>
      <group scale={0.95} position={[0, 0.34, 0]}>
        <Character look={look} state={sub.state} accent={accent} floor={-0.34 / 0.95} />
      </group>
      {/* tiny side table with laptop */}
      <group position={[0, 0, 0.42]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.5, 8]} />
          <meshStandardMaterial color={palette.deskLeg} />
        </mesh>
        <mesh position={[0, 0.505, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.18, 0.18, 0.02, 28]} />
          <meshStandardMaterial color={palette.deskTop} roughness={0.5} />
        </mesh>
        <Laptop position={[0, 0.515, 0.02]} rotation={[0, Math.PI, 0]} scale={0.8} kind="code" variant={sub.subagentId} scroll={sub.state === "working"} />
      </group>
      {(sub.state === "waiting_on_user" || sub.state === "error" || hover || focused) && (
        <Label position={[0, 0.34 + tagHeight(sub.state) * 0.95, 0]} zIndexRange={[20, 0]}>
          <AgentTag name={sub.agentType} state={sub.state} tool={sub.currentTool} emphasis={focused} />
        </Label>
      )}
    </group>
  );
}

export function Workstation({
  session,
  accent,
  focus,
  onSelect,
  deskKey,
}: {
  session: Session | null;
  accent: string;
  focus: Focus;
  onSelect: (f: Focus) => void;
  deskKey: string;
}) {
  const seed = hash(session?.sessionId ?? deskKey);
  const look = useMemo(() => lookFor(session?.sessionId ?? deskKey), [session?.sessionId, deskKey]);
  const [hover, setHover] = useState(false);
  const state = session?.state ?? null;
  const tool = session?.currentTool;
  const kind = screenFor(state, tool, seed);
  const sideKind: ScreenKind = kind === "code" ? "terminal" : "code";
  const decor = seed % 4;
  const isFocused = !!session && focus?.pid === session.pid && !focus.subagentId;
  const interns = session ? Object.values(session.subagents ?? {}).slice(0, 3) : [];
  const extraInterns = session ? Math.max(0, Object.keys(session.subagents ?? {}).length - 3) : 0;
  const lit = state !== null;

  return (
    <group>
      <Desk accent={accent} occupied={lit} />

      {/* main display, angled so the camera can read it */}
      <Display
        position={[-0.5, DESK_TOP, 0.66]}
        rotation={[0, 1.75, 0]}
        kind={lit ? kind : "dashboard"}
        variant={deskKey}
        scroll={state === "working"}
        tint={lit ? screenTint[state!] : "#2a2c33"}
      />
      <Laptop
        position={[0.38, DESK_TOP, 0.62]}
        rotation={[0, Math.PI + 0.35, 0]}
        kind={sideKind}
        variant={deskKey + "lt"}
        angle={lit ? 1.85 : 0.05}
      />
      <MechanicalKeyboard position={[-0.04, DESK_TOP, 0.36]} accent={accent} />
      <Mouse position={[0.27, DESK_TOP, 0.38]} />
      <Mug position={[0.62, DESK_TOP, 0.32]} color={decor % 2 ? "#f4f2ee" : accent} steam={state === "working" || state === "thinking"} />
      {decor === 0 && <DeskPlant position={[-0.62, DESK_TOP, 0.88]} />}
      {decor === 1 && <DeskLamp position={[-0.64, DESK_TOP, 0.86]} rotation={[0, -0.6, 0]} on={lit} />}
      {decor === 2 && <Notebooks position={[0.58, DESK_TOP, 0.82]} />}
      {decor === 3 && !look.headphones && <Headphones position={[0.6, DESK_TOP, 0.84]} rotation={[0, 0.4, 0]} />}
      {decor === 3 && look.headphones && <DeskPlant position={[0.62, DESK_TOP, 0.86]} pot={palette.potDark} />}

      <OfficeChair position={[0, 0, session ? -0.14 : 0.08]} rotation={[0, session ? 0 : 0.35, 0]} />

      {session && (
        <group
          position={[0, SEAT, -0.08]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onSelect({ pid: session.pid });
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHover(false);
            document.body.style.cursor = "auto";
          }}
        >
          <Character look={look} state={session.state} accent={accent} scale={CHAR_SCALE} floor={-SEAT / CHAR_SCALE} />
          {(ACTIVE.includes(session.state) || hover || isFocused) && (
            <Label position={[0, tagHeight(session.state) * CHAR_SCALE, 0]} zIndexRange={[30, 0]}>
              <AgentTag name={session.title || session.name} state={session.state} tool={tool} emphasis={isFocused} />
            </Label>
          )}
        </group>
      )}

      {session &&
        interns.map((sub, i) => (
          <Intern
            key={sub.subagentId}
            sub={sub}
            index={i}
            accent={accent}
            focused={focus?.pid === session.pid && focus.subagentId === sub.subagentId}
            onSelect={() => onSelect({ pid: session.pid, subagentId: sub.subagentId })}
          />
        ))}
      {extraInterns > 0 && (
        <Label position={[1.15, 0.6, 1.42]}>
          <div className="intern-overflow">+{extraInterns}</div>
        </Label>
      )}
    </group>
  );
}
