import type { AgentState } from "../types";
import { stateColor, stateLabel } from "../scene/theme";

export function StateBadge({ state, tool, compact = false, onBreak = false }: { state: AgentState; tool?: string; compact?: boolean; onBreak?: boolean }) {
  return (
    <span className={`state-badge state-badge--${state} ${compact ? "state-badge--compact" : ""}`} style={{ ["--state" as string]: stateColor[state] }}>
      <span className="state-badge__dot" />
      {onBreak && state === "idle" ? "On break" : stateLabel[state]}
      {state === "working" && tool && <code>{tool}</code>}
    </span>
  );
}
