import { useCallback, useEffect, useRef, useState } from "react";
import { OfficeScene, type Focus } from "./scene/OfficeScene";
import { InspectorPanel } from "./hud/InspectorPanel";
import { TopBar } from "./hud/TopBar";
import { AgentList } from "./hud/AgentList";
import { isPreview, subscribePreview } from "./preview";
import type { Office } from "./types";

export type { AgentState, FeedEvent, Office, Session, Subagent } from "./types";

// ── WebSocket hook ───────────────────────────────────────────

function useOffice(): { office: Office; connected: boolean } {
  const [office, setOffice] = useState<Office>({ sessions: {}, waitingCount: 0 });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = new URLSearchParams(window.location.search).get("token") || "";
    const ws = new WebSocket(`${proto}//${window.location.host}?token=${token}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "snapshot" && msg.office) setOffice(msg.office);
      } catch {
        // Ignore malformed messages.
      }
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 2000);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    if (isPreview) {
      setConnected(true);
      return subscribePreview(setOffice);
    }
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { office, connected };
}

// ── Tab title + favicon badge ────────────────────────────────

function useTabTitle(waitingCount: number): void {
  useEffect(() => {
    document.title = waitingCount > 0 ? `(${waitingCount}) Agent Verse` : "Agent Verse";
  }, [waitingCount]);
}

function useFaviconBadge(waitingCount: number): void {
  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1d1f24";
    ctx.beginPath();
    ctx.roundRect(4, 4, 56, 56, 16);
    ctx.fill();
    ctx.strokeStyle = "#d97757";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(24, 22);
    ctx.lineTo(14, 32);
    ctx.lineTo(24, 42);
    ctx.moveTo(40, 22);
    ctx.lineTo(50, 32);
    ctx.lineTo(40, 42);
    ctx.stroke();
    if (waitingCount > 0) {
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(48, 16, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1d1f24";
      ctx.font = "bold 20px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.min(waitingCount, 9)), 48, 17);
    }
    link.href = canvas.toDataURL("image/png");
  }, [waitingCount]);
}

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

// ── App ──────────────────────────────────────────────────────

export function App() {
  const { office, connected } = useOffice();
  const [focus, setFocus] = useState<Focus>(null);
  const [listOpen, setListOpen] = useState(true);

  const wide = useMediaQuery("(min-width: 901px)");
  useTabTitle(office.waitingCount);
  useFaviconBadge(office.waitingCount);

  const focusedSession = focus ? office.sessions[focus.pid] : undefined;
  useEffect(() => {
    if (focus && !focusedSession) setFocus(null);
  }, [focus, focusedSession]);
  const sideOpen = listOpen || !!focusedSession;

  return (
    <div className="app-shell">
      <div className="scene">
        <OfficeScene office={office} focus={focus} onSelect={setFocus} insetRight={sideOpen && wide ? 380 : 0} />
      </div>

      <TopBar office={office} connected={connected} preview={isPreview} />

      {Object.keys(office.sessions).length === 0 && (
        <div className="empty-state">
          <h2>The office is quiet</h2>
          <p>Start a Claude Code session and its agent will walk in within a second.</p>
        </div>
      )}

      <aside className={`side ${sideOpen ? "side--open" : ""}`}>
        {focusedSession ? (
          <InspectorPanel
            session={focusedSession}
            focusedSubagentId={focus?.subagentId}
            onClose={() => setFocus(null)}
            onFocusSubagent={(subagentId) => setFocus({ pid: focusedSession.pid, subagentId })}
            onFocusSession={() => setFocus({ pid: focusedSession.pid })}
          />
        ) : (
          listOpen && <AgentList office={office} onSelect={setFocus} onClose={() => setListOpen(false)} />
        )}
      </aside>
      {!listOpen && !focusedSession && (
        <button className="side-toggle" onClick={() => setListOpen(true)}>
          Agents <span>{Object.keys(office.sessions).length}</span>
        </button>
      )}
    </div>
  );
}
