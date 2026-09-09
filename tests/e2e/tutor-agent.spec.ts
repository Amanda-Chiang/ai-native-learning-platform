import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { computeLearnerState } from "../../src/features/learner-graph-evidence/compute-learner-state.ts";
import { DEFAULT_EVIDENCE_WEIGHTS } from "../../src/features/learner-graph-evidence/evidence-weights.ts";
import type { EvidenceEvent } from "../../src/types/domain/evidence-event.ts";
import type { EvidenceEventRow } from "../../src/lib/supabase/database.types.ts";

/**
 * Uses a scripted test-double tutor response, never a live OpenAI call
 * (plan.md's Testing section, wired via TUTOR_AGENT_USE_TEST_DOUBLE in
 * playwright.config.ts) -- exercises the real conversation/tool-execution
 * code path against real (test) Supabase data, with only the model's own
 * text generation faked (test-double-openai-client.ts).
 */

type Fixture = { userId: string; courseId: string; solidConceptId: string; unverifiedConceptId: string };

async function loadFixture(): Promise<Fixture> {
  const raw = await readFile(path.join(process.cwd(), "tests/e2e/.tutor-agent-fixture.json"), "utf-8");
  return JSON.parse(raw) as Fixture;
}

function eventRowToDomain(row: EvidenceEventRow): EvidenceEvent {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    conceptIds: row.concept_ids,
    edgeIds: row.edge_ids,
    evidenceType: row.evidence_type,
    correctness: row.correctness,
    graderConfidence: row.grader_confidence,
    assistanceLevel: row.assistance_level,
    difficulty: row.difficulty,
    transferDistance: row.transfer_distance,
    studentConfidence: row.student_confidence ?? undefined,
    sourceArtifactId: row.source_artifact_id ?? undefined,
    assessmentAttemptId: row.assessment_attempt_id ?? undefined,
    conversationTurnId: row.conversation_turn_id ?? undefined,
    createdAt: row.created_at,
  };
}

test("a question covered by confirmed course material produces a grounded, sourced answer", async ({ page }) => {
  const fixture = await loadFixture();
  await page.goto(`/courses/${fixture.courseId}/tutor`);

  // "just explain" reaches the full grounded answer directly (US2's
  // escape hatch, verified separately below) -- otherwise US2's ladder
  // correctly paces even a first-ever question with a diagnostic prompt
  // rather than a full answer, which this test isn't about. Uses
  // "Topological Sort" specifically because "Breadth-First Search" has a
  // real seeded "solid" state (the separate calibration test below) that
  // would otherwise short-circuit this response.
  await page.getByPlaceholder("Ask a question…").fill("just explain topological sort");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/Topological Sort: Orders a directed/)).toBeVisible({ timeout: 10000 });
});

test("a question the course material doesn't cover produces an honest 'not covered' response", async ({ page }) => {
  const fixture = await loadFixture();
  await page.goto(`/courses/${fixture.courseId}/tutor`);

  await page.getByPlaceholder("Ask a question…").fill("explain quantum entanglement");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("The course material doesn't cover that yet.")).toBeVisible({ timeout: 10000 });
});

test("asking about a concept opens with a diagnostic prompt, not a full explanation", async ({ page }) => {
  const fixture = await loadFixture();
  await page.goto(`/courses/${fixture.courseId}/tutor`);

  await page.getByPlaceholder("Ask a question…").fill("explain topological sort");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/try recalling or predicting the answer yourself first/)).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText(/Topological Sort: Orders a directed/)).not.toBeVisible();
});

test("explicitly asking for the direct answer produces one immediately, regardless of ladder position", async ({
  page,
}) => {
  const fixture = await loadFixture();
  await page.goto(`/courses/${fixture.courseId}/tutor`);

  await page.getByPlaceholder("Ask a question…").fill("just give me the answer about topological sort");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/Topological Sort: Orders a directed/)).toBeVisible({ timeout: 10000 });
});

