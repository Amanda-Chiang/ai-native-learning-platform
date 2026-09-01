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

test("collapsing units shows progressive disclosure: collapsed units shrink, siblings stay expanded", async ({
  page,
}) => {
  await page.goto("/courses/demo/atlas");
  await page.waitForSelector(".react-flow__node", { state: "visible" });
  await page.waitForTimeout(300);

  // Collapse two of the five units by clicking their header text (spec
  // FR-006: collapsing one unit must not force siblings open/closed).
  // "Sorting & Searching" and "Trees" chosen specifically because no
  // edge in this layout routes through their header regions -- "Dynamic
  // Programming"'s header has a prerequisite-of edge crossing directly
  // through it, which is a real, narrow edge-hitbox-vs-header collision
  // worth knowing about (interactionWidth + zIndex fixes above reduced
  // but didn't eliminate it for that specific coincidental routing) but
  // isn't the thing this test is verifying.
  await page.getByText("Sorting & Searching", { exact: true }).click();
  await page.getByText("Trees", { exact: true }).click();
  await page.waitForTimeout(300);

  await expect(page).toHaveScreenshot("expanded-unit.png");
});

test("clicking a concept opens a stable detail panel and dims unrelated content", async ({
  page,
}) => {
  await page.goto("/courses/demo/atlas");
  await page.waitForSelector(".react-flow__node", { state: "visible" });
  await page.waitForTimeout(300);

  // "Big-O Notation" has no cross-unit edge running through it in this
  // layout (spec.md Edge Cases: a real, not just Playwright-convenient,
  // choice -- see the "Dynamic Programming" collision documented above).
  await page.getByText("Big-O Notation", { exact: true }).click();
  await page.waitForTimeout(300);

  await expect(page).toHaveScreenshot("focused-concept.png");
});
