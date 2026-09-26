import {
  listExamConfigs,
  getExamPlan,
  getExamReadiness,
  configureExam,
  updateExamConfig,
  deleteExamConfig,
  listScopeableConcepts,
} from "@/features/exam-planner/actions.ts";
import { pickDefaultExamConfig } from "@/features/exam-planner/default-exam-selection.ts";
import { submitTextReviewAnswer, submitStructuredReviewAnswer } from "@/features/review-scheduler/actions.ts";
import { ExamPlanner } from "@/features/exam-planner/components/ExamPlanner.tsx";

export default async function CourseExamPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { courseId } = await params;
  const { exam: examParam } = await searchParams;

  // scopeableConcepts is now needed unconditionally -- Add/Edit are
  // both reachable regardless of how many exams already exist, unlike
  // the old single-exam page where the form only ever appeared once,
  // before the first exam existed.
  const [examConfigs, scopeableConcepts] = await Promise.all([
    listExamConfigs(courseId),
    listScopeableConcepts(courseId),
  ]);

  // ?exam=<id> deep-links to one specific exam (Today's "Upcoming"
  // sidebar uses this) -- validated against the real list rather than
  // trusted blindly; an unknown or foreign id just falls back to the
  // same default-pick logic below, never an error page.
  const requestedId = typeof examParam === "string" ? examParam : undefined;
  const requestedConfig = requestedId ? (examConfigs.find((c) => c.id === requestedId) ?? null) : null;
  const selectedConfig = requestedConfig ?? pickDefaultExamConfig(examConfigs, new Date());

  const [plan, readiness] = await Promise.all([
    selectedConfig ? getExamPlan(selectedConfig.id) : Promise.resolve(null),
    selectedConfig ? getExamReadiness(selectedConfig.id) : Promise.resolve(null),
  ]);

  return (
    <ExamPlanner
      courseId={courseId}
      examConfigs={examConfigs}
      selectedExamConfigId={selectedConfig?.id ?? null}
      initialPlan={plan}
      initialReadiness={readiness}
      scopeableConcepts={scopeableConcepts}
      configureExam={configureExam}
      updateExamConfig={updateExamConfig}
      deleteExamConfig={deleteExamConfig}
      loadExamPlanAndReadiness={async (examConfigId) => {
        "use server";
        const [plan, readiness] = await Promise.all([getExamPlan(examConfigId), getExamReadiness(examConfigId)]);
        return { plan, readiness };
      }}
      submitTextAnswer={submitTextReviewAnswer}
      submitStructuredAnswer={submitStructuredReviewAnswer}
    />
  );
}
