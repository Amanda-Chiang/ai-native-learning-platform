import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";
import { existsSync } from "node:fs";
import type { Database } from "../../src/lib/supabase/database.types.ts";

/**
 * Drives the real one-question-at-a-time quick-review flow (Orca
 * Phase 4) against a real Supabase database, real deterministic MCQ
 * grading, and real evidence commits. tests/visual/quick-review.spec.ts
 * covers rendering from a checked-in fixture (?demo=1); this spec is
 * what proves the data side actually behaves -- most importantly, that
 * answering a question commits an evidence row for its concept and
 * skipping one commits nothing for its concept. No UI check can stand
 * in for that: the assertion at the bottom queries evidence_events
 * directly.
 *
 * Same typed createClient<Database>(...) admin-client pattern as
 * tests/e2e/global-setup.ts -- the <Database> generic is mandatory
 * (an untyped client here previously let a missing not-null column
 * break global setup for the whole suite at once).
 */

const PASSWORD = "quick-review-e2e-password-1234";

let admin: ReturnType<typeof createClient<Database>>;
let userId: string;
let email: string;
let courseId: string;
let unitId: string;
let artifactId: string;
let conceptAId: string;
let conceptBId: string;
let questionBankAId: string;
let questionBankBId: string;

const QUESTION_TEXT_A = "Quick-review E2E fixture: which option names concept Alpha's correct answer?";
const QUESTION_TEXT_B = "Quick-review E2E fixture: which option names concept Beta's correct answer?";
const OPTIONS = ["Correct answer", "Wrong answer 1", "Wrong answer 2", "Wrong answer 3"];
test.beforeAll(async () => {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  email = "quick-review-e2e-" + Date.now() + "-" + Math.random().toString(36).slice(2) + "@example.com";
  const userCreate = await admin.auth.admin.createUser({
    email: email,
    password: PASSWORD,
    email_confirm: true,
  });
  assert(!userCreate.error && userCreate.data.user, "quick-review E2E setup: could not create test user: " + userCreate.error?.message);
  userId = userCreate.data.user.id;

  const courseName = "Quick Review E2E Course";
  const courseInsert = await admin.from("courses").insert({ owner_id: userId, name: courseName, island_shape_index: 0 }).select().single();
  assert(!courseInsert.error && courseInsert.data, "quick-review E2E setup: could not create course: " + courseInsert.error?.message);
  courseId = courseInsert.data.id;

  const unitTitle = "Quick Review E2E Unit";
  const unitStatus = "confirmed";
  const unitInsert = await admin.from("course_units").insert({ course_id: courseId, owner_id: userId, title: unitTitle, status: unitStatus, extraction_run_id: null }).select().single();
  assert(!unitInsert.error && unitInsert.data, "quick-review E2E setup: could not create unit: " + unitInsert.error?.message);
  unitId = unitInsert.data.id;

  const storagePath = "quick-review-e2e/fixture.txt";
  const originalFilename = "fixture.txt";
  const mimeType = "text/plain";
  const artifactStatus = "ready";
  const artifactInsert = await admin.from("artifacts").insert({ course_id: courseId, owner_id: userId, storage_path: storagePath, original_filename: originalFilename, mime_type: mimeType, size_bytes: 12, status: artifactStatus, target_unit_id: null }).select().single();
  assert(!artifactInsert.error && artifactInsert.data, "quick-review E2E setup: could not create artifact: " + artifactInsert.error?.message);
  artifactId = artifactInsert.data.id;

  const anchorLocator = "fixture.txt line 1";
  const anchorExcerpt = "Quick-review E2E fixture content.";
  const sourceAnchors = [{ artifactId: artifactId, locator: anchorLocator, excerpt: anchorExcerpt }];

  const conceptAName = "Quick Review E2E Concept Alpha";
  const conceptADesc = "Fixture concept Alpha for the quick-review E2E spec.";
  const conceptAStatus = "confirmed";
  const conceptAInsert = await admin.from("course_concepts").insert({ course_id: courseId, owner_id: userId, unit_id: unitId, canonical_name: conceptAName, aliases: [], description: conceptADesc, importance_score: 0.9, source_anchors: sourceAnchors, status: conceptAStatus, confidence: 0.9, extraction_run_id: null }).select().single();
  assert(!conceptAInsert.error && conceptAInsert.data, "quick-review E2E setup: could not create concept Alpha: " + conceptAInsert.error?.message);
  conceptAId = conceptAInsert.data.id;

  const conceptBName = "Quick Review E2E Concept Beta";
  const conceptBDesc = "Fixture concept Beta for the quick-review E2E spec.";
  const conceptBStatus = "confirmed";
  const conceptBInsert = await admin.from("course_concepts").insert({ course_id: courseId, owner_id: userId, unit_id: unitId, canonical_name: conceptBName, aliases: [], description: conceptBDesc, importance_score: 0.9, source_anchors: sourceAnchors, status: conceptBStatus, confidence: 0.9, extraction_run_id: null }).select().single();
  assert(!conceptBInsert.error && conceptBInsert.data, "quick-review E2E setup: could not create concept Beta: " + conceptBInsert.error?.message);
  conceptBId = conceptBInsert.data.id;

  const responseModality = "multiple_choice";
  const rubricA = { options: OPTIONS, correctOptionIndex: 0 };
  const questionAInsert = await admin.from("question_bank").insert({ course_id: courseId, owner_id: userId, generation_run_id: null, question_text: QUESTION_TEXT_A, rubric: rubricA, hints: [], common_mistakes: [], source_anchors: sourceAnchors, response_modality: responseModality, checker_domain: null, checker_input: null, validation_report: {}, target_concept_ids: [conceptAId] }).select().single();
  assert(!questionAInsert.error && questionAInsert.data, "quick-review E2E setup: could not create question bank row A: " + questionAInsert.error?.message);
  questionBankAId = questionAInsert.data.id;

  const rubricB = { options: OPTIONS, correctOptionIndex: 0 };
  const questionBInsert = await admin.from("question_bank").insert({ course_id: courseId, owner_id: userId, generation_run_id: null, question_text: QUESTION_TEXT_B, rubric: rubricB, hints: [], common_mistakes: [], source_anchors: sourceAnchors, response_modality: responseModality, checker_domain: null, checker_input: null, validation_report: {}, target_concept_ids: [conceptBId] }).select().single();
  assert(!questionBInsert.error && questionBInsert.data, "quick-review E2E setup: could not create question bank row B: " + questionBInsert.error?.message);
  questionBankBId = questionBInsert.data.id;
});

