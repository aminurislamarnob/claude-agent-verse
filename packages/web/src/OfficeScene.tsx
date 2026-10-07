import React, { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Text } from "@react-three/drei";
import type { Office, Session, Subagent, AgentState } from "./App";

class SpiralGrid {
  private assignments = new Map<string, [number, number]>();
  private used = new Set<string>();

  get(id: string): [number, number] {
    if (this.assignments.has(id)) {
      return this.assignments.get(id)!;
    }
    let x = 0, z = 0, dx = 0, dz = -1;
    let step = 0;
    while (true) {
      const key = `${x},${z}`;
      if (!this.used.has(key)) {
        this.used.add(key);
        this.assignments.set(id, [x, z]);
        return [x, z];
      }
      if (x === z || (x < 0 && x === -z) || (x > 0 && x === 1 - z)) {
        const t = dx;
        dx = -dz;
        dz = t;
      }
      x += dx;
      z += dz;
      step++;
      if (step > 10000) break;
    }
    return [0, 0];
  }

  cleanup(activeIds: string[]) {
    const active = new Set(activeIds);
    for (const [id, pos] of Array.from(this.assignments.entries())) {
      if (!active.has(id)) {
        this.assignments.delete(id);
        this.used.delete(`${pos[0]},${pos[1]}`);
      }
    }
  }
}

function getStateColor(state: AgentState): string {
  switch (state) {
    case "working": return "#3b82f6"; // blue
    case "thinking": return "#a855f7"; // purple
    case "error": return "#ef4444"; // red
    case "waiting_on_user": return "#f59e0b"; // yellow
    case "idle":
    default: return "#9ca3af"; // gray
  }
}

function AgentBox({ state, tool, position, isSubagent, onClick }: { state: AgentState; tool?: string; position: [number, number, number]; isSubagent?: boolean; onClick?: (e: any) => void }) {
  const color = getStateColor(state);
  const size = isSubagent ? 0.6 : 1.0;
  
  return (
    <group position={position}>
      <mesh 
        position={[0, size / 2, 0]} 
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {state === "working" && tool && (
        <Html position={[0, size + 0.5, 0]} center>
          <div style={{
            background: "rgba(0,0,0,0.8)",
            color: "white",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "12px",
            whiteSpace: "nowrap",
            pointerEvents: "none"
          }}>
            {tool}
          </div>
        </Html>
      )}
    </group>
  );
}

