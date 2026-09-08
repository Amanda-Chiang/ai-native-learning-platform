import { test, expect } from "@playwright/test";

/**
 * Visual regression for the review queue (User Story 3,
 * specs/004-course-graph-ingestion/tasks.md T030). Seeded via
 * tests/fixtures/review-queue-demo.json (the "demo" courseId special
 * case in src/app/(app)/courses/[courseId]/page.tsx -- the review queue
 * lives on the Material page's popup, not a /review sub-route; that
 * route is review-scheduler's unrelated DueQueue), not a live OpenAI
 * extraction run -- same reasoning as concept-atlas-renderer's
 * fixture-driven visual tests.
 *
 * 2026-09-07: this spec had two compounding, pre-existing bugs, found
 * while investigating why it never actually exercised this component --
 * it navigated to the wrong route (review-scheduler's DueQueue), and
 * even the right route had no demo-fixture branch at all. Both fixed
 * (route above, branch in page.tsx). The review queue's own list surface
 * was separately removed this session (duplicate-DOM-id Edit/Save bug) --
 * the popup is now the only surface, but each candidate still renders as
 * an <li> inside it, so waitForSelector("li") below still correctly
 * finds it. Both fixture items share one extractionRunId (fixed at the
 * same time) so the popup shows both at once, matching what this test
 * asserts.
 *
 * Never approve a snapshot update blindly -- open the diff image before
 * accepting a new baseline (same rule already followed throughout
 * concept-atlas-renderer).
 */

test("proposed concepts and edges render with reconciliation reasoning and flags visible", async ({
  page,
}) => {
  await page.goto("/courses/demo");
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
  await page.goto("/courses/demo");
  await page.waitForSelector("li");

  // The card's title and its Confirm/Edit/Reject buttons are siblings
  // under the same <li>, not nested inside each other -- locator("..")
  // (one level up from the title) lands on the title's own wrapper div,
  // which never contains the action buttons. Scope to the whole <li>
  // card instead.
  await page.locator("li", { hasText: "Topological Sort" }).getByText("Confirm").click();
  await page.waitForTimeout(300);

  await expect(page.getByText(/No concept found/)).toBeVisible();
  await expect(page).toHaveScreenshot("review-queue-confirm-error.png");
});
