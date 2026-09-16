import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "../../src/lib/supabase/database.types.ts";

/**
 * Closes a known open gap named in docs/implementation-roadmap.md's
 * "Known open items": no test composed the full
 * extract -> reconcile -> confirm -> materialize pipeline end-to-end --
 * every stage was unit tested individually, but the composition was
 * only ever verified by manual trace/source-level assertion.
 *
 * This test drives the real mechanism at every stage:
 *  - extraction: `executeExtraction` (trigger/extract-course-graph.ts),
 *    called directly rather than through `.trigger()` -- there is still
 *    no live Trigger.dev project (same documented gap
 *    `executeGeneration`/`executeMcqGeneration` already work around),
 *    so this is the only way to exercise the real extract-reconcile-write
 *    logic deterministically. Runs a real OpenAI call against a real
 *    fixture (tests/fixtures/dummy-syllabus.pdf, a BFS/DFS excerpt) --
 *    same "a real external call can't be meaningfully faked without
 *    losing the point" reasoning `deterministic-grading`'s own E2B
 *    grader test already established.
 *  - reconciliation: exercised for free as part of the same extraction
 *    call (writeExtractionCandidates always reconciles before writing).
 *  - confirm: through the real Review Queue UI's own Confirm button
 *    (src/app/(app)/courses/[courseId]/page.tsx), not a direct DB write.
 *  - materialize: through the real Atlas UI
 *    (src/app/(app)/courses/[courseId]/atlas/page.tsx ->
 *    getCourseGraph -> materializeCourseGraph), confirming the
 *    confirmed concept actually renders as a node.
 *
 * The artifact row itself is created directly via the admin client at
 * status "ready" rather than through the real upload UI + ingest-artifact
 * task -- that hop is Phase 1's own already-tested concern
 * (tests/e2e/upload-course-material.spec.ts), and going through the real
 * Trigger.dev queue for it would hit the same no-live-worker gap this
 * test is designed to route around.
 */

const PASSWORD = "ingestion-pipeline-e2e-1234";

let admin: ReturnType<typeof createClient<Database>>;
let userId: string | null = null;
let email: string;
let courseId: string;
let unitId: string;

