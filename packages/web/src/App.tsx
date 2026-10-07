import { useEffect, useRef, useState, useCallback, Fragment } from "react";
import { OfficeScene } from "./OfficeScene";
import { InspectorPanel } from "./components/InspectorPanel";

// ── Types (subset of @claude-agent-verse/core) ───────────────

export type AgentState = "working" | "thinking" | "idle" | "error" | "ended" | "waiting_on_user";

export interface Subagent {
  subagentId: string;
  agentType: string;
  description: string;
  toolUseId: string;
  state: AgentState;
  currentTool?: string;
}

export interface FeedEvent {
  id: string;
  role: "user" | "assistant";
  type: "text" | "tool_use" | "tool_result" | "error";
  excerpt: string;
}

export interface Session {
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  state: AgentState;
  projectKey: string;
  startedAt: number;
  title?: string;
  lastPrompt?: string;
  gitBranch?: string;
  currentTool?: string;
  feed: FeedEvent[];
  subagents?: Record<string, Subagent>;
}

export interface Office {
  sessions: Record<number, Session>;
  waitingCount: number;
}

// ── WebSocket hook ───────────────────────────────────────────

function useOffice(): { office: Office; connected: boolean } {
  const [office, setOffice] = useState<Office>({ sessions: {}, waitingCount: 0 });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Determine WebSocket URL based on current location.
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = new URLSearchParams(window.location.search).get("token") || "";
    const wsUrl = `${proto}//${window.location.host}?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "snapshot" && msg.office) {
          setOffice(msg.office);
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 2 seconds.
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { office, connected };
}

// ── Tab title updater ────────────────────────────────────────

function useTabTitle(waitingCount: number): void {
  useEffect(() => {
    if (waitingCount > 0) {
      document.title = `(${waitingCount}) Agent Verse`;
    } else {
      document.title = "Agent Verse";
    }
  }, [waitingCount]);
}

function useFaviconBadge(waitingCount: number): void {
  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.fillStyle = "#1a1a1e";
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "#6366f1";
    ctx.fillRect(6, 6, 20, 20);

    if (waitingCount > 0) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(24, 8, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = "white";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(waitingCount.toString(), 24, 8);
    }

    link.href = canvas.toDataURL("image/png");
  }, [waitingCount]);
}

// ── Components ───────────────────────────────────────────────

function getStateDetails(state: AgentState, tool?: string) {
  let icon = "💤";
  let label = "Idle";
  if (state === "working") {
    icon = "⚡";
    label = `Working (${tool || "tool"})`;
  } else if (state === "thinking") {
    icon = "🤔";
    label = "Thinking";
  } else if (state === "error") {
    icon = "❌";
    label = "Error";
  } else if (state === "waiting_on_user") {
    icon = "✋";
    label = "Waiting on you";
  }
  return { icon, label, className: `state-${state}` };
}

function SessionRow({ session }: { session: Session }) {
  const { icon, label, className } = getStateDetails(session.state, session.currentTool);
  const subagents = Object.values(session.subagents || {});

  return (
    <Fragment>
      <tr className="session-row">
        <td className="session-name">
          <div><strong>{session.title || session.name}</strong></div>
          {session.lastPrompt && <div className="session-prompt" style={{fontSize: "0.85em", color: "#666"}}>{session.lastPrompt}</div>}
        </td>
        <td className="session-cwd" title={session.cwd}>
          <div>{session.cwd}</div>
          {session.gitBranch && <div className="session-branch" style={{fontSize: "0.85em", color: "#666"}}>⎇ {session.gitBranch}</div>}
        </td>
        <td className={`session-state ${className}`}>
          <span className="state-icon">{icon}</span> {label}
        </td>
        <td className="session-pid">{session.pid}</td>
      </tr>
      
      {subagents.map(sub => {
        const subState = getStateDetails(sub.state, sub.currentTool);
        return (
          <tr key={sub.subagentId} className="subagent-row">
            <td className="subagent-name">
              <div style={{ paddingLeft: "1.5rem" }}>
                <span style={{color: "#888"}}>↳ </span>
                <strong>{sub.agentType}</strong> 
                <span style={{fontSize: "0.85em", color: "#666", marginLeft: "8px"}}>{sub.description}</span>
              </div>
            </td>
            <td className="subagent-cwd" title={session.cwd}>
              {/* Inherits cwd conceptually */}
            </td>
            <td className={`session-state ${subState.className}`}>
              <span className="state-icon">{subState.icon}</span> {subState.label}
            </td>
            <td className="session-pid">
              <span style={{ color: "#666", fontSize: "0.85em" }}>{sub.subagentId.slice(0, 8)}...</span>
            </td>
          </tr>
        );
      })}
    </Fragment>
  );
}

export function App() {
  const { office, connected } = useOffice();
  const [focusedAgent, setFocusedAgent] = useState<{pid: number, subagentId?: string} | null>(null);

  const sessions = Object.values(office.sessions);
  const byProject = sessions.reduce((acc, s) => {
    acc[s.projectKey] = acc[s.projectKey] || [];
    acc[s.projectKey].push(s);
    return acc;
  }, {} as Record<string, Session[]>);

  const projectKeys = Object.keys(byProject).sort();

  useTabTitle(office.waitingCount);
  useFaviconBadge(office.waitingCount);
  
  const focusedSession = focusedAgent ? office.sessions[focusedAgent.pid] : null;
  // Auto-close if session died
  useEffect(() => {
    if (focusedAgent && !focusedSession) {
      setFocusedAgent(null);
    }
  }, [focusedSession, focusedAgent]);

  return (
    <div className="app-container">
      <div className="diorama-view">
        <OfficeScene 
          office={office} 
          focusedAgent={focusedAgent}
          onFocusAgent={(pid, subagentId) => setFocusedAgent({ pid, subagentId })}
        />
        
        {focusedSession && (
          <InspectorPanel 
            session={focusedSession}
            focusedSubagentId={focusedAgent?.subagentId}
            onClose={() => setFocusedAgent(null)}
            onFocusSubagent={(subId) => setFocusedAgent({ pid: focusedSession.pid, subagentId: subId })}
            onFocusSession={() => setFocusedAgent({ pid: focusedSession.pid })}
          />
        )}
      </div>
      
      <div className="debug-sidebar">
        <div className="app">
          <header>
            <h1>🏢 Claude Agent Verse</h1>
            <span className={`connection ${connected ? "connected" : "disconnected"}`}>
              {connected ? "● Connected" : "○ Disconnected"}
            </span>
          </header>

          {sessions.length === 0 ? (
            <div className="empty">
              <p>No live Claude Code sessions found.</p>
              <p className="hint">
                Start a Claude Code session and it will appear here within ~1 second.
              </p>
            </div>
          ) : (
            <div className="projects">
              {projectKeys.map((projectKey) => {
                const projectSessions = byProject[projectKey].sort((a, b) => a.name.localeCompare(b.name));
                return (
                  <div key={projectKey} className="project-group" style={{ marginBottom: "2rem" }}>
                    <h2>Project: {projectKey}</h2>
                    <table className="sessions-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #ddd" }}>
                          <th>Session / Subagent</th>
                          <th>Directory / Branch</th>
                          <th>State</th>
                          <th>ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectSessions.map((s) => (
                          <SessionRow key={s.pid} session={s} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          <footer>
            <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
