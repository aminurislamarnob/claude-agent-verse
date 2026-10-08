import type { Office, Session } from "../types";

// ── Office floor plan ────────────────────────────────────────
// Project pods sit on a fixed grid; desks inside a pod are rows of three.
// Slots are sticky: a pod or desk keeps its position for as long as it lives,
// and freed slots are reused lowest-first.

export const DESK_PITCH = 1.85;
export const ROW_PITCH = 2.6;
export const DESKS_PER_ROW = 3;
export const POD_COLS = 3;
const POD_W = DESKS_PER_ROW * DESK_PITCH + 1.6;
const POD_ROWS_MIN = 1;
export const LOUNGE_DEPTH = 3.4; // amenity strip along the back wall
export const SIDE_DEPTH = 2.4; // amenity strip along the left wall

export class SlotAllocator {
  private slots = new Map<string, number>();

  sync(keys: string[]): Map<string, number> {
    const live = new Set(keys);
    for (const k of [...this.slots.keys()]) if (!live.has(k)) this.slots.delete(k);
    const used = new Set(this.slots.values());
    for (const k of keys) {
      if (this.slots.has(k)) continue;
      let i = 0;
      while (used.has(i)) i++;
      used.add(i);
      this.slots.set(k, i);
    }
    return this.slots;
  }
}

export interface DeskSlot {
  key: string;
  session: Session | null; // null = unoccupied hot desk
  x: number;
  z: number;
}

export interface Pod {
  projectKey: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  desks: DeskSlot[];
  nooks: { x: number; z: number }[];
}

export interface FloorPlan {
  pods: Pod[];
  /** Room interior bounds, including amenity strips. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Allocators {
  pods: SlotAllocator;
  desks: Map<string, SlotAllocator>;
}

export function createAllocators(): Allocators {
  return { pods: new SlotAllocator(), desks: new Map() };
}

export function planFloor(office: Office, alloc: Allocators): FloorPlan {
  const byProject = new Map<string, Session[]>();
  for (const s of Object.values(office.sessions)) {
    const list = byProject.get(s.projectKey) ?? [];
    list.push(s);
    byProject.set(s.projectKey, list);
  }
  // Initial order is alphabetical so a fresh load is predictable.
  const projectKeys = [...byProject.keys()].sort();
  const podSlots = alloc.pods.sync(projectKeys);
  for (const k of [...alloc.desks.keys()]) if (!byProject.has(k)) alloc.desks.delete(k);

  // Desk slots per pod.
  const podDesks = new Map<string, { slots: Map<string, number>; sessions: Map<string, Session> }>();
  for (const key of projectKeys) {
    const sessions = byProject.get(key)!.sort((a, b) => a.startedAt - b.startedAt);
    let da = alloc.desks.get(key);
    if (!da) alloc.desks.set(key, (da = new SlotAllocator()));
    const ids = sessions.map((s) => String(s.pid));
    podDesks.set(key, { slots: new Map(da.sync(ids)), sessions: new Map(sessions.map((s) => [String(s.pid), s])) });
  }

  // Row depth of each grid row grows only if a pod needs more than two desk rows.
  const gridRows = new Map<number, number>();
  for (const key of projectKeys) {
    const slot = podSlots.get(key)!;
    const maxSlot = Math.max(...podDesks.get(key)!.slots.values());
    const rows = Math.max(POD_ROWS_MIN, Math.floor(maxSlot / DESKS_PER_ROW) + 1);
    const gr = Math.floor(slot / POD_COLS);
    gridRows.set(gr, Math.max(gridRows.get(gr) ?? POD_ROWS_MIN, rows));
  }
  const maxGridRow = Math.max(0, ...gridRows.keys());
  const rowZ: number[] = [];
  let z = 0;
  for (let r = 0; r <= maxGridRow; r++) {
    rowZ.push(z);
    z += (gridRows.get(r) ?? POD_ROWS_MIN) * ROW_PITCH + 0.6;
  }
  const usedCols = Math.min(POD_COLS, Math.max(1, ...[...podSlots.values()].map((s) => s + 1)));

  const pods: Pod[] = projectKeys.map((key) => {
    const slot = podSlots.get(key)!;
    const gr = Math.floor(slot / POD_COLS);
    const px = (slot % POD_COLS) * POD_W;
    const pz = rowZ[gr];
    const { slots, sessions } = podDesks.get(key)!;
    const rows = gridRows.get(gr) ?? POD_ROWS_MIN;
    const occupied = new Map([...slots].map(([id, i]) => [i, id]));
    const filled = Math.max(...slots.values()) + 1;
    // One spare hot desk per pod keeps the office lived-in without looking deserted.
    const total = filled % DESKS_PER_ROW === 0 ? filled : filled + 1;
    const desks: DeskSlot[] = [];
    for (let i = 0; i < total; i++) {
      const id = occupied.get(i);
      desks.push({
        key: id ?? `${key}#empty${i}`,
        session: id ? sessions.get(id)! : null,
        x: px + 1.0 + DESK_PITCH / 2 + (i % DESKS_PER_ROW) * DESK_PITCH,
        z: pz + 0.9 + Math.floor(i / DESKS_PER_ROW) * ROW_PITCH,
      });
    }
    // Slots left over in the last desk row become a small break-out nook.
    const nooks: { x: number; z: number }[] = [];
    for (let i = total; i % DESKS_PER_ROW !== 0; i++)
      nooks.push({ x: px + 1.0 + DESK_PITCH / 2 + (i % DESKS_PER_ROW) * DESK_PITCH, z: pz + 0.9 + Math.floor(i / DESKS_PER_ROW) * ROW_PITCH });
    return { projectKey: key, x: px, z: pz, width: POD_W, depth: rows * ROW_PITCH, desks, nooks };
  });

  return {
    pods,
    minX: -SIDE_DEPTH,
    maxX: Math.max(usedCols * POD_W, 7),
    minZ: -LOUNGE_DEPTH,
    maxZ: Math.max(z, 5.5),
  };
}