test.beforeAll(async () => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already loaded -- fine.
  }
  admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  email = `ingestion-pipeline-e2e-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) {
    throw new Error(`ingestion pipeline E2E setup: could not create test user: ${error?.message}`);
  }
  userId = data.user.id;

  const { data: course, error: courseError } = await admin
    .from("courses")
    .insert({ owner_id: userId, name: `Ingestion Pipeline E2E ${Date.now()}` })
    .select("id")
    .single();
  if (courseError || !course) {
    throw new Error(`ingestion pipeline E2E setup: could not create course: ${courseError?.message}`);
  }
  courseId = course.id as string;

  // A confirmed unit for the upload to hard-target (design.md's
  // target_unit_id rule) -- means every concept this extraction produces
  // attaches to an already-confirmed unit and, per shouldAutoConfirmConcept,
  // inserts straight to 'confirmed' status when its reconciliation isn't
  // "uncertain". That's deliberate: it removes the unit-confirm step from
  // this test's own critical path (already covered by
  // unit-extraction-reconciliation's own tests) so this test can focus on
  // proving the concept-level extract -> reconcile -> confirm ->
  // materialize chain, not re-prove unit review.
  const { data: unit, error: unitError } = await admin
    .from("course_units")
    .insert({ course_id: courseId, owner_id: userId, title: "Graph Traversal", status: "confirmed", extraction_run_id: null })
    .select("id")
    .single();
  if (unitError || !unit) {
    throw new Error(`ingestion pipeline E2E setup: could not create unit: ${unitError?.message}`);
  }
  unitId = unit.id as string;

  const fileBuffer = await readFile(path.join(process.cwd(), "tests/fixtures/dummy-syllabus.pdf"));
  const storagePath = `${userId}/ingestion-pipeline-e2e/dummy-syllabus.pdf`;
  const { error: uploadError } = await admin.storage.from("course-artifacts").upload(storagePath, fileBuffer, {
    contentType: "application/pdf",
  });
  if (uploadError) {
    throw new Error(`ingestion pipeline E2E setup: could not upload fixture to storage: ${uploadError.message}`);
  }
});

test.afterAll(async () => {
  if (courseId) {
    await admin.from("courses").delete().eq("id", courseId);
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("a real extraction run's candidates flow through reconciliation, review-queue confirm, and materialize into the real Atlas", async ({
  page,
}) => {
  // A real OpenAI extraction call plus a reconciliation call per
  // candidate concept (same call chain generate-assessment.ts's own
  // live-called executeGeneration makes) genuinely runs well past
  // Playwright's 30s default -- raised, not the mechanism weakened.
  test.setTimeout(120_000);

  const { data: artifact, error: artifactError } = await admin
    .from("artifacts")
    .insert({
      course_id: courseId,
      owner_id: userId!,
      storage_path: `${userId}/ingestion-pipeline-e2e/dummy-syllabus.pdf`,
      original_filename: "dummy-syllabus.pdf",
      mime_type: "application/pdf",
      size_bytes: 0,
      status: "ready",
      target_unit_id: unitId,
    })
    .select("id")
    .single();
  if (artifactError || !artifact) {
    throw new Error(`Could not create ready artifact: ${artifactError?.message}`);
  }

  const { executeExtraction } = await import("../../trigger/extract-course-graph.ts");
  const result = await executeExtraction({ artifactId: artifact.id as string, courseId });

  // The real regression guard for the "no composed test" gap: a failed
  // or skipped run here would make every assertion below meaningless
  // (they'd be checking nothing happened), so fail loudly rather than
  // let a downstream UI assertion report a confusing, indirect failure.
  expect(result).not.toHaveProperty("status", "failed");
  expect(result).not.toHaveProperty("skipped", true);
  expect((result as { conceptsExtracted?: number }).conceptsExtracted ?? 0).toBeGreaterThan(0);

  // Reconciliation ran as part of the same call above (writeExtractionCandidates
  // always reconciles before writing) -- confirmed here by checking a real
  // reconciliation_decisions row exists for a concept candidate, not just
  // trusting the extraction call's own conceptsExtracted count.
  const { data: decisions } = await admin
    .from("reconciliation_decisions")
    .select("id, decision, candidate_kind")
    .eq("course_id", courseId)
    .eq("candidate_kind", "concept");
  expect((decisions ?? []).length).toBeGreaterThan(0);

  const { data: concepts } = await admin
    .from("course_concepts")
    .select("id, canonical_name, status")
    .eq("course_id", courseId);
  const bfsConcept = (concepts ?? []).find((c) => /breadth-first|\bbfs\b/i.test(c.canonical_name as string));
  expect(bfsConcept, `expected a BFS-related concept among: ${(concepts ?? []).map((c) => c.canonical_name).join(", ")}`).toBeTruthy();

  // The unit was already confirmed and hard-targeted, so a non-"uncertain"
  // reconciliation should have inserted this concept straight to
  // 'confirmed' (shouldAutoConfirmConcept) -- but reconciliation itself is
  // a real model decision, so tolerate a genuinely "uncertain" match by
  // confirming it for real through the same UI path a reviewer would use,
  // rather than assuming the auto-confirm branch always fires.
  if (bfsConcept!.status !== "confirmed") {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/courses$/);

    await page.goto(`/courses/${courseId}`);
    await page.waitForSelector("li");
    await page
      .locator("li", { hasText: bfsConcept!.canonical_name as string })
      .getByText("Confirm", { exact: true })
      .click();
    await page.waitForTimeout(500);

    const { data: refetched } = await admin
      .from("course_concepts")
      .select("status")
      .eq("id", bfsConcept!.id)
      .single();
    expect(refetched?.status).toBe("confirmed");
  } else {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/courses$/);
  }

  // Materialize: the real Atlas route (getCourseGraph -> materializeCourseGraph)
  // must render this now-confirmed concept as a real graph node.
  await page.goto(`/courses/${courseId}/atlas`);
  await page.waitForSelector(".react-flow__node", { state: "visible" });
  // Escaped rather than passed to `new RegExp` raw: canonical_name is a
  // real, non-deterministic model output, and this project's own
  // extraction routinely produces names with regex-meaningful characters
  // (e.g. "Breadth-First Search (BFS)") -- an unescaped RegExp would
  // silently misinterpret the parentheses as a capture group instead of
  // literal text, matching nothing.
  const escapedName = (bfsConcept!.canonical_name as string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page.getByText(new RegExp(escapedName, "i"))).toBeVisible();
});
