import type { AgentState, Office, Session, Subagent } from "./types";

// ── Design preview ───────────────────────────────────────────
// `?preview` renders a synthetic office that shows every Agent State at once,
// so the scene can be reviewed without live sessions. It never touches the server.

const STATES: AgentState[] = ["working", "thinking", "waiting_on_user", "idle", "error"];
const TOOLS = ["Edit", "Bash", "Read", "Grep", "WebFetch", "Write"];

const seed: [project: string, title: string, state: AgentState, tool?: string, interns?: AgentState[]][] = [
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

function build(tick: number): Office {
  const sessions: Record<number, Session> = {};
  seed.forEach(([projectKey, title, base, tool, interns], i) => {
    const pid = 1000 + i;
    // A few desks cycle through states so the animations can be reviewed.
    const state = i % 4 === 1 ? STATES[(tick + i) % STATES.length] : base;
    const subagents: Record<string, Subagent> = {};
    (interns ?? []).forEach((s, k) => {
      const id = `intern-${i}-${k}`;
      subagents[id] = { subagentId: id, agentType: k ? "Explore" : "general-purpose", description: "Survey call sites", toolUseId: id, state: s, currentTool: s === "working" ? "Grep" : undefined };
    });
    sessions[pid] = {
      pid,
      sessionId: `preview-${i}`,
      cwd: `~/code/${projectKey}`,
      name: `${projectKey}-${(i * 37).toString(16)}`,
      title,
      state,
      projectKey,
      startedAt: i,
      gitBranch: i % 3 ? "main" : `feat/${title.toLowerCase().split(" ")[0]}`,
      currentTool: state === "working" ? tool ?? TOOLS[(tick + i) % TOOLS.length] : undefined,
      lastPrompt: `${title} — keep the public API stable and add tests.`,
      feed: [
        { id: `${i}a`, role: "user", type: "text", excerpt: `${title}.` },
        { id: `${i}b`, role: "assistant", type: "tool_use", excerpt: `Read src/${projectKey}/index.ts` },
        { id: `${i}c`, role: "user", type: "tool_result", excerpt: "export function main() { … }" },
        { id: `${i}d`, role: "assistant", type: "text", excerpt: "I'll start by mapping the call sites, then update the tests." },
        ...(state === "error" ? [{ id: `${i}e`, role: "user" as const, type: "error" as const, excerpt: "Command failed: pnpm build (exit 1)" }] : []),
      ],
      subagents,
    };
  });
  const waitingCount = Object.values(sessions).filter((s) => s.state === "waiting_on_user").length;
  return { sessions, waitingCount };
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