test.afterAll(async () => {
  if (courseId) await admin.from("evidence_events").delete().eq("course_id", courseId);
  if (questionBankAId) await admin.from("question_bank").delete().eq("id", questionBankAId);
  if (questionBankBId) await admin.from("question_bank").delete().eq("id", questionBankBId);
  if (conceptAId) await admin.from("course_concepts").delete().eq("id", conceptAId);
  if (conceptBId) await admin.from("course_concepts").delete().eq("id", conceptBId);
  if (unitId) await admin.from("course_units").delete().eq("id", unitId);
  if (artifactId) await admin.from("artifacts").delete().eq("id", artifactId);
  if (courseId) await admin.from("courses").delete().eq("id", courseId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

test("answering one question and skipping the other commits evidence for only the answered one", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  const signInLabel = "Sign in";
  const submitLabel = "Submit";
  const nextLabel = "Next";
  const skipLabel = "Skip";
  const finishLabel = "Finish";
  const previousLabel = "Previous question";
  const answerThemLabel = "Answer them";
  const finishAnywayLabel = "Finish anyway";
  const coursesUrlPattern = /\/courses$/;
  await page.getByRole("button", { name: signInLabel }).click();
  await expect(page).toHaveURL(coursesUrlPattern);

  const studyPath = "/courses/" + courseId + "/study";
  await page.goto(studyPath);

  const aFirst = await page.getByText(QUESTION_TEXT_A).isVisible();
  const firstQuestionText = aFirst ? QUESTION_TEXT_A : QUESTION_TEXT_B;
  const secondQuestionText = aFirst ? QUESTION_TEXT_B : QUESTION_TEXT_A;
  const answeredConceptId = aFirst ? conceptAId : conceptBId;
  const skippedConceptId = aFirst ? conceptBId : conceptAId;

  await expect(page.getByText(firstQuestionText)).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: submitLabel }).click();
  const resultPattern = /^Result:/;
  await expect(page.getByText(resultPattern)).toBeVisible();
  await page.getByRole("button", { name: nextLabel }).click();

  await expect(page.getByText(secondQuestionText)).toBeVisible();
  await page.getByRole("button", { name: skipLabel }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const oneSkippedText = "1 question skipped";
  await expect(dialog.getByText(oneSkippedText)).toBeVisible();
  await dialog.getByRole("button", { name: answerThemLabel }).click();

  await expect(page.getByText(secondQuestionText)).toBeVisible();
  await expect(page.getByRole("button", { name: skipLabel })).toBeVisible();

  await page.getByRole("button", { name: previousLabel }).click();
  await expect(page.getByText(firstQuestionText)).toBeVisible();
  await expect(page.getByRole("button", { name: submitLabel })).toHaveCount(0);
  await expect(page.getByText(resultPattern)).toBeVisible();

  await page.getByRole("button", { name: nextLabel }).click();
  await expect(page.getByText(secondQuestionText)).toBeVisible();
  await page.getByRole("button", { name: finishLabel }).click();
  await page.getByRole("button", { name: finishAnywayLabel }).click();

  const headlineText = "Keep going. Keep growing.";
  await expect(page.getByText(headlineText)).toBeVisible();
  const oneSkippedFooter = "1 skipped — still due for next time";
  await expect(page.getByText(oneSkippedFooter)).toBeVisible();

  const eventsQuery = await admin.from("evidence_events").select("concept_ids").eq("course_id", courseId);
  const noEventsErrorMessage = "evidence_events query failed: " + eventsQuery.error?.message;
  assert(!eventsQuery.error, noEventsErrorMessage);
  const events = eventsQuery.data ?? [];
  function conceptIdsOf(row: { concept_ids: string[] }): string[] { return row.concept_ids; }
  const touchedConceptIds = events.flatMap(conceptIdsOf);
  const answeredMissingMessage = "the answered concept must have committed evidence";
  assert(touchedConceptIds.includes(answeredConceptId), answeredMissingMessage);
  const skippedPresentMessage = "the skipped concept must have committed no evidence";
  assert(!touchedConceptIds.includes(skippedConceptId), skippedPresentMessage);
  const countMessage = "expected exactly one evidence_events row, got " + events.length;
  assert.strictEqual(events.length, 1, countMessage);
});
