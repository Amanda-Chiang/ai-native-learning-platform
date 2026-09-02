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
        loadMore={(id, excludeConceptIds) => getDailyReviewSession(id, { excludeConceptIds })}
        submitTextAnswer={submitTextReviewAnswer}
        submitStructuredAnswer={submitStructuredReviewAnswer}
      />
    </main>
  );
}
