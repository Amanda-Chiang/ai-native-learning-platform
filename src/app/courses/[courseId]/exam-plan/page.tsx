import { getExamConfig, getExamPlan, getExamReadiness, configureExam } from "@/features/exam-planner/actions.ts";
import { submitTextReviewAnswer, submitStructuredReviewAnswer } from "@/features/review-scheduler/actions.ts";
import { ExamPlanner } from "@/features/exam-planner/components/ExamPlanner.tsx";

export default async function CourseExamPlanPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const { config } = await getExamConfig(courseId);
  const [plan, readiness] = await Promise.all([
    config ? getExamPlan(courseId) : Promise.resolve(null),
    config ? getExamReadiness(courseId) : Promise.resolve(null),
  ]);

  return (
    <main>
      <h1>Exam Plan</h1>
      <ExamPlanner
        courseId={courseId}
        initialConfig={config}
        initialPlan={plan}
        initialReadiness={readiness}
        configureExam={configureExam}
        submitTextAnswer={submitTextReviewAnswer}
        submitStructuredAnswer={submitStructuredReviewAnswer}
      />
    </main>
  );
}
