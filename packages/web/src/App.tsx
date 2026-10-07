import { useEffect, useRef, useState, useCallback } from "react";

// ── Types (subset of @claude-agent-verse/core) ───────────────

type AgentState = "working" | "thinking" | "idle" | "error" | "ended";

interface Session {
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
}

interface Office {
  sessions: Record<number, Session>;
}

// ── WebSocket hook ───────────────────────────────────────────

function useOffice(): { office: Office; connected: boolean } {
  const [office, setOffice] = useState<Office>({ sessions: {} });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

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
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { office, connected };
}

// ── Tab title updater ────────────────────────────────────────

function useTabTitle(sessions: Session[]): void {
  useEffect(() => {
    const count = sessions.length;
    if (count === 0) {
      document.title = "Claude Agent Verse — no sessions";
    } else {
      document.title = `Claude Agent Verse — ${count} session${count === 1 ? "" : "s"}`;
    }
  }, [sessions]);
}

// ── Components ───────────────────────────────────────────────

function SessionRow({ session }: { session: Session }) {
  let stateIcon = "💤";
  let stateLabel = "Idle";
  if (session.state === "working") {
    stateIcon = "⚡";
    stateLabel = `Working (${session.currentTool || "tool"})`;
  } else if (session.state === "thinking") {
    stateIcon = "🤔";
    stateLabel = "Thinking";
  } else if (session.state === "error") {
    stateIcon = "❌";
    stateLabel = "Error";
  }

  const stateClass = `state-${session.state}`;

  return (
    <tr className="session-row">
      <td className="session-name">
        <div><strong>{session.title || session.name}</strong></div>
        {session.lastPrompt && <div className="session-prompt" style={{fontSize: "0.85em", color: "#666"}}>{session.lastPrompt}</div>}
      </td>
      <td className="session-cwd" title={session.cwd}>
        <div>{session.cwd}</div>
        {session.gitBranch && <div className="session-branch" style={{fontSize: "0.85em", color: "#666"}}>⎇ {session.gitBranch}</div>}
      </td>
      <td className={`session-state ${stateClass}`}>
        <span className="state-icon">{stateIcon}</span> {stateLabel}
      </td>
      <td className="session-pid">{session.pid}</td>
    </tr>
  );
}

export function App() {
  const { office, connected } = useOffice();

  const sessions = Object.values(office.sessions);
  const byProject = sessions.reduce((acc, s) => {
    acc[s.projectKey] = acc[s.projectKey] || [];
    acc[s.projectKey].push(s);
    return acc;
  }, {} as Record<string, Session[]>);

  const projectKeys = Object.keys(byProject).sort();

  useTabTitle(sessions);

  return (
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
                      <th>Session / Prompt</th>
                      <th>Directory / Branch</th>
                      <th>State</th>
                      <th>PID</th>
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
  );
}
