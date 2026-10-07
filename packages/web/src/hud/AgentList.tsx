import type { Office, Session } from "../types";
import type { Focus } from "../scene/OfficeScene";
import { teamColor } from "../scene/theme";
import { StateBadge } from "./StateBadge";

const PRIORITY: Record<string, number> = { waiting_on_user: 0, error: 1, working: 2, thinking: 3, idle: 4, ended: 5 };

/** The debug list: every live session grouped by project, most urgent first. */
export function AgentList({ office, onSelect, onClose }: { office: Office; onSelect: (f: Focus) => void; onClose: () => void }) {
  const byProject = new Map<string, Session[]>();
  for (const s of Object.values(office.sessions)) {
    const list = byProject.get(s.projectKey) ?? [];
    list.push(s);
    byProject.set(s.projectKey, list);
  }
  const urgency = (list: Session[]) => Math.min(...list.map((s) => PRIORITY[s.state] ?? 9));
  const projects = [...byProject.entries()].sort((a, b) => urgency(a[1]) - urgency(b[1]) || a[0].localeCompare(b[0]));

  return (
    <div className="panel">
      <header className="panel__header">
        <h2>Agents</h2>
        <button className="icon-button" onClick={onClose} aria-label="Hide agent list">
          <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>
      <div className="panel__body">
        {projects.map(([project, sessions]) => (
          <section key={project} className="project" style={{ ["--team" as string]: teamColor(project) }}>
            <h3>
              <span className="project__swatch" />
              {project}
              <span className="project__count">{sessions.length}</span>
            </h3>
            <ul>
              {sessions
                .sort((a, b) => (PRIORITY[a.state] ?? 9) - (PRIORITY[b.state] ?? 9) || a.startedAt - b.startedAt)
                .map((s) => (
                  <li key={s.pid}>
                    <button className="agent-row" onClick={() => onSelect({ pid: s.pid })}>
                      <span className="agent-row__title">{s.title || s.name}</span>
                      <StateBadge state={s.state} tool={s.currentTool} compact />
                      {s.gitBranch && <span className="agent-row__branch">{s.gitBranch}</span>}
                    </button>
                    {Object.values(s.subagents ?? {}).map((sub) => (
                      <button key={sub.subagentId} className="agent-row agent-row--intern" onClick={() => onSelect({ pid: s.pid, subagentId: sub.subagentId })}>
                        <span className="agent-row__title">
                          <span className="agent-row__elbow">↳</span>
                          {sub.agentType}
                        </span>
                        <StateBadge state={sub.state} tool={sub.currentTool} compact />
                      </button>
                    ))}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
