/**
 * Session scanner — reads Claude Code's per-process session registry.
 *
 * Claude Code writes one JSON file per running process at
 *   ~/.claude/sessions/<pid>.json
 *
 * Each file contains: pid, sessionId, cwd, name, status, startedAt, etc.
 * Key/token files sitting beside them (*.key) are credentials and MUST NOT be read.
 *
 * This adapter:
 * 1. Lists all *.json files in the sessions directory.
 * 2. Reads each, parses it, and verifies the pid is still alive.
 * 3. Compares against the previous snapshot to emit domain events.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { DomainEvent, AgentState } from "@claude-agent-verse/core";

/** Raw shape of a Claude Code session registry entry. */
interface RawSessionEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  name?: string;
  status?: string;
  startedAt?: number;
  // Unknown fields are intentionally ignored (guardrail).
  [key: string]: unknown;
}

/** Snapshot of live sessions from the last scan. */
export interface ScanSnapshot {
  /** Sessions keyed by PID. */
  sessions: Map<
    number,
    { sessionId: string; cwd: string; name: string; state: AgentState; startedAt: number }
  >;
}

/** Derive a project key from the cwd — basename of the directory. */
function projectKeyFromCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/** Map Claude Code's status string to our AgentState. */
function mapStatus(status: string | undefined): AgentState {
  // Claude Code uses: "busy", "idle", "shell", and possibly others.
  // "busy" → busy; everything else → idle.
  if (status === "busy") return "busy";
  return "idle";
}

/** Check whether a PID is alive. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Get the sessions directory path. */
export function sessionsDir(): string {
  return join(homedir(), ".claude", "sessions");
}

/**
 * Scan the session registry and emit domain events for changes since
 * the previous snapshot. Returns the new snapshot.
 */
export async function scan(
  prev: ScanSnapshot,
): Promise<{ events: DomainEvent[]; snapshot: ScanSnapshot }> {
  const dir = sessionsDir();
  const events: DomainEvent[] = [];
  const next: ScanSnapshot = { sessions: new Map() };

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    // Directory doesn't exist or isn't readable — return empty.
    // Emit ended events for any previously known sessions.
    for (const pid of prev.sessions.keys()) {
      events.push({ type: "session_ended", pid });
    }
    return { events, snapshot: next };
  }

  // Only read .json files, skip .key files (credentials — guardrail).
  const jsonFiles = files.filter(
    (f) => f.endsWith(".json") && !f.includes(".key"),
  );

  for (const file of jsonFiles) {
    try {
      const raw = await readFile(join(dir, file), "utf-8");
      const entry: RawSessionEntry = JSON.parse(raw);

      // Skip entries without a pid.
      if (typeof entry.pid !== "number") continue;

      // Verify the process is still alive — dead pids are never shown as live.
      if (!isProcessAlive(entry.pid)) continue;

      const state = mapStatus(entry.status);
      const name = entry.name ?? `session-${entry.pid}`;
      const startedAt = entry.startedAt ?? Date.now();

      next.sessions.set(entry.pid, {
        sessionId: entry.sessionId,
        cwd: entry.cwd,
        name,
        state,
        startedAt,
      });

      const prevSession = prev.sessions.get(entry.pid);

      if (!prevSession) {
        // New session appeared.
        events.push({
          type: "session_appeared",
          pid: entry.pid,
          sessionId: entry.sessionId,
          cwd: entry.cwd,
          name,
          state,
          projectKey: projectKeyFromCwd(entry.cwd),
          startedAt,
        });
      } else if (prevSession.state !== state) {
        // State changed.
        events.push(
          state === "busy"
            ? { type: "session_busy", pid: entry.pid }
            : { type: "session_idle", pid: entry.pid },
        );
      }
    } catch {
      // Skip files that can't be read or parsed (guardrail: skip unknown formats).
      continue;
    }
  }

  // Detect ended sessions — previously known PIDs no longer in the new snapshot.
  for (const pid of prev.sessions.keys()) {
    if (!next.sessions.has(pid)) {
      events.push({ type: "session_ended", pid });
    }
  }

  return { events, snapshot: next };
}

/** Create an empty scan snapshot. */
export function emptyScanSnapshot(): ScanSnapshot {
  return { sessions: new Map() };
}
