"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationTurnView, TutorTurnView } from "@/features/tutor-agent/actions.ts";
import { IconSend } from "@/components/icons.tsx";

/**
 * Minimal chat UI (US1 T012) -- start a conversation on load, send a
 * message, render the turn history as it grows. No streaming (research.md
 * "No streaming in this feature") -- a full turn appears once ready.
 */
export function TutorChat({
  conversationId,
  initialTurns,
  sendMessage,
}: {
  conversationId: string;
  initialTurns: ConversationTurnView[];
  sendMessage: (conversationId: string, message: string) => Promise<{ turn: TutorTurnView | null; error: string | null }>;
}) {
  const [turns, setTurns] = useState<ConversationTurnView[]>(initialTurns);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, pending]);

  async function handleSend() {
    const message = input.trim();
    if (!message || pending) return;

    setTurns((current) => [...current, { role: "student", content: message }]);
    setInput("");
    setPending(true);
    setError(null);

    const result = await sendMessage(conversationId, message);
    setPending(false);
    if (result.error || !result.turn) {
      setError(result.error ?? "The tutor couldn't respond.");
      return;
    }
    setTurns((current) => [...current, result.turn!]);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={s.shell}>
      <div style={s.messages}>
        {turns.length === 0 && (
          <div style={s.empty}>
            <span style={s.emptyMark}>◆</span>
            <p style={s.emptyText}>
              Ask me anything about this course -- concepts, problem-solving approaches, or why something was marked
              wrong.
            </p>
          </div>
        )}
        {turns.map((turn, i) => {
          const isStudent = turn.role === "student";
          return (
            <div key={i} style={{ ...s.msgRow, justifyContent: isStudent ? "flex-end" : "flex-start" }}>
              {!isStudent && <div style={s.aiAvatar}>◆</div>}
              <div style={{ ...s.bubble, ...(isStudent ? s.bubbleUser : s.bubbleAI) }}>
                {turn.content.split("\n").map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < turn.content.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {pending && (
          <div style={{ ...s.msgRow, justifyContent: "flex-start" }}>
            <div style={s.aiAvatar}>◆</div>
            <div style={{ ...s.bubble, ...s.bubbleAI }}>
              <span style={s.typing}>Thinking…</span>
            </div>
          </div>
        )}
        {error && <p style={s.error}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputRow}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          style={s.textarea}
          placeholder="Ask a question…"
          rows={1}
          disabled={pending}
        />
        <button
          type="button"
          aria-label="Send"
          style={{ ...s.sendBtn, opacity: input.trim() ? 1 : 0.4 }}
          onClick={handleSend}
          disabled={!input.trim() || pending}
        >
          <IconSend />
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)", overflow: "hidden" },
  messages: { flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 24px", textAlign: "center" },
  emptyMark: { fontSize: 24, color: "var(--clay)", opacity: 0.6 },
  emptyText: { margin: 0, fontSize: 14, color: "var(--text-tertiary)", lineHeight: 1.6, maxWidth: 360, letterSpacing: "-0.005em" },
  msgRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "var(--clay-muted)",
    border: "1px solid var(--clay-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: "var(--clay)",
    flexShrink: 0,
    marginTop: 2,
  },
  bubble: {
    maxWidth: "72%",
    padding: "11px 14px",
    borderRadius: "var(--radius-md)",
    fontSize: 13.5,
    lineHeight: 1.6,
    letterSpacing: "-0.005em",
    whiteSpace: "pre-wrap",
  },
  bubbleUser: { background: "var(--clay)", color: "var(--clay-fg)", borderBottomRightRadius: 4 },
  bubbleAI: { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)", borderBottomLeftRadius: 4 },
  typing: { color: "var(--text-tertiary)", fontStyle: "italic" },
  error: { fontSize: 12.5, color: "var(--clay)", margin: 0 },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "14px 24px",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
    flexShrink: 0,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    padding: "10px 13px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    background: "var(--bg)",
    outline: "none",
    resize: "none",
    lineHeight: 1.5,
    letterSpacing: "-0.005em",
  },
  sendBtn: {
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    flexShrink: 0,
  },
};
