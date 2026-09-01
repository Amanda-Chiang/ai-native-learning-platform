import { test, expect } from "@playwright/test";

/**
 * Visual regression for the review queue (User Story 3,
 * specs/004-course-graph-ingestion/tasks.md T030). Seeded via
 * tests/fixtures/review-queue-demo.json (the "demo" courseId special
 * case in src/app/courses/[courseId]/review/page.tsx), not a live
 * OpenAI extraction run -- same reasoning as concept-atlas-renderer's
 * fixture-driven visual tests.
 *
 * Never approve a snapshot update blindly -- open the diff image before
 * accepting a new baseline (same rule already followed throughout
 * concept-atlas-renderer).
 */

test("proposed concepts and edges render with reconciliation reasoning and flags visible", async ({
  page,
}) => {
  await page.goto("/courses/demo/review");
  await page.waitForSelector("li");

  await expect(page).toHaveScreenshot("review-queue-populated.png");
});

test("confirming a fixture-seeded (not real-database) candidate surfaces the action's own error, not a fake success", async ({
  page,
}) => {
  // The "demo" queue is a static fixture (tests/fixtures/review-queue-demo.json),
  // not real course_concepts rows -- confirmCandidate legitimately can't
  // find "concept-demo-1" server-side. This test intentionally exercises
  // that honest failure path rather than faking a successful confirm
  // for a candidate that was never really in the database (per this
  // project's no-silent-placeholders rule: a test asserting a fake
  // success would itself be exactly that kind of placeholder).
  await page.goto("/courses/demo/review");
  await page.waitForSelector("li");

  await page.getByText("Topological Sort", { exact: true }).locator("..").getByText("Confirm").click();
  await page.waitForTimeout(300);

  await expect(page.getByText(/No concept found/)).toBeVisible();
  await expect(page).toHaveScreenshot("review-queue-confirm-error.png");
});
