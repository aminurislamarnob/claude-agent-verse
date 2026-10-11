import type { AgentKind, AgentState, Office, Session, Subagent } from "./types";

// ── Design preview ───────────────────────────────────────────
// `?preview` renders a synthetic office that shows every Agent State at once,
// so the scene can be reviewed without live sessions. It never touches the server.

type Seed = [project: string, title: string, state: AgentState, tool?: string, interns?: AgentState[]][];

interface RoomSeed {
  agent: AgentKind;
  /** First pid; Antigravity's real ids are negative, but any unique number will do here. */
  pid: number;
  seed: Seed;
  /** Desks whose agents are on a long break, and desks that keep leaving and coming back. */
  onBreak: Set<number>;
  commuters: Map<number, number>; // desk → phase offset in ticks
  tools: string[];
}

const COMMUTE_TICKS = 6; // ticks spent at work, then the same on break

const STATES: AgentState[] = ["working", "thinking", "waiting_on_user", "idle", "error"];

const claudeSeed: Seed = [
  ["agent-verse", "Polish the office scene", "working", "Edit", ["working", "thinking"]],
  ["agent-verse", "Reducer catch-up tests", "thinking"],
  ["agent-verse", "Hook installer diff", "idle"],
  ["storefront", "Checkout flow refactor", "waiting_on_user"],
  ["storefront", "Fix product grid CLS", "working", "Bash"],
  ["design-system", "Token audit", "idle"],
  ["design-system", "Button variants", "working", "Write", ["working"]],
  ["docs-site", "Migrate to MDX", "error"],
  ["wp-plugin", "REST endpoint for orders", "working", "Read"],
  ["wp-plugin", "PHPStan level 8", "thinking"],
  ["ml-pipeline", "Eval harness", "idle"],
  ["mobile-app", "Offline sync", "waiting_on_user"],
];

const antigravitySeed: Seed = [
  ["storefront", "Add a dark mode toggle", "working", "replace_file_content"],
  ["storefront", "Audit checkout accessibility", "thinking"],
  ["landing-page", "Hero section animation", "waiting_on_user"],
  ["landing-page", "Lighthouse pass", "idle"],
  ["data-api", "Pagination for /orders", "working", "run_command"],
];

const ROOMS: RoomSeed[] = [
  {
    agent: "claude",
    pid: 1000,
    seed: claudeSeed,
    onBreak: new Set([2, 5, 10]),
    commuters: new Map([[4, 0], [8, 3]]),
    tools: ["Edit", "Bash", "Read", "Grep", "WebFetch", "Write"],
  },
  {
    agent: "antigravity",
    pid: 2000,
    seed: antigravitySeed,
    onBreak: new Set([3]),
    commuters: new Map([[1, 2]]),
    tools: ["view_file", "run_command", "replace_file_content", "grep_search", "browser_subagent", "write_to_file"],
  },
];

function build(tick: number): Office {
  const sessions: Record<number, Session> = {};
  for (const room of ROOMS) addRoom(sessions, room, tick);
  const waitingCount = Object.values(sessions).filter((s) => s.state === "waiting_on_user").length;
  return { sessions, waitingCount };
}

function addRoom(sessions: Record<number, Session>, { agent, pid: firstPid, seed, onBreak: breaks, commuters, tools }: RoomSeed, tick: number) {
  seed.forEach(([projectKey, title, base, tool, interns], i) => {
    const pid = firstPid + i;
    // A few desks cycle through states so the animations can be reviewed.
    const commute = commuters.get(i);
    const onBreak = breaks.has(i) || (commute !== undefined && Math.floor((tick + commute) / COMMUTE_TICKS) % 2 === 1);
    const state = onBreak ? "idle" : i % 4 === 1 ? STATES[(tick + i) % STATES.length] : base;
    const subagents: Record<string, Subagent> = {};
    (interns ?? []).forEach((s, k) => {
      const id = `intern-${i}-${k}`;
      subagents[id] = { subagentId: id, agentType: k ? "Explore" : "general-purpose", description: "Survey call sites", toolUseId: id, state: s, currentTool: s === "working" ? "Grep" : undefined };
    });
    sessions[pid] = {
      pid,
      agent,
      sessionId: agent === "claude" ? `preview-${i}` : `preview-${agent}-${i}`,
      cwd: `~/code/${projectKey}`,
      name: `${projectKey}-${(i * 37).toString(16)}`,
      title,
      state,
      projectKey,
      startedAt: i,
      gitBranch: i % 3 ? "main" : `feat/${title.toLowerCase().split(" ")[0]}`,
      currentTool: state === "working" ? tool ?? tools[(tick + i) % tools.length] : undefined,
      lastPrompt: `${title} — keep the public API stable and add tests.`,
      feed: [
        { id: `${i}a`, role: "user", type: "text", excerpt: `${title}.` },
        { id: `${i}b`, role: "assistant", type: "tool_use", excerpt: `Read src/${projectKey}/index.ts` },
        { id: `${i}c`, role: "user", type: "tool_result", excerpt: "export function main() { … }" },
        { id: `${i}d`, role: "assistant", type: "text", excerpt: "I'll start by mapping the call sites, then update the tests." },
        ...(state === "error" ? [{ id: `${i}e`, role: "user" as const, type: "error" as const, excerpt: "Command failed: pnpm build (exit 1)" }] : []),
      ],
      subagents,
      onBreak,
    };
  });
}

const params = new URLSearchParams(window.location.search);
export const isPreview = params.has("preview");
/** `?preview=still` freezes the cycling desks, which helps when reviewing one pose. */
const still = params.get("preview") === "still";

export function subscribePreview(onOffice: (o: Office) => void): () => void {
  let tick = 0;
  onOffice(build(tick));
  if (still) return () => {};
  const id = setInterval(() => onOffice(build(++tick)), 4000);
  return () => clearInterval(id);
}