function Desk({ session, position, onFocusAgent }: { session: Session; position: [number, number, number]; onFocusAgent: (pid: number, subagentId?: string) => void }) {
  const subagents = Object.values(session.subagents || {});
  
  return (
    <group position={position}>
      {/* Desk Placeholder */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[2, 0.8, 1.2]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      
      {/* Parent Agent */}
      <AgentBox 
        state={session.state} 
        tool={session.currentTool} 
        position={[0, 0.8, -0.2]} 
        onClick={() => onFocusAgent(session.pid)}
      />
      
      {/* Subagents (Interns) */}
      {subagents.map((sub, i) => (
        <AgentBox 
          key={sub.subagentId}
          state={sub.state} 
          tool={sub.currentTool} 
          position={[-1.2 - (i * 0.8), 0.8, 0.5]} 
          isSubagent 
          onClick={() => onFocusAgent(session.pid, sub.subagentId)}
        />
      ))}
    </group>
  );
}

function ProjectCluster({ projectKey, sessions, position, onFocusAgent }: { projectKey: string; sessions: Session[]; position: [number, number, number]; onFocusAgent: (pid: number, subagentId?: string) => void }) {
  const deskGrid = useMemo(() => new SpiralGrid(), []);
  
  useEffect(() => {
    deskGrid.cleanup(sessions.map(s => s.pid.toString()));
  }, [sessions, deskGrid]);

  return (
    <group position={position}>
      {/* Floor plate for the cluster */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      
      <Text
        position={[0, 0.1, -6.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1}
        color="#374151"
        anchorX="center"
        anchorY="middle"
      >
        {projectKey}
      </Text>

      {sessions.map(s => {
        const [gx, gz] = deskGrid.get(s.pid.toString());
        // Spacing desks by 3.5 units
        return <Desk key={s.pid} session={s} position={[gx * 3.5, 0, gz * 3.5]} onFocusAgent={onFocusAgent} />;
      })}
    </group>
  );
}

import * as THREE from "three";

interface OfficeSceneProps {
  office: Office;
  focusedAgent: { pid: number; subagentId?: string } | null;
  onFocusAgent: (pid: number, subagentId?: string) => void;
}

function CameraController({ focusedAgent, byProject, projectGrid }: { 
  focusedAgent: { pid: number; subagentId?: string } | null, 
  byProject: Record<string, Session[]>,
  projectGrid: SpiralGrid
}) {
  const { camera, controls } = useThree();
  
  // We need to find the world position of the focused agent to move the camera.
  // Instead of recalculating layout, we can track positions in refs, or recalculate here.
  // Since the layout is deterministic based on SpiralGrid:
  
  const targetPos = useMemo(() => {
    if (!focusedAgent) return new THREE.Vector3(0, 0, 0); // Default origin

    // Find the session
    let targetSession: Session | undefined;
    for (const sessions of Object.values(byProject)) {
      targetSession = sessions.find(s => s.pid === focusedAgent.pid);
      if (targetSession) break;
    }
    
    if (!targetSession) return new THREE.Vector3(0, 0, 0);

    const [gx, gz] = projectGrid.get(targetSession.projectKey);
    const clusterX = gx * 16;
    const clusterZ = gz * 16;
    
    // We need to re-create the desk grid logic to find desk offset
    // This is a bit duplicative. A better way would be using context or global state,
    // but we can just use the same logic here for simplicity.
    const deskGrid = new SpiralGrid();
    const sessions = byProject[targetSession.projectKey] || [];
    let dx = 0, dz = 0;
    for (const s of sessions) {
      const [sx, sz] = deskGrid.get(s.pid.toString());
      if (s.pid === focusedAgent.pid) {
        dx = sx * 3.5;
        dz = sz * 3.5;
        break;
      }
    }
    
    const worldX = clusterX + dx;
    const worldZ = clusterZ + dz;
    const worldY = 0.8; // Desk height
    
    if (focusedAgent.subagentId) {
      // Subagents are offset: [-1.2 - (i * 0.8), 0.8, 0.5]
      const subagents = Object.values(targetSession.subagents || {});
      const idx = subagents.findIndex(s => s.subagentId === focusedAgent.subagentId);
      if (idx !== -1) {
        return new THREE.Vector3(worldX - 1.2 - (idx * 0.8), worldY, worldZ + 0.5);
      }
    }
    
    return new THREE.Vector3(worldX, worldY, worldZ - 0.2); // Parent agent position
  }, [focusedAgent, byProject, projectGrid]);

  const isAnimatingRef = useRef(false);

  useEffect(() => {
    isAnimatingRef.current = true;
  }, [focusedAgent]);

  useFrame((state, delta) => {
    // Determine the desired camera position and target
    const currentTarget = (controls as any)?.target;
    if (!currentTarget) return;

    if (focusedAgent) {
      if (isAnimatingRef.current) {
        // Move target to agent
        currentTarget.lerp(targetPos, 4 * delta);
        // Move camera close to agent (isometric offset)
        const idealCamPos = targetPos.clone().add(new THREE.Vector3(8, 8, 8));
        camera.position.lerp(idealCamPos, 4 * delta);
        
        // Ensure frameloop keeps running while animating
        if (currentTarget.distanceTo(targetPos) > 0.1 || camera.position.distanceTo(idealCamPos) > 0.1) {
          state.invalidate();
        } else {
          isAnimatingRef.current = false;
        }
      }
    } else {
      if (isAnimatingRef.current) {
        // Return to default view roughly
        const defaultTarget = new THREE.Vector3(0, 0, 0);
        currentTarget.lerp(defaultTarget, 4 * delta);
        const idealCamPos = new THREE.Vector3(20, 20, 20);
        camera.position.lerp(idealCamPos, 4 * delta);
        
        if (currentTarget.distanceTo(defaultTarget) > 0.1 || camera.position.distanceTo(idealCamPos) > 0.1) {
          state.invalidate();
        } else {
          isAnimatingRef.current = false;
        }
      }
    }
  });

  return null;
}

export function OfficeScene({ office, focusedAgent, onFocusAgent }: OfficeSceneProps) {
  const projectGrid = useMemo(() => new SpiralGrid(), []);
  
  const sessions = Object.values(office.sessions);
  const byProject = useMemo(() => {
    return sessions.reduce((acc, s) => {
      acc[s.projectKey] = acc[s.projectKey] || [];
      acc[s.projectKey].push(s);
      return acc;
    }, {} as Record<string, Session[]>);
  }, [sessions]);

  const projectKeys = Object.keys(byProject).sort();

  useEffect(() => {
    projectGrid.cleanup(projectKeys);
  }, [projectKeys, projectGrid]);

  // Handle visibility pause
  const [isVisible, setIsVisible] = React.useState(true);
  useEffect(() => {
    const handleVisibility = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return (
    <Canvas 
      frameloop={isVisible ? "demand" : "never"}
      camera={{ position: [20, 20, 20], fov: 25 }} // Isometric-like perspective
      shadows
    >
      <color attach="background" args={["#f3f4f6"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 15]} intensity={1} castShadow />
      
      <CameraController focusedAgent={focusedAgent} byProject={byProject} projectGrid={projectGrid} />

      {projectKeys.map(key => {
        const [gx, gz] = projectGrid.get(key);
        // Spacing clusters by 16 units
        return (
          <ProjectCluster 
            key={key} 
            projectKey={key} 
            sessions={byProject[key]} 
            position={[gx * 16, 0, gz * 16]}
            onFocusAgent={onFocusAgent}
          />
        );
      })}

      <OrbitControls 
        makeDefault 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2 - 0.1} // Prevent going below ground
      />
    </Canvas>
  );
}
