import type { AgentKind, AgentState, Office } from "../types";
import { stateColor, stateLabel } from "../scene/theme";
import { ROOMS, roomOf, waitingIn } from "../scene/rooms";

const ORDER: AgentState[] = ["waiting_on_user", "working", "thinking", "error", "idle"];

interface TopBarProps {
  /** The whole office: tabs count every room, the rest describes the room on screen. */
  office: Office;
  room: AgentKind;
  onRoomChange: (room: AgentKind) => void;
  connected: boolean;
  preview: boolean;
}

export function TopBar({ office, room, onRoomChange, connected, preview }: TopBarProps) {
  const all = Object.values(office.sessions);
  const sessions = all.filter((s) => roomOf(s) === room);
  const counts = new Map<AgentState, number>();
  let interns = 0;
  const onBreak = sessions.filter((s) => s.onBreak).length;
  for (const s of sessions) {
    counts.set(s.state, (counts.get(s.state) ?? 0) + 1);
    interns += Object.keys(s.subagents ?? {}).length;
  }
  const projects = new Set(sessions.map((s) => s.projectKey)).size;

  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden>
          <rect x="1" y="1" width="30" height="30" rx="9" fill="#1d1f24" />
          <path d="M12 10.5 6.5 16l5.5 5.5M20 10.5l5.5 5.5-5.5 5.5" fill="none" stroke="#d97757" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="brand__name">
            Agent Verse
            {preview && <span className="brand__tag">Preview</span>}
          </div>
          <div className="brand__meta">
            <span className={`live-dot ${connected ? "live-dot--on" : ""}`} />
            {connected ? "Live" : "Reconnecting…"} · {sessions.length} agent{sessions.length === 1 ? "" : "s"} · {projects} project{projects === 1 ? "" : "s"}
            {interns > 0 && ` · ${interns} intern${interns === 1 ? "" : "s"}`}
            {onBreak > 0 && ` · ${onBreak} on break`}
          </div>
        </div>
      </div>
      <nav className="room-tabs" role="tablist" aria-label="Rooms">
        {ROOMS.map((r) => {
          const inRoom = all.filter((s) => roomOf(s) === r.kind);
          const waiting = waitingIn(inRoom);
          const active = r.kind === room;
          return (
            <button
              key={r.kind}
              role="tab"
              aria-selected={active}
              className={`room-tab ${active ? "room-tab--active" : ""}`}
              style={{ ["--room" as string]: r.accent }}
              onClick={() => onRoomChange(r.kind)}
            >
              <span className="room-tab__swatch" />
              {r.name}
              <span className="room-tab__count">{inRoom.length}</span>
              {waiting > 0 && <span className="room-tab__alert">{waiting} waiting</span>}
            </button>
          );
        })}
      </nav>
      <div className="state-summary">
        {ORDER.map((st) => {
          const n = counts.get(st) ?? 0;
          if (!n && st !== "waiting_on_user") return null;
          return (
            <span
              key={st}
              className={`summary-chip ${st === "waiting_on_user" && n > 0 ? "summary-chip--alert" : ""} ${n === 0 ? "summary-chip--muted" : ""}`}
              style={{ ["--state" as string]: stateColor[st] }}
            >
              <span className="summary-chip__dot" />
              <b>{n}</b> {stateLabel[st]}
            </span>
          );
        })}
      </div>
    </header>
  );
}