test("a concept with real recorded 'solid' state is acknowledged, not re-taught from scratch", async ({ page }) => {
  const fixture = await loadFixture();
  await page.goto(`/courses/${fixture.courseId}/tutor`);

  // "Breadth-First Search" has a real learner_concept_state row seeded
  // at "solid" by global-setup.ts -- this exercises get_concept_state
  // returning that real state, not a mocked one.
  await page.getByPlaceholder("Ask a question…").fill("explain breadth-first search");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/already shown solid understanding/)).toBeVisible({ timeout: 10000 });
});

test("independent correct retrieval and repeated confident wrong answers become real, traceable evidence", async ({
  page,
}) => {
  const fixture = await loadFixture();
  await page.goto(`/courses/${fixture.courseId}/tutor`);

  // "Topological Sort" (unverifiedConceptId) -- avoids the seeded
  // "solid" state on Breadth-First Search, which would short-circuit
  // before any evidence-recording tool call happens.
  await page
    .getByPlaceholder("Ask a question…")
    .fill("just explain topological sort -- i got it right");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Topological Sort: Orders a directed/)).toBeVisible({ timeout: 10000 });

  // A real, found-in-CI race: TutorChat.tsx's textarea is disabled for
  // the exact duration of the awaited sendMessage() call, which itself
  // awaits every pendingEvidenceCommits write (actions.ts) before
  // resolving -- so waiting for it to re-enable is an exact, deterministic
  // signal the evidence commit (not just a visible response) has really
  // landed, unlike a fixed sleep. A fixed 500ms here previously raced
  // CI's slower/more-loaded runner: the query below could run before
  // evidence for the 2nd or 3rd send had actually committed, undercounting
  // real rows and non-deterministically failing whichever assertion ran
  // next. Not waiting for specific response text (unlike the first send
  // above) because these two exact wordings depend on the assistance-
  // ladder step reached, which isn't fixed across the conversation.
  const questionInput = page.getByPlaceholder("Ask a question…");
  await questionInput.fill("explain topological sort -- wrong answer");
  await page.getByRole("button", { name: "Send" }).click();
  // Wait for disabled first -- otherwise toBeEnabled() below could pass
  // trivially in the instant before the click handler's setPending(true)
  // has actually applied, defeating the whole point of this wait.
  await expect(questionInput).toBeDisabled();
  await expect(questionInput).toBeEnabled();

  await questionInput.fill("explain topological sort -- wrong answer");
  await page.getByRole("button", { name: "Send" }).click();
  // Wait for disabled first -- otherwise toBeEnabled() below could pass
  // trivially in the instant before the click handler's setPending(true)
  // has actually applied, defeating the whole point of this wait.
  await expect(questionInput).toBeDisabled();
  await expect(questionInput).toBeEnabled();

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: rows } = await admin
    .from("evidence_events")
    .select("*")
    .eq("user_id", fixture.userId)
    .contains("concept_ids", [fixture.unverifiedConceptId]);

  expect(rows).toBeTruthy();
  expect(rows!.length).toBeGreaterThanOrEqual(3);
  // Every one of these evidence_events rows is traceable to a real
  // conversation turn, not left null (FR-015).
  for (const row of rows!) {
    expect(row.conversation_turn_id).toBeTruthy();
  }

  const events = rows!.map(eventRowToDomain);
  const state = computeLearnerState(events, new Date(), DEFAULT_EVIDENCE_WEIGHTS, "concept");
  expect(state.hasUnresolvedMisconception).toBe(true);
});

test("a question unrelated to the course is declined as off-topic", async ({ page }) => {
  const fixture = await loadFixture();
  await page.goto(`/courses/${fixture.courseId}/tutor`);

  await page.getByPlaceholder("Ask a question…").fill("what's the weather like today");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/outside this course/)).toBeVisible({ timeout: 10000 });
});
