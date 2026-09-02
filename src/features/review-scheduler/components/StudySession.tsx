"use client";

import { useState } from "react";
import type { DailySessionResult, SessionItem } from "@/features/review-scheduler/daily-session.ts";
import type { ConnectSessionResult } from "@/features/review-scheduler/connect-session.ts";
import { StructuredAnswerForm } from "@/features/review-scheduler/components/StructuredAnswerForm.tsx";

type SubmitResult = { result: { outcome: string; [key: string]: unknown }; error: string | null };

/**
 * Daily + weekly Connect session UI (T009/T014). Text-modality items
 * are answerable via submitTextReviewAnswer; structured (graph/tree,
 * checkerDomain set) items are answerable via the generic
 * StructuredAnswerForm + submitStructuredReviewAnswer -- both route
 * through deterministic-grading's existing grading actions unchanged
 * (FR-010), no new grading path.
 */
export function StudySession({
  courseId,
  initialDaily,
  connect,
  loadMore,
  submitTextAnswer,
  submitStructuredAnswer,
}: {
  courseId: string;
  initialDaily: DailySessionResult;
  connect: ConnectSessionResult;
  loadMore: (courseId: string, excludeConceptIds: string[]) => Promise<DailySessionResult>;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
  submitStructuredAnswer: (input: { courseId: string; conceptId: string; checkerDomain: NonNullable<SessionItem["checkerDomain"]>; checkerInput: Record<string, unknown>; claimFields: Record<string, unknown> }) => Promise<SubmitResult>;
}) {
  const [daily, setDaily] = useState(initialDaily);
  const [shownConceptIds, setShownConceptIds] = useState<string[]>(
    "items" in initialDaily ? initialDaily.items.map((item) => item.conceptId) : [],
  );
  const [results, setResults] = useState<Record<string, SubmitResult>>({});
  const [pendingConceptId, setPendingConceptId] = useState<string | null>(null);

  async function handleAnswer(item: SessionItem, response: string) {
    if (response.trim().length === 0) return;
    setPendingConceptId(item.conceptId);
    const outcome = await submitTextAnswer({
      courseId,
      conceptId: item.conceptId,
      rubric: item.rubric,
      response,
    });
    setPendingConceptId(null);
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  async function handleStructuredAnswer(item: SessionItem, claimFields: Record<string, unknown>) {
    if (!item.checkerDomain || !item.checkerInput) return;
    setPendingConceptId(item.conceptId);
    const outcome = await submitStructuredAnswer({
      courseId,
      conceptId: item.conceptId,
      checkerDomain: item.checkerDomain,
      checkerInput: item.checkerInput,
      claimFields,
    });
    setPendingConceptId(null);
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  async function handleLoadMore() {
    const more = await loadMore(courseId, shownConceptIds);
    if ("items" in more) {
      setShownConceptIds((current) => [...current, ...more.items.map((item) => item.conceptId)]);
    }
    setDaily((current) => {
      if (!("items" in current) || !("items" in more)) return more;
      return { ...more, items: [...current.items, ...more.items] };
    });
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <section>
        <h2>Today&apos;s review</h2>
        {daily.status === "no_content" && <p>{daily.message}</p>}
        {(daily.status === "ok" || daily.status === "budget_too_small") && (
          <>
            {daily.status === "budget_too_small" && <p style={{ color: "#b45309" }}>{daily.message}</p>}
            <ul style={{ listStyle: "none", padding: 0 }}>
              {daily.items.map((item) => (
                <li key={item.conceptId} style={{ margin: "16px 0", padding: 12, border: "1px solid #e5e7eb" }}>
                  <p>{item.questionText}</p>
                  <ul>
                    {item.reasons.map((reason, i) => (
                      <li key={i} style={{ fontSize: 13, color: "#6b7280" }}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                  {item.checkerDomain ? (
                    <StructuredAnswerForm
                      checkerDomain={item.checkerDomain}
                      onSubmit={(claimFields) => handleStructuredAnswer(item, claimFields)}
                      pending={pendingConceptId === item.conceptId}
                    />
                  ) : item.responseModality === "text" ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const response = (new FormData(e.currentTarget).get("response") as string | null) ?? "";
                        await handleAnswer(item, response);
                      }}
                    >
                      <textarea name="response" rows={3} style={{ width: "100%" }} />
                      <button type="submit" disabled={pendingConceptId === item.conceptId}>
                        Submit
                      </button>
                    </form>
                  ) : (
                    <p style={{ fontSize: 13, color: "#6b7280" }}>
                      This question type isn&apos;t answerable here yet.
                    </p>
                  )}
                  {/* A real submitTextAnswer error (auth failure, or a
                      did_not_complete grading failure) must be shown as
                      an error, never rendered as a plausible-looking
                      grading outcome (found during a hardening-pass
                      audit -- this previously always rendered
                      result.outcome regardless of error). */}
                  {results[item.conceptId] && (
                    results[item.conceptId].error ? (
                      <p style={{ color: "#dc2626" }}>{results[item.conceptId].error}</p>
                    ) : (
                      <p>Result: {String(results[item.conceptId].result.outcome)}</p>
                    )
                  )}
                </li>
              ))}
            </ul>
            {daily.status === "ok" && daily.moreAvailable && (
              <button type="button" onClick={handleLoadMore}>
                Show more
              </button>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Connect</h2>
        <h3>New this week</h3>
        {connect.newConcepts.length === 0 ? <p>None this week.</p> : (
          <ul>
            {connect.newConcepts.map((c) => <li key={c.conceptId}>{c.conceptId}</li>)}
          </ul>
        )}
        <h3>Still-weak connections to new material</h3>
        {connect.weakConnections.length === 0 ? <p>None this week.</p> : (
          <ul>
            {connect.weakConnections.map((c) => <li key={c.edgeId}>{c.sourceConceptId} -&gt; {c.targetConceptId}</li>)}
          </ul>
        )}
        <h3>Concepts worth connecting to the rest of the course</h3>
        {connect.lowConnectivityConcepts.length === 0 ? <p>None this week.</p> : (
          <ul>
            {connect.lowConnectivityConcepts.map((c) => <li key={c.conceptId}>{c.conceptId}</li>)}
          </ul>
        )}
        <h3>Commonly confused pairs</h3>
        {connect.confusedPairs.length === 0 ? <p>None this week.</p> : (
          <ul>
            {connect.confusedPairs.map((c) => <li key={c.edgeId}>{c.conceptAId} vs {c.conceptBId}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
