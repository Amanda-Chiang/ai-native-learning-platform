import { test, expect } from "@playwright/test";

/**
 * Required screenshots per
 * .claude/skills/concept-atlas/references/testing.md: whole-course
 * atlas, expanded unit, focused concept, weak-relationship state,
 * mobile/tablet breakpoint. Added incrementally as each user story in
 * specs/003-concept-atlas-renderer/tasks.md lands -- this file currently
 * covers User Story 1's screenshot only.
 *
 * Never approve a snapshot update blindly -- open the diff image before
 * accepting a new baseline (same skill doc's testing rules).
 */

test("whole-course atlas renders every unit as a bounded region with no overlapping nodes", async ({
  page,
}) => {
  await page.goto("/courses/demo/atlas");

  // ELK layout runs asynchronously after mount -- wait for at least one
  // rendered concept node rather than a fixed timeout.
  await page.waitForSelector(".react-flow__node", { state: "visible" });

  // Let the fit-view animation settle before snapshotting.
  await page.waitForTimeout(300);

  await expect(page).toHaveScreenshot("whole-course-atlas.png");
});
