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

  return <TutorChat conversationId={conversationId} initialTurns={turns} sendMessage={sendTutorMessage} />;
}
