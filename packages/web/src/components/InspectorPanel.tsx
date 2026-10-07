import React, { useEffect, useRef } from "react";
import { Session, Subagent, AgentState, FeedEvent } from "../App";

interface InspectorPanelProps {
  session: Session;
  focusedSubagentId?: string;
  onClose: () => void;
  onFocusSubagent: (subagentId: string) => void;
  onFocusSession: () => void;
}

function getStateDetails(state: AgentState, tool?: string) {
  let icon = "💤";
  let label = "Idle";
  if (state === "working") {
    icon = "⚡";
    label = `Working (${tool || "tool"})`;
  } else if (state === "thinking") {
    icon = "🤔";
    label = "Thinking";
  } else if (state === "error") {
    icon = "❌";
    label = "Error";
  } else if (state === "waiting_on_user") {
    icon = "✋";
    label = "Waiting on you";
  }
  return { icon, label, className: `state-${state}` };
}

export function InspectorPanel({ session, focusedSubagentId, onClose, onFocusSubagent, onFocusSession }: InspectorPanelProps) {
  const subagents = Object.values(session.subagents || {});
  const sState = getStateDetails(session.state, session.currentTool);
  
  const feedEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.feed]);

  return (
    <div className="inspector-panel">
      <header className="inspector-header">
        <div style={{ flex: 1 }}>
          <h2 onClick={onFocusSession} style={{ cursor: "pointer" }}>{session.title || session.name}</h2>
          <div className="inspector-meta">
            <span>Project: <strong>{session.projectKey}</strong></span>
            {session.gitBranch && <span>⎇ {session.gitBranch}</span>}
          </div>
        </div>
        <button onClick={onClose} className="close-button">×</button>
      </header>

      <div className="inspector-content">
        <section className="inspector-section">
          <h3>Status</h3>
          <div className={`session-state ${sState.className}`}>
            <span className="state-icon">{sState.icon}</span> {sState.label}
          </div>
        </section>

        {session.lastPrompt && (
          <section className="inspector-section">
            <h3>Last Prompt</h3>
            <div className="prompt-box">{session.lastPrompt}</div>
          </section>
        )}

        {subagents.length > 0 && (
          <section className="inspector-section">
            <h3>Interns</h3>
            <ul className="interns-list">
              {subagents.map(sub => {
                const subState = getStateDetails(sub.state, sub.currentTool);
                const isFocused = sub.subagentId === focusedSubagentId;
                return (
                  <li 
                    key={sub.subagentId} 
                    className={`intern-item ${isFocused ? "focused" : ""}`}
                    onClick={() => onFocusSubagent(sub.subagentId)}
                  >
                    <div className="intern-name">{sub.agentType} <span className="intern-desc">{sub.description}</span></div>
                    <div className={`session-state ${subState.className}`} style={{ fontSize: "0.8rem" }}>
                      <span className="state-icon">{subState.icon}</span> {subState.label}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="inspector-section feed-section">
          <h3>Live Feed</h3>
          <div className="feed-container">
            {session.feed && session.feed.length > 0 ? (
              session.feed.map(event => (
                <div key={event.id} className={`feed-event role-${event.role} type-${event.type}`}>
                  <div className="feed-excerpt">{event.excerpt}</div>
                </div>
              ))
            ) : (
              <div className="feed-empty">No events yet.</div>
            )}
            <div ref={feedEndRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
