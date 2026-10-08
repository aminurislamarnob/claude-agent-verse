import { createContext } from "react";
import type { Session } from "../types";
import type { BreakSpot } from "./layout";
import { hash } from "./theme";

// ── Breaks ───────────────────────────────────────────────────
// A Session that has been idle long enough is `onBreak`: its character walks to a
// ping-pong end or the coffee bar, and runs back to its desk when work arrives.

/** Seconds for the ball to go there and back. */
export const RALLY_PERIOD = 1.8;

/** 0‥1 swing strength for the player at `side`; peaks as the ball reaches their bat. */
export function rallyHit(time: number, side: 0 | 1): number {
  const f = (time / RALLY_PERIOD + (side ? 0.5 : 0)) % 1;
  const d = f > 0.5 ? f - 1 : f; // distance to the hit, -0.5‥0.5
  const bell = (x: number, w: number) => Math.exp(-((x / w) ** 2));
  return bell(d + 0.02, 0.06) - 0.45 * bell(d + 0.13, 0.07);
}

/**
 * Spot ids where a character has actually arrived (not just been assigned), so the
 * ball only flies once both players are at the table. Mutated from render loops.
 */
export const BreakPresence = createContext<Set<string>>(new Set());

/**
 * Sticky assignment of on-break sessions to spots. A session keeps its spot for the
 * whole break; newcomers take the first free spot in their own preference order,
 * so some agents head for ping-pong first and others for coffee, except that a lone
 * player always gets a partner before anyone else picks.
 */
export class BreakAllocator {
  private bySession = new Map<number, string>();

  sync(sessions: Session[], spots: BreakSpot[]): Map<number, BreakSpot> {
    const live = new Set(sessions.filter((s) => s.onBreak).map((s) => s.pid));
    for (const pid of [...this.bySession.keys()]) if (!live.has(pid)) this.bySession.delete(pid);
    const ids = new Set(spots.map((s) => s.id));
    for (const [pid, id] of this.bySession) if (!ids.has(id)) this.bySession.delete(pid);
    const taken = new Set(this.bySession.values());
    const waiting = sessions.filter((s) => s.onBreak && !this.bySession.has(s.pid)).sort((a, b) => a.pid - b.pid);
    for (const s of waiting) {
      const coffeeFirst = hash(s.sessionId) % 2 === 0;
      const rank = (i: number) => (spots[i].activity === "coffee" === coffeeFirst ? 0 : 100) + i;
      const order = spots.map((_, i) => i).sort((a, b) => rank(a) - rank(b)).map((i) => spots[i]);
      // A lone ping-pong player is waiting for a partner, so the next agent on break joins them.
      const pingpong = spots.filter((sp) => sp.activity === "pingpong");
      const lone = pingpong.filter((sp) => taken.has(sp.id)).length === 1;
      const spot = (lone && pingpong.find((sp) => !taken.has(sp.id))) || order.find((sp) => !taken.has(sp.id));
      if (!spot) break;
      taken.add(spot.id);
      this.bySession.set(s.pid, spot.id);
    }
    const byId = new Map(spots.map((s) => [s.id, s]));
    return new Map([...this.bySession].map(([pid, id]) => [pid, byId.get(id)!]));
  }
}
