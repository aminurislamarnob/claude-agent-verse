import { useEffect, useRef, useState, useCallback } from "react";

// ── Types (subset of @claude-agent-verse/core) ───────────────

interface Session {
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  state: "busy" | "idle";
  projectKey: string;
  startedAt: number;
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
  const stateIcon = session.state === "busy" ? "⚡" : "💤";
  const stateLabel = session.state === "busy" ? "Busy" : "Idle";
  const stateClass = session.state === "busy" ? "state-busy" : "state-idle";

  return (
    <tr className="session-row">
      <td className="session-name">{session.name}</td>
      <td className="session-project">{session.projectKey}</td>
      <td className="session-cwd" title={session.cwd}>
        {session.cwd}
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

  const sessions = Object.values(office.sessions).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

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
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Project</th>
              <th>Working Directory</th>
              <th>State</th>
              <th>PID</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <SessionRow key={s.pid} session={s} />
            ))}
          </tbody>
        </table>
      )}

      <footer>
        <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
      </footer>
    </div>
  );
}
