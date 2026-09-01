"use client";

import { useState } from "react";
import type { ConversationTurnView, TutorTurnView } from "@/features/tutor-agent/actions.ts";

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {turns.map((turn, i) => (
          <li key={i} style={{ margin: "8px 0", textAlign: turn.role === "student" ? "right" : "left" }}>
            <strong>{turn.role === "student" ? "You" : "Tutor"}:</strong> {turn.content}
          </li>
        ))}
      </ul>
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const message = (new FormData(form).get("message") as string | null)?.trim() ?? "";
          if (message.length === 0) return;

          setTurns((current) => [...current, { role: "student", content: message }]);
          setPending(true);
          setError(null);
          form.reset();

          const result = await sendMessage(conversationId, message);
          setPending(false);
          if (result.error || !result.turn) {
            setError(result.error ?? "The tutor couldn't respond.");
            return;
          }
          setTurns((current) => [...current, result.turn!]);
        }}
      >
        <input name="message" placeholder="Ask the tutor something..." style={{ width: "80%" }} disabled={pending} />
        <button type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
