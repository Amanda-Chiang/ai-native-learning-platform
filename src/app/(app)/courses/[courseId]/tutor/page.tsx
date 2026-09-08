import { startConversation, sendTutorMessage, getConversation } from "@/features/tutor-agent/actions.ts";
import { TutorChat } from "@/features/tutor-agent/components/TutorChat.tsx";

export default async function CourseTutorPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { conversationId, error } = await startConversation(courseId);

  if (!conversationId) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "var(--clay)", fontSize: 13.5 }}>{error ?? "Could not start a conversation."}</p>
      </div>
    );
  }

  const { turns } = await getConversation(conversationId);

  return (
    <div style={s.shell}>
      <h1 style={s.title}>Tutor</h1>
      <div style={s.chatArea}>
        <TutorChat conversationId={conversationId} initialTurns={turns} sendMessage={sendTutorMessage} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: { display: "flex", flexDirection: "column", height: "100%" },
  title: {
    flexShrink: 0,
    margin: 0,
    padding: "16px 24px",
    fontSize: 20,
    fontWeight: 500,
    letterSpacing: "-0.025em",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },
  // TutorChat's own root sets height: 100% to fill its parent -- flex: 1
  // plus minHeight: 0 is what lets that resolve correctly here instead
  // of overflowing past the title bar above it (a flex item's default
  // min-height is auto, which would otherwise let it grow to its
  // content's natural height and push past the available space).
  chatArea: { flex: 1, minHeight: 0 },
};
