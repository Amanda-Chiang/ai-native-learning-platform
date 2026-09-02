import { getDailyReviewSession, getConnectSession, submitTextReviewAnswer, submitStructuredReviewAnswer } from "@/features/review-scheduler/actions.ts";
import { StudySession } from "@/features/review-scheduler/components/StudySession.tsx";

export default async function CourseStudyPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const [daily, connect] = await Promise.all([
    getDailyReviewSession(courseId),
    getConnectSession(courseId),
  ]);

  return (
    <main>
      <h1>Study</h1>
      <StudySession
        courseId={courseId}
        initialDaily={daily}
        connect={connect}
        // Found live (same class of bug as atlas/page.tsx's
        // getEvidenceProvenance): a plain inline arrow closure has no
        // "use server" reference of its own, so React's RSC boundary
        // rejects passing it to a Client Component. The inline "use
        // server" directive as the function's first statement is what
        // makes this a real server reference.
        loadMore={async (id, excludeConceptIds) => {
          "use server";
          return getDailyReviewSession(id, { excludeConceptIds });
        }}
        submitTextAnswer={submitTextReviewAnswer}
        submitStructuredAnswer={submitStructuredReviewAnswer}
      />
    </main>
  );
}
