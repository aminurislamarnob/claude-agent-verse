import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { hold, type NavAction, type NavStore, type ViewMode } from "../scene/navigation";

// ── On-screen navigation ─────────────────────────────────────
// A game-style pad for people without a keyboard, or a mouse hand that would
// rather not leave the trackpad: a d-pad to move, turn and zoom, Home to fit the
// room, and a switch between the overview and walking the floor. Buttons act
// while held, exactly like the keys.

interface NavPadProps {
  store: NavStore;
  mode: ViewMode;
  onToggleMode: () => void;
  onFit: () => void;
  onHelp: () => void;
  helpOpen: boolean;
  /** Pixels on the right covered by the side panel. */
  insetRight: number;
}

function HoldButton({ store, action, label, title, className = "" }: { store: NavStore; action: NavAction; label: string; title: string; className?: string }) {
  const held = useRef(false);
  const release = () => {
    if (!held.current) return;
    held.current = false;
    hold(store, action, false);
  };
  // a pointer that leaves the page mid-press still releases
  useEffect(() => {
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const press = (e: ReactPointerEvent) => {
    e.preventDefault();
    if (held.current) return;
    held.current = true;
    hold(store, action, true);
  };
  return (
    <button
      type="button"
      className={`nav-btn ${className}`}
      title={title}
      aria-label={title}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function NavPad({ store, mode, onToggleMode, onFit, onHelp, helpOpen, insetRight }: NavPadProps) {
  const walk = mode === "walk";
  return (
    <div className="nav-pad glass" style={{ right: insetRight + 16 }} role="toolbar" aria-label="Navigation">
      <div className="nav-pad__dpad">
        <HoldButton store={store} action="turnLeft" label="⟲" title="Turn left (Q)" className="nav-btn--corner" />
        <HoldButton store={store} action="forward" label="▲" title={walk ? "Walk forward (W)" : "Pan up (W)"} />
        <HoldButton store={store} action="turnRight" label="⟳" title="Turn right (E)" className="nav-btn--corner" />
        <HoldButton store={store} action="left" label="◀" title={walk ? "Strafe left (A)" : "Pan left (A)"} />
        <button type="button" className="nav-btn nav-btn--home" title="Fit the whole room (Home)" aria-label="Fit the whole room" onClick={onFit}>
          ⌂
        </button>
        <HoldButton store={store} action="right" label="▶" title={walk ? "Strafe right (D)" : "Pan right (D)"} />
        <HoldButton store={store} action="run" label="»" title="Hold to go faster (Shift)" className="nav-btn--corner" />
        <HoldButton store={store} action="back" label="▼" title={walk ? "Walk back (S)" : "Pan down (S)"} />
        <button type="button" className={`nav-btn nav-btn--corner ${helpOpen ? "nav-btn--on" : ""}`} title="Keys (H)" aria-label="Show navigation keys" aria-pressed={helpOpen} onClick={onHelp}>
          ?
        </button>
      </div>
      <div className="nav-pad__column">
        <HoldButton store={store} action="zoomIn" label="+" title="Zoom in (+)" className={walk ? "nav-btn--off" : ""} />
        <HoldButton store={store} action="zoomOut" label="−" title="Zoom out (−)" className={walk ? "nav-btn--off" : ""} />
        <button type="button" className={`nav-btn nav-btn--mode ${walk ? "nav-btn--on" : ""}`} title={walk ? "Back to the overview (V)" : "Walk the floor (V)"} aria-pressed={walk} onClick={onToggleMode}>
          {walk ? "⤴" : "🚶"}
        </button>
      </div>
    </div>
  );
}

/** Key map, shown on demand. */
export function NavHelp({ mode, onClose, insetRight }: { mode: ViewMode; onClose: () => void; insetRight: number }) {
  const [, force] = useState(0);
  useEffect(() => void force((n) => n + 1), [mode]);
  const walk = mode === "walk";
  const rows: [string, string][] = walk
    ? [
        ["W A S D / arrows", "walk and strafe"],
        ["Q / E", "turn"],
        ["Drag", "look around"],
        ["Double-click", "lock the mouse for first-person look (Esc frees it)"],
        ["Shift", "run"],
        ["Click an agent", "turn to face them and open their panel"],
        ["V", "back to the overview"],
      ]
    : [
        ["W A S D / arrows", "pan"],
        ["Q / E", "orbit"],
        ["+ / − or wheel", "zoom, toward the pointer"],
        ["Double-click", "zoom in on that spot"],
        ["Drag", "orbit; right-drag pans"],
        ["Shift", "faster"],
        ["Home or 0", "fit the room"],
        ["V", "walk the floor"],
      ];
  rows.push(["N", "next agent waiting on you"], ["Esc", "close the panel, or leave walk mode"], ["H or ?", "this list"]);
  return (
    <div className="nav-help glass" style={{ right: insetRight + 16 }} role="dialog" aria-label="Navigation keys">
      <div className="nav-help__head">
        <b>{walk ? "Walking the floor" : "Overview"}</b>
        <button type="button" className="nav-help__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
