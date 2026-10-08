import { useEffect, useRef } from "react";
import type { FeedEvent, Session } from "../types";
import { teamColor } from "../scene/theme";
import { StateBadge } from "./StateBadge";

const FEED_LABEL: Record<FeedEvent["type"], string> = {
  text: "Message",
  tool_use: "Tool call",
  tool_result: "Result",
  error: "Error",
};

interface InspectorPanelProps {
  session: Session;
  focusedSubagentId?: string;
  onClose: () => void;
  onFocusSubagent: (subagentId: string) => void;
  onFocusSession: () => void;
}

export function InspectorPanel({ session, focusedSubagentId, onClose, onFocusSubagent, onFocusSession }: InspectorPanelProps) {
  const subagents = Object.values(session.subagents ?? {});
  const focusedSub = focusedSubagentId ? session.subagents?.[focusedSubagentId] : undefined;
  const feedEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.feed]);

  return (
    <div className="panel inspector" style={{ ["--team" as string]: teamColor(session.projectKey) }}>
      <header className="panel__header inspector__header">
        <div className="inspector__heading">
          <div className="inspector__project">
            <span className="project__swatch" />
            {session.projectKey}
            {session.gitBranch && <span className="inspector__branch">{session.gitBranch}</span>}
          </div>
          <h2 onClick={onFocusSession}>{session.title || session.name}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close inspector">
          <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      <div className="panel__body">
        <section className="inspector__section">
          <div className="inspector__status">
            {focusedSub ? (
              <>
                <span className="inspector__label">Intern · {focusedSub.agentType}</span>
                <StateBadge state={focusedSub.state} tool={focusedSub.currentTool} />
                <p className="inspector__desc">{focusedSub.description}</p>
              </>
            ) : (
              <StateBadge state={session.state} tool={session.currentTool} onBreak={session.onBreak} />
            )}
          </div>
        </section>

        {session.lastPrompt && (
          <section className="inspector__section">
            <h3>Last prompt</h3>
            <blockquote className="prompt">{session.lastPrompt}</blockquote>
          </section>
        )}

        {subagents.length > 0 && (
          <section className="inspector__section">
            <h3>Interns</h3>
            <ul className="interns">
              {subagents.map((sub) => (
                <li key={sub.subagentId}>
                  <button className={`intern ${sub.subagentId === focusedSubagentId ? "intern--focused" : ""}`} onClick={() => onFocusSubagent(sub.subagentId)}>
                    <span className="intern__name">{sub.agentType}</span>
                    <span className="intern__desc">{sub.description}</span>
                    <StateBadge state={sub.state} tool={sub.currentTool} compact />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="inspector__section inspector__section--feed">
          <h3>Live feed</h3>
          <ol className="feed">
            {session.feed?.length ? (
              session.feed.map((event) => (
                <li key={event.id} className={`feed__item feed__item--${event.type} feed__item--${event.role}`}>
                  <span className="feed__kind">{FEED_LABEL[event.type]}</span>
                  <span className="feed__text">{event.excerpt}</span>
                </li>
              ))
            ) : (
              <li className="feed__empty">No events yet.</li>
            )}
            <div ref={feedEnd} />
          </ol>
        </section>
      </div>
    </div>
  );
}
