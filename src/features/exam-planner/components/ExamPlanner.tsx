"use client";

import { useState } from "react";
import type { ExamConfigView, GetExamPlanResult, GetExamReadinessResult, ScopeableConcept } from "@/features/exam-planner/actions.ts";
import type { SessionItem } from "@/features/review-scheduler/daily-session.ts";
import { StructuredAnswerForm } from "@/features/review-scheduler/components/StructuredAnswerForm.tsx";
import { ConceptScopeSelect } from "@/features/exam-planner/components/ConceptScopeSelect.tsx";
import { IconCheck } from "@/components/icons.tsx";

type SubmitResult = { result: { outcome: string; [key: string]: unknown }; error: string | null };

/** Same fix as StudySession.tsx's isPassedOutcome -- outcome === "correct"
 * alone mislabels a passing code-sandbox submission ("graded" + allPassed)
 * as a failure. */
function isPassedOutcome(result: SubmitResult["result"]): boolean {
  if (result.outcome === "correct") return true;
  if (result.outcome === "graded") return result.allPassed === true;
  return false;
}

/**
 * Exam configuration + staged plan + readiness UI (T012/T016). Text-
 * modality plan items reuse review-scheduler's existing
 * submitTextReviewAnswer directly (FR-012); structured (graph/tree,
 * checkerDomain set) items reuse review-scheduler's
 * StructuredAnswerForm + submitStructuredReviewAnswer the same way --
 * this feature adds no grading action of its own either way.
 */
