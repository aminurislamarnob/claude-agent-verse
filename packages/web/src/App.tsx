import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OfficeScene, type Focus } from "./scene/OfficeScene";
import { InspectorPanel } from "./hud/InspectorPanel";
import { TopBar } from "./hud/TopBar";
import { AgentList } from "./hud/AgentList";
import { isPreview, subscribePreview } from "./preview";
import { ROOMS, officeInRoom, roomTheme } from "./scene/rooms";
import { timeOverridden, useDaylight } from "./scene/daylight";
import type { AgentKind, Office } from "./types";

export type { AgentKind, AgentState, FeedEvent, Office, Session, Subagent } from "./types";

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

// ── Active room ──────────────────────────────────────────────

const ROOM_KEY = "agent-verse:room";

/** The room on screen, remembered per browser so a reload comes back to it. */
function useRoom(): [AgentKind, (room: AgentKind) => void] {
  const [room, setRoom] = useState<AgentKind>(() => {
    try {
      const saved = localStorage.getItem(ROOM_KEY);
      if (ROOMS.some((r) => r.kind === saved)) return saved as AgentKind;
    } catch {
      // storage blocked; start in the first room
    }
    return ROOMS[0].kind;
  });
  const choose = useCallback((next: AgentKind) => {
    setRoom(next);
    try {
      localStorage.setItem(ROOM_KEY, next);
    } catch {
      // not remembered, still switched
    }
  }, []);
  return [room, choose];
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

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function App() {
  const { office, connected } = useOffice();
  const [focus, setFocus] = useState<Focus>(null);
  const [listOpen, setListOpen] = useState(true);
  const [room, setRoom] = useRoom();
  const theme = roomTheme(room);
  // Only the room on screen is rendered and listed; the tab title still counts every room.
  const roomOffice = useMemo(() => officeInRoom(office, room), [office, room]);

  const wide = useMediaQuery("(min-width: 901px)");
  useTabTitle(office.waitingCount);
  useFaviconBadge(office.waitingCount);
  const daylight = useDaylight();
  // the page behind the diorama dims with the evening so the lit office reads against it
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--bg-top", daylight.page.top);
    root.setProperty("--bg-bottom", daylight.page.bottom);
  }, [daylight.page.top, daylight.page.bottom]);

  const focusedSession = focus ? roomOffice.sessions[focus.pid] : undefined;
  useEffect(() => {
    if (focus && !focusedSession) setFocus(null);
  }, [focus, focusedSession]);
  const sideOpen = listOpen || !!focusedSession;

  return (
    <div className="app-shell">
      <div className="scene">
        <OfficeScene office={roomOffice} room={theme} daylight={daylight} focus={focus} onSelect={setFocus} insetRight={sideOpen && wide ? 380 : 0} />
      </div>

      <TopBar
        office={office}
        room={room}
        onRoomChange={(next) => {
          setFocus(null);
          setRoom(next);
        }}
        connected={connected}
        preview={isPreview}
        clock={timeOverridden ? formatHour(daylight.hour) : undefined}
      />

      {Object.keys(roomOffice.sessions).length === 0 && (
        <div className="empty-state">
          <h2>The {theme.name} room is quiet</h2>
          <p>{theme.hint}</p>
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
          listOpen && <AgentList office={roomOffice} onSelect={setFocus} onClose={() => setListOpen(false)} />
        )}
      </aside>
      {!listOpen && !focusedSession && (
        <button className="side-toggle" onClick={() => setListOpen(true)}>
          Agents <span>{Object.keys(roomOffice.sessions).length}</span>
        </button>
      )}
    </div>
  );
}
