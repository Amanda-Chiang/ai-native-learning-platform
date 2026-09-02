"use client";

import { useState } from "react";
import type { ExamConfigView, GetExamPlanResult, GetExamReadinessResult } from "@/features/exam-planner/actions.ts";
import type { SessionItem } from "@/features/review-scheduler/daily-session.ts";

type SubmitResult = { result: { outcome: string; [key: string]: unknown }; error: string | null };

/**
 * Exam configuration + staged plan + readiness UI (T012/T016). Text-
 * modality plan items reuse review-scheduler's existing
 * submitTextReviewAnswer directly (FR-012) -- this feature adds no
 * grading action of its own. Structured (graph/tree) items share the
 * same "not yet answerable here" limitation review-scheduler's own
 * /study page already documents, not silently re-solved differently
 * here.
 */
export function ExamPlanner({
  courseId,
  initialConfig,
  initialPlan,
  initialReadiness,
  configureExam,
  submitTextAnswer,
}: {
  courseId: string;
  initialConfig: ExamConfigView | null;
  initialPlan: GetExamPlanResult | null;
  initialReadiness: GetExamReadinessResult | null;
  configureExam: (courseId: string, examDate: string, scopeConceptIds: string[], scopeUnitIds: string[]) => Promise<{ examConfigId: string | null; error: string | null }>;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [plan, setPlan] = useState(initialPlan);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [configError, setConfigError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SubmitResult>>({});

  async function handleConfigure(formData: FormData) {
    const examDate = (formData.get("examDate") as string | null) ?? "";
    const scopeConceptIds = ((formData.get("scopeConceptIds") as string | null) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const outcome = await configureExam(courseId, examDate, scopeConceptIds, []);
    if (outcome.error) {
      setConfigError(outcome.error);
      return;
    }
    setConfigError(null);
    window.location.reload();
  }

  async function handleAnswer(item: SessionItem, response: string) {
    if (response.trim().length === 0) return;
    const outcome = await submitTextAnswer({ courseId, conceptId: item.conceptId, rubric: item.rubric, response });
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <section>
        <h2>Exam configuration</h2>
        {config ? (
          <p>Exam date: {config.examDate}</p>
        ) : (
          <form
            action={async (formData) => {
              await handleConfigure(formData);
            }}
          >
            <label>
              Exam date
              <input type="date" name="examDate" required />
            </label>
            <label>
              Scope concept ids (comma-separated)
              <input type="text" name="scopeConceptIds" required />
            </label>
            <button type="submit">Configure exam</button>
          </form>
        )}
        {configError && <p style={{ color: "#dc2626" }}>{configError}</p>}
      </section>

      {plan && "error" in plan && (
        <p>
          {plan.error === "no_exam_configured" && "Configure an exam above to see your staged plan."}
          {plan.error === "exam_date_passed" && "This exam's date has already passed."}
        </p>
      )}

      {plan && !("error" in plan) && (
        <section>
          <h2>Staged plan</h2>
          {plan.stages.map((stage) => (
            <div key={stage.stage} style={{ margin: "16px 0", padding: 12, border: stage.stage === plan.currentStageName ? "2px solid #2563eb" : "1px solid #e5e7eb" }}>
              <h3>{stage.stage}</h3>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                {new Date(stage.startDate).toLocaleDateString()} - {new Date(stage.endDate).toLocaleDateString()}
              </p>
              {stage.contentGap ? (
                <p>{stage.message}</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {stage.items.map((item, i) => {
                    const sessionItem = item as SessionItem & { sourceConceptId?: string; targetConceptId?: string; edgeId?: string };
                    if (sessionItem.edgeId) {
                      return (
                        <li key={sessionItem.edgeId}>
                          Connection to review: {sessionItem.sourceConceptId} -&gt; {sessionItem.targetConceptId}
                        </li>
                      );
                    }
                    return (
                      <li key={i}>
                        <p>{sessionItem.questionText}</p>
                        {sessionItem.responseModality === "text" ? (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const response = (new FormData(e.currentTarget).get("response") as string | null) ?? "";
                              await handleAnswer(sessionItem, response);
                            }}
                          >
                            <textarea name="response" rows={3} style={{ width: "100%" }} />
                            <button type="submit">Submit</button>
                          </form>
                        ) : (
                          <p style={{ fontSize: 13, color: "#6b7280" }}>This question type isn&apos;t answerable here yet.</p>
                        )}
                        {/* A real error must be shown as an error, never
                            rendered as a plausible-looking grading
                            outcome (same hardening-pass finding as
                            review-scheduler's StudySession.tsx). */}
                        {results[sessionItem.conceptId] && (
                          results[sessionItem.conceptId].error ? (
                            <p style={{ color: "#dc2626" }}>{results[sessionItem.conceptId].error}</p>
                          ) : (
                            <p>Result: {String(results[sessionItem.conceptId].result.outcome)}</p>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {readiness && !("error" in readiness) && (
        <section>
          <h2>Readiness</h2>
          <p>Solid: {readiness.solid.length}</p>
          <p>Weak: {readiness.weak.length}</p>
          <p>Exposed: {readiness.exposed.length}</p>
          <p>Unverified: {readiness.unverified.length}</p>
          <p>Untouched: {readiness.untouched.length}</p>
          {readiness.unresolvedMisconceptions.length > 0 && (
            <p style={{ color: "#dc2626" }}>Unresolved mix-ups: {readiness.unresolvedMisconceptions.join(", ")}</p>
          )}
        </section>
      )}
    </div>
  );
}
