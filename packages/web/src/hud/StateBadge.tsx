import type { AgentState } from "../types";
import { stateColor, stateLabel } from "../scene/theme";

export function StateBadge({ state, tool, compact = false }: { state: AgentState; tool?: string; compact?: boolean }) {
  return (
    <span className={`state-badge state-badge--${state} ${compact ? "state-badge--compact" : ""}`} style={{ ["--state" as string]: stateColor[state] }}>
      <span className="state-badge__dot" />
      {stateLabel[state]}
      {state === "working" && tool && <code>{tool}</code>}
    </span>
  );
}
