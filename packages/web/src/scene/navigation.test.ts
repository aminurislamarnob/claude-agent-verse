import { describe, expect, it } from "vitest";
import type { Session } from "../types";
import { angleDelta, axesOf, clampPitch, clampToRoom, createNavStore, forwardOf, headingOf, hold, nextAttention, publishPose, rightOf, zoomBy } from "./navigation";

describe("axesOf", () => {
  it("is still with nothing held", () => {
    const a = axesOf(new Set());
    expect(a).toEqual({ forward: 0, right: 0, turn: 0, zoom: 0, run: false });
  });

  it("maps opposing keys to signed axes and cancels them when both are down", () => {
    expect(axesOf(new Set(["forward"])).forward).toBe(1);
    expect(axesOf(new Set(["back"])).forward).toBe(-1);
    expect(axesOf(new Set(["forward", "back"])).forward).toBe(0);
    expect(axesOf(new Set(["turnRight"])).turn).toBe(1);
    expect(axesOf(new Set(["zoomOut"])).zoom).toBe(-1);
    expect(axesOf(new Set(["run"])).run).toBe(true);
  });

  it("does not let diagonals move faster", () => {
    const a = axesOf(new Set(["forward", "right"]));
    expect(Math.hypot(a.forward, a.right)).toBeCloseTo(1, 6);
  });
});

describe("headings", () => {
  it("round-trips a forward vector through its yaw", () => {
    for (const [fx, fz] of [
      [1, 0],
      [0, -1],
      [-0.6, 0.8],
      [0.7, 0.7],
    ]) {
      const [x, z] = forwardOf(headingOf(fx, fz));
      const len = Math.hypot(fx, fz);
      expect(x).toBeCloseTo(fx / len, 6);
      expect(z).toBeCloseTo(fz / len, 6);
    }
  });

  it("keeps right at right angles to forward, on the right", () => {
    const yaw = -Math.PI / 2; // facing +x
    const [fx, fz] = forwardOf(yaw);
    const [rx, rz] = rightOf(yaw);
    expect(fx).toBeCloseTo(1, 6);
    expect(fx * rx + fz * rz).toBeCloseTo(0, 6);
    // facing +x with +y up, the right hand points along +z
    expect(rz).toBeCloseTo(1, 6);
  });

  it("takes the short way round", () => {
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6, 6);
    expect(angleDelta(0.5, 0.7)).toBeCloseTo(0.2, 6);
  });
});

describe("limits", () => {
  const room = { minX: -2.4, maxX: 22.45, minZ: -3.4, maxZ: 10.6 };

  it("keeps the walker inside the room with a margin", () => {
    expect(clampToRoom(-10, 0, room)).toEqual([-2.05, 0]);
    expect(clampToRoom(5, 99, room)).toEqual([5, 10.25]);
    expect(clampToRoom(5, 5, room)).toEqual([5, 5]);
  });

  it("stops the walker looking straight up or down", () => {
    expect(clampPitch(9)).toBeCloseTo(1.15, 6);
    expect(clampPitch(-9)).toBeCloseTo(-1.15, 6);
    expect(clampPitch(0.3)).toBe(0.3);
  });

  it("zooms in steps within the controls' range", () => {
    expect(zoomBy(40, 1, 12, 260)).toBeCloseTo(50, 6);
    expect(zoomBy(40, -1, 12, 260)).toBeCloseTo(32, 6);
    expect(zoomBy(250, 3, 12, 260)).toBe(260);
    expect(zoomBy(13, -3, 12, 260)).toBe(12);
  });
});

function session(pid: number, state: Session["state"], startedAt = pid): Session {
  return { pid, sessionId: `s${pid}`, cwd: "/p", name: `n${pid}`, state, projectKey: "p", startedAt, feed: [] };
}

describe("nextAttention", () => {
  const sessions = [session(5, "working"), session(2, "error"), session(9, "waiting_on_user"), session(4, "waiting_on_user"), session(7, "idle")];

  it("goes to the oldest agent waiting on you first", () => {
    expect(nextAttention(sessions, null)?.pid).toBe(4);
  });

  it("cycles through the waiting agents, then errors, then wraps", () => {
    expect(nextAttention(sessions, 4)?.pid).toBe(9);
    expect(nextAttention(sessions, 9)?.pid).toBe(2);
    expect(nextAttention(sessions, 2)?.pid).toBe(4);
  });

  it("starts over when the current agent no longer needs attention", () => {
    expect(nextAttention(sessions, 5)?.pid).toBe(4);
  });

  it("has nowhere to go when everyone is fine", () => {
    expect(nextAttention([session(1, "working"), session(2, "idle")], null)).toBeNull();
  });
});

describe("store", () => {
  it("tells listeners about real moves only", () => {
    const store = createNavStore();
    let calls = 0;
    store.listeners.add(() => calls++);
    publishPose(store, { mode: "overview", x: 1, z: 2, yaw: 0, zoom: 40 });
    publishPose(store, { mode: "overview", x: 1.0001, z: 2, yaw: 0, zoom: 40 });
    publishPose(store, { mode: "walk", x: 1, z: 2, yaw: 0, zoom: 40 });
    expect(calls).toBe(2);
  });

  it("holds and releases actions and asks for a frame each time", () => {
    const store = createNavStore();
    let kicks = 0;
    store.kick = () => kicks++;
    hold(store, "forward", true);
    expect(store.held.has("forward")).toBe(true);
    hold(store, "forward", false);
    expect(store.held.size).toBe(0);
    expect(kicks).toBe(2);
  });
});