export function ExamPlanner({
  courseId,
  examConfigs,
  selectedExamConfigId,
  initialPlan,
  initialReadiness,
  scopeableConcepts,
  configureExam,
  updateExamConfig,
  deleteExamConfig,
  loadExamPlanAndReadiness,
  submitTextAnswer,
  submitStructuredAnswer,
}: {
  courseId: string;
  examConfigs: ExamConfigView[];
  selectedExamConfigId: string | null;
  initialPlan: GetExamPlanResult | null;
  initialReadiness: GetExamReadinessResult | null;
  scopeableConcepts: ScopeableConcept[];
  configureExam: (courseId: string, examDate: string, scopeConceptIds: string[], scopeUnitIds: string[]) => Promise<{ examConfigId: string | null; error: string | null }>;
  updateExamConfig: (examConfigId: string, examDate: string, scopeConceptIds: string[], scopeUnitIds: string[]) => Promise<{ error: string | null }>;
  deleteExamConfig: (examConfigId: string) => Promise<{ error: string | null }>;
  loadExamPlanAndReadiness: (examConfigId: string) => Promise<{ plan: GetExamPlanResult; readiness: GetExamReadinessResult }>;
  submitTextAnswer: (input: { courseId: string; conceptId: string; rubric: Record<string, unknown>; response: string }) => Promise<SubmitResult>;
  submitStructuredAnswer: (input: { courseId: string; conceptId: string; checkerDomain: NonNullable<SessionItem["checkerDomain"]>; checkerInput: Record<string, unknown>; claimFields: Record<string, unknown> }) => Promise<SubmitResult>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(selectedExamConfigId);
  const [plan, setPlan] = useState(initialPlan);
  const [readiness, setReadiness] = useState(initialReadiness);
  // "add" is the initial mode only when there's nothing to show in the
  // dropdown yet -- same "form shown immediately" behavior the old
  // single-exam page had for a course's very first exam.
  const [mode, setMode] = useState<"view" | "add" | "edit">(examConfigs.length === 0 ? "add" : "view");
  const [configError, setConfigError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SubmitResult>>({});
  const [switching, setSwitching] = useState(false);

  const selectedConfig = examConfigs.find((c) => c.id === selectedId) ?? null;

  async function handleSelectExam(examConfigId: string) {
    setSelectedId(examConfigId);
    setMode("view");
    setConfigError(null);
    setSwitching(true);
    // Keep the URL in sync with the in-memory selection. Every mutation
    // handler below finishes with a full navigation/reload, and the page
    // re-resolves its selection from `?exam=` -- without this, switching
    // the dropdown and then editing/deleting would reload into whatever
    // the URL still said (often the default pick), not the exam the
    // student was actually looking at. replaceState (not pushState) so
    // the dropdown doesn't accumulate Back-button history entries.
    window.history.replaceState(null, "", `${window.location.pathname}?exam=${examConfigId}`);
    try {
      const outcome = await loadExamPlanAndReadiness(examConfigId);
      setPlan(outcome.plan);
      setReadiness(outcome.readiness);
    } catch {
      // Never leave the previous exam's plan on screen with no
      // indication it's stale -- an unlabelled stale plan is exactly the
      // "plausible-looking stand-in for a value that couldn't be
      // computed" this project forbids.
      setConfigError("Could not load that exam's plan. Try again.");
    } finally {
      setSwitching(false);
    }
  }

  async function handleAdd(formData: FormData) {
    const examDate = (formData.get("examDate") as string | null) ?? "";
    const scopeConceptIds = formData.getAll("scopeConceptIds") as string[];
    if (scopeConceptIds.length === 0) {
      setConfigError("Select at least one concept to scope the exam to.");
      return;
    }
    const outcome = await configureExam(courseId, examDate, scopeConceptIds, []);
    if (outcome.error) {
      setConfigError(outcome.error);
      return;
    }
    if (!outcome.examConfigId) {
      // Saved, but we can't select it -- say so instead of reloading into
      // some other exam and letting it look like nothing happened.
      setConfigError("The exam was saved but the server didn't return its id, so it can't be selected automatically. Reload the page to see it.");
      return;
    }
    setConfigError(null);
    // Land on the exam that was just created, not on whatever the URL
    // happened to say (a bare reload would re-run the default pick or
    // re-resolve a stale `?exam=`, so a brand-new exam would silently
    // not be the one shown).
    window.location.href = `${window.location.pathname}?exam=${outcome.examConfigId}`;
  }

  async function handleEdit(formData: FormData) {
    if (!selectedConfig) return;
    const examDate = (formData.get("examDate") as string | null) ?? "";
    const scopeConceptIds = formData.getAll("scopeConceptIds") as string[];
    if (scopeConceptIds.length === 0) {
      setConfigError("Select at least one concept to scope the exam to.");
      return;
    }
    // scopeUnitIds is passed through unchanged (the form has no unit-
    // scope UI, same as create) rather than hardcoded to [] -- editing
    // must never silently wipe a scope dimension the form doesn't let
    // the student touch.
    const outcome = await updateExamConfig(selectedConfig.id, examDate, scopeConceptIds, selectedConfig.scopeUnitIds);
    if (outcome.error) {
      setConfigError(outcome.error);
      return;
    }
    setConfigError(null);
    // Explicitly re-select the edited exam rather than a bare reload.
    // The URL usually already carries this id (handleSelectExam syncs
    // it), but not always: an exam that was the page's own DEFAULT pick
    // never went through handleSelectExam, so the URL may have no
    // `?exam=` at all -- and since an edit can change the exam *date*,
    // the default pick after reload may well be a different exam than
    // the one just edited.
    window.location.href = `${window.location.pathname}?exam=${selectedConfig.id}`;
  }

  async function handleDelete() {
    if (!selectedConfig) return;
    const confirmed = window.confirm(
      `Delete the exam dated ${new Date(selectedConfig.examDate).toLocaleDateString()}? This can't be undone.`,
    );
    if (!confirmed) return;
    const outcome = await deleteExamConfig(selectedConfig.id);
    if (outcome.error) {
      setConfigError(outcome.error);
      return;
    }
    // Strip `?exam=` -- it now points at a deleted row. Dropping it lets
    // the page's default-pick logic run fresh instead of re-resolving a
    // dangling id.
    window.location.href = window.location.pathname;
  }

  async function handleAnswer(item: SessionItem, response: string) {
    if (response.trim().length === 0) return;
    const outcome = await submitTextAnswer({ courseId, conceptId: item.conceptId, rubric: item.rubric, response });
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  async function handleStructuredAnswer(item: SessionItem, claimFields: Record<string, unknown>) {
    if (!item.checkerDomain || !item.checkerInput) return;
    const outcome = await submitStructuredAnswer({
      courseId,
      conceptId: item.conceptId,
      checkerDomain: item.checkerDomain,
      checkerInput: item.checkerInput,
      claimFields,
    });
    setResults((current) => ({ ...current, [item.conceptId]: outcome }));
  }

  // Derived display metric, not a stored field -- same "documented
  // judgment call" convention as due-queue.ts's urgency-bucket cutoffs.
  // "Solid" concepts out of every scoped concept the readiness snapshot
  // knows about.
  const readinessTotal =
    readiness && !("error" in readiness)
      ? readiness.solid.length + readiness.weak.length + readiness.exposed.length + readiness.unverified.length + readiness.untouched.length
      : 0;
  const readinessValue =
    readiness && !("error" in readiness) && readinessTotal > 0 ? readiness.solid.length / readinessTotal : 0;

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <h1 style={s.pageTitle}>Exam Plan</h1>
        <section style={s.section}>
          <span style={s.sectionLabel}>Exam configuration</span>

          {examConfigs.length > 0 && mode === "view" && (
            <div style={s.configRow}>
              <select
                value={selectedId ?? ""}
                onChange={(e) => handleSelectExam(e.target.value)}
                disabled={switching}
                style={s.select}
              >
                {examConfigs.map((c) => {
                  const isPast = new Date(c.examDate).getTime() <= Date.now();
                  return (
                    <option key={c.id} value={c.id}>
                      {new Date(c.examDate).toLocaleDateString()}
                      {isPast ? " (past)" : ""}
                    </option>
                  );
                })}
              </select>
              <button type="button" onClick={() => setMode("add")} style={s.secondaryButton}>
                + Add exam
              </button>
              {selectedConfig && (
                <>
                  <button type="button" onClick={() => setMode("edit")} style={s.secondaryButton}>
                    Edit
                  </button>
                  <button type="button" onClick={handleDelete} style={s.dangerButton}>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}

          {(mode === "add" || mode === "edit") && (
            <form
              action={async (formData) => {
                if (mode === "add") await handleAdd(formData);
                else await handleEdit(formData);
              }}
              style={s.configForm}
            >
              <label style={s.field}>
                <span style={s.fieldLabel}>Exam date</span>
                <input
                  type="date"
                  name="examDate"
                  required
                  defaultValue={mode === "edit" ? selectedConfig?.examDate : undefined}
                  style={s.input}
                />
              </label>
              <label style={s.field}>
                <span style={s.fieldLabel}>Scope concepts</span>
                {/* Keyed on mode+selected exam so React remounts this
                    (and re-runs its useState initializer) every time a
                    genuinely different form target opens -- avoids a
                    stale-selection bug if this ever gets a direct
                    add<->edit toggle that skips the "view" state this
                    version always passes through between them. */}
                <ConceptScopeSelect
                  key={`${mode}-${selectedConfig?.id ?? "new"}`}
                  name="scopeConceptIds"
                  concepts={scopeableConcepts}
                  initialSelectedIds={mode === "edit" ? (selectedConfig?.scopeConceptIds ?? []) : []}
                />
              </label>
              <div style={s.formActions}>
                <button type="submit" style={s.primaryButton}>
                  {mode === "add" ? "Configure exam" : "Save changes"}
                </button>
                {examConfigs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("view");
                      setConfigError(null);
                    }}
                    style={s.secondaryButton}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}

          {configError && <p style={s.errorText}>{configError}</p>}
        </section>

        {plan && "error" in plan && (
          <p style={s.notice}>
            {plan.error === "no_exam_configured" && "Configure an exam above to see your staged plan."}
            {plan.error === "exam_date_passed" && "This exam's date has already passed."}
          </p>
        )}

        {readiness && !("error" in readiness) && readinessTotal > 0 && (
          <div style={g.wrap}>
            <div style={g.label}>
              <span style={g.labelText}>Exam readiness</span>
              <span style={{ ...g.labelPct, color: gaugeColor(readinessValue) }}>{Math.round(readinessValue * 100)}%</span>
            </div>
            <div style={g.track}>
              <div style={{ ...g.fill, width: `${readinessValue * 100}%`, background: gaugeColor(readinessValue) }} />
            </div>
            <span style={{ ...g.status, color: gaugeColor(readinessValue) }}>{gaugeLabel(readinessValue)}</span>
            {readiness.unresolvedMisconceptions.length > 0 && (
              <p style={s.errorText}>Unresolved mix-ups: {readiness.unresolvedMisconceptions.join(", ")}</p>
            )}
          </div>
        )}

        {plan && !("error" in plan) && (
          <section style={s.section}>
            <span style={s.sectionLabel}>Staged plan</span>
            <div style={s.sessionList}>
              {plan.stages.map((stage) => {
                const isCurrent = stage.stage === plan.currentStageName;
                return (
                  <div key={stage.stage} style={{ ...s.stageCard, ...(isCurrent ? s.stageCardActive : {}) }}>
                    <div style={s.stageHeader}>
                      <span style={{ ...s.stageType, ...(isCurrent ? s.stageTypeActive : {}) }}>{stage.stage}</span>
                      <span style={s.stageDates}>
                        {new Date(stage.startDate).toLocaleDateString()} – {new Date(stage.endDate).toLocaleDateString()}
                      </span>
                    </div>

                    {stage.contentGap ? (
                      <p style={s.notice}>{stage.message}</p>
                    ) : (
                      <div style={s.stageItems}>
                        {stage.items.map((item, i) => {
                          const sessionItem = item as SessionItem & {
                            sourceConceptId?: string;
                            targetConceptId?: string;
                            edgeId?: string;
                          };
                          if (sessionItem.edgeId) {
                            return (
                              <p key={sessionItem.edgeId} style={s.connectionItem}>
                                Connection to review: {sessionItem.sourceConceptId} → {sessionItem.targetConceptId}
                              </p>
                            );
                          }
                          const outcome = results[sessionItem.conceptId];
                          const passed = outcome && !outcome.error && isPassedOutcome(outcome.result);
                          return (
                            <div key={i} style={s.stageQuestionCard}>
                              <p style={s.stageQuestionText}>{sessionItem.questionText}</p>
                              {!outcome &&
                                (sessionItem.checkerDomain ? (
                                  <StructuredAnswerForm
                                    checkerDomain={sessionItem.checkerDomain}
                                    onSubmit={(claimFields) => handleStructuredAnswer(sessionItem, claimFields)}
                                    pending={false}
                                  />
                                ) : sessionItem.responseModality === "text" ? (
                                  <form
                                    onSubmit={async (e) => {
                                      e.preventDefault();
                                      const response = (new FormData(e.currentTarget).get("response") as string | null) ?? "";
                                      await handleAnswer(sessionItem, response);
                                    }}
                                    style={s.answerForm}
                                  >
                                    <textarea name="response" rows={3} style={s.textarea} />
                                    <button type="submit" style={s.primaryButton}>
                                      Submit
                                    </button>
                                  </form>
                                ) : (
                                  <p style={s.notice}>This question type isn&apos;t answerable here yet.</p>
                                ))}
                              {/* A real error must be shown as an error, never
                                  rendered as a plausible-looking grading
                                  outcome (same hardening-pass finding as
                                  review-scheduler's StudySession.tsx). */}
                              {outcome &&
                                (outcome.error ? (
                                  <p style={s.errorText}>{outcome.error}</p>
                                ) : (
                                  <div
                                    style={{
                                      ...s.verdict,
                                      background: passed ? "var(--status-success-muted)" : "var(--status-danger-muted)",
                                      borderColor: passed ? "var(--status-success-border)" : "var(--status-danger-border)",
                                    }}
                                  >
                                    <span style={{ ...s.verdictIcon, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
                                      {passed ? <IconCheck /> : "✕"}
                                    </span>
                                    <span style={{ ...s.verdictText, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
                                      Result: {String(outcome.result.outcome)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function gaugeColor(value: number) {
  return value >= 0.7 ? "var(--status-success)" : value >= 0.5 ? "var(--accent-secondary)" : "var(--status-danger)";
}
function gaugeLabel(value: number) {
  return value >= 0.7 ? "On track" : value >= 0.5 ? "Needs work" : "At risk";
}

const g: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8, padding: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" },
  label: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  labelText: { fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, letterSpacing: "-0.01em" },
  labelPct: { fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600 },
  track: { height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  status: { fontSize: 12.5, fontWeight: 500, letterSpacing: "-0.005em" },
};

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", overflowY: "auto", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center" },
  inner: { width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 24 },
  section: { display: "flex", flexDirection: "column", gap: 12 },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--text-primary)" },
  sectionLabel: { fontSize: 10.5, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)" },
  configRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  select: {
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    background: "var(--surface)",
  },
  secondaryButton: {
    padding: "8px 14px",
    background: "var(--surface)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  dangerButton: {
    padding: "8px 14px",
    background: "var(--surface)",
    color: "var(--status-danger)",
    border: "1px solid var(--status-danger-border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  formActions: { display: "flex", gap: 8 },
  configForm: { display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  fieldLabel: { fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 },
  input: { padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13.5, fontFamily: "var(--font-sans)" },
  primaryButton: {
    alignSelf: "flex-start",
    padding: "9px 16px",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  },
  errorText: { margin: 0, fontSize: 12.5, color: "var(--status-danger)" },
  notice: { margin: 0, fontSize: 13.5, color: "var(--text-tertiary)" },
  sessionList: { display: "flex", flexDirection: "column", gap: 10 },
  stageCard: { padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 10 },
  stageCardActive: { border: "1px solid var(--accent)" },
  stageHeader: { display: "flex", alignItems: "center", gap: 10 },
  stageType: {
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    background: "var(--surface-hover)",
    padding: "2px 9px",
    borderRadius: 20,
    border: "1px solid var(--border)",
  },
  stageTypeActive: { color: "var(--accent)", background: "var(--accent-muted)", border: "1px solid var(--accent-border)" },
  stageDates: { fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" },
  stageItems: { display: "flex", flexDirection: "column", gap: 10 },
  connectionItem: { margin: 0, fontSize: 13, color: "var(--text-secondary)" },
  stageQuestionCard: { display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "var(--surface-hover)", borderRadius: "var(--radius-sm)" },
  stageQuestionText: { margin: 0, fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.55 },
  answerForm: { display: "flex", flexDirection: "column", gap: 8 },
  textarea: { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13.5, fontFamily: "var(--font-sans)", resize: "vertical", boxSizing: "border-box" },
  verdict: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid" },
  verdictIcon: { display: "flex", flexShrink: 0 },
  verdictText: { fontSize: 13, fontWeight: 500 },
};
