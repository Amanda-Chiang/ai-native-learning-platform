import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Provisions one real throwaway student account + a course with one
 * confirmed concept/edge pair (via the service-role client, bypassing
 * RLS the same way every prior migration's own admin scripts do), then
 * drives the real sign-in UI once to capture a real session
 * (storageState) every tutor-agent E2E test reuses -- this is the first
 * authenticated Playwright coverage in this project; every prior visual
 * suite only exercised the unauthenticated /courses/demo/atlas route.
 */

const FIXTURE_PATH = path.join(process.cwd(), "tests/e2e/.tutor-agent-fixture.json");
const STORAGE_STATE_PATH = path.join(process.cwd(), "tests/e2e/.tutor-agent-storage-state.json");
const PASSWORD = "tutor-agent-e2e-password-1234";

export default async function globalSetup() {
  // Playwright's global-setup runs as plain Node, outside Next.js's own
  // env loading -- Node 20.12+/24's built-in loadEnvFile is what
  // trigger/*.ts and scripts/*.ts already rely on implicitly via
  // Next.js; here there's no Next.js runtime to do it, so load it
  // explicitly. No new dependency (project rule) -- Node's own API.
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env.local"));
  } catch {
    // Already loaded (e.g. CI sets real env vars directly) -- fine.
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey);

  const email = `tutor-agent-e2e-${Date.now()}@example.com`;
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError || !userData.user) {
    throw new Error(`tutor-agent E2E setup: could not create test user: ${userError?.message}`);
  }
  const userId = userData.user.id;

  const { data: course, error: courseError } = await admin
    .from("courses")
    .insert({ owner_id: userId, name: "Tutor Agent E2E Course" })
    .select()
    .single();
  if (courseError || !course) {
    throw new Error(`tutor-agent E2E setup: could not create course: ${courseError?.message}`);
  }

  const { data: unit, error: unitError } = await admin
    .from("course_units")
    .insert({ course_id: course.id, owner_id: userId, title: "Graphs" })
    .select()
    .single();
  if (unitError || !unit) {
    throw new Error(`tutor-agent E2E setup: could not create unit: ${unitError?.message}`);
  }

  const sourceAnchors = [
    { artifactId: "00000000-0000-0000-0000-000000000000", locator: "slide 4", excerpt: "BFS explores nodes in increasing order of distance from the source." },
  ];

  const { data: solidConcept, error: solidConceptError } = await admin
    .from("course_concepts")
    .insert({
      course_id: course.id,
      owner_id: userId,
      unit_id: unit.id,
      canonical_name: "Breadth-First Search",
      aliases: ["BFS"],
      description: "Explores graph nodes in increasing order of distance from a source vertex.",
      importance_score: 0.9,
      source_anchors: sourceAnchors,
      status: "confirmed",
      confidence: 0.9,
    })
    .select()
    .single();
  if (solidConceptError || !solidConcept) {
    throw new Error(`tutor-agent E2E setup: could not create concept: ${solidConceptError?.message}`);
  }

  const { data: unverifiedConcept, error: unverifiedConceptError } = await admin
    .from("course_concepts")
    .insert({
      course_id: course.id,
      owner_id: userId,
      unit_id: unit.id,
      canonical_name: "Topological Sort",
      aliases: [],
      description: "Orders a directed acyclic graph's vertices so every edge points forward.",
      importance_score: 0.7,
      source_anchors: sourceAnchors,
      status: "confirmed",
      confidence: 0.9,
    })
    .select()
    .single();
  if (unverifiedConceptError || !unverifiedConcept) {
    throw new Error(`tutor-agent E2E setup: could not create second concept: ${unverifiedConceptError?.message}`);
  }

  // Seed real evidence for solidConcept (US3's calibration scenario
  // needs a real, already-recorded state to check against, not a mocked
  // one) -- getConceptState always recomputes from evidence_events
  // (learner-graph-evidence's recompute-from-log design), so a real
  // independent, correct, high-confidence event is what actually
  // produces "solid", not a directly-written learner_concept_state row
  // (that table is only ever a rebuildable cache, never read as
  // authoritative).
  //
  // Found live (basic-flows.spec.ts's first real run after
  // deterministic-grading shipped): assessment_attempt_id used to be a
  // fake placeholder UUID, fine back when 0004_learner_evidence.sql
  // left this column deliberately unconstrained -- but
  // 0006_deterministic_grading.sql later added a real FK on it, which
  // this fixture was never updated to satisfy. A real
  // assessment_attempts row is inserted first so the FK is genuinely
  // satisfied, not just silently retargeted at another placeholder.
  const { data: attempt, error: attemptError } = await admin
    .from("assessment_attempts")
    .insert({
      user_id: userId,
      course_id: course.id,
      response_modality: "text",
      question_snapshot: {},
      response: {},
      grading_result: { outcome: "correct" },
    })
    .select()
    .single();
  if (attemptError || !attempt) {
    throw new Error(`tutor-agent E2E setup: could not seed assessment attempt: ${attemptError?.message}`);
  }

  const { error: evidenceError } = await admin.from("evidence_events").insert({
    user_id: userId,
    course_id: course.id,
    concept_ids: [solidConcept.id],
    edge_ids: [],
    evidence_type: "transfer",
    correctness: true,
    grader_confidence: 0.95,
    assistance_level: 0,
    difficulty: 0.9,
    transfer_distance: 1,
    assessment_attempt_id: attempt.id,
  });
  if (evidenceError) {
    throw new Error(`tutor-agent E2E setup: could not seed evidence: ${evidenceError.message}`);
  }

  await writeFile(
    FIXTURE_PATH,
    JSON.stringify(
      {
        userId,
        email,
        courseId: course.id,
        solidConceptId: solidConcept.id,
        unverifiedConceptId: unverifiedConcept.id,
      },
      null,
      2,
    ),
  );

  // Drive the real sign-in UI once, save the resulting session so every
  // test in this suite reuses it (storageState) rather than signing in
  // per test.
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/courses/, { timeout: 15000 });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}
