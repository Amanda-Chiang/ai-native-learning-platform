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
      <main>
        <h1>Tutor</h1>
        <p style={{ color: "#dc2626" }}>{error ?? "Could not start a conversation."}</p>
      </main>
    );
  }

  const { turns } = await getConversation(conversationId);

  return (
    <main>
      <h1>Tutor</h1>
      <TutorChat conversationId={conversationId} initialTurns={turns} sendMessage={sendTutorMessage} />
    </main>
  );
}
