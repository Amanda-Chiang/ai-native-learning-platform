import { test, expect } from "@playwright/test";

/**
 * Visual regression for the Home island dashboard (Phase 3's main
 * deliverable) -- the one gap the final whole-branch review flagged:
 * tests/visual/ had coverage for the Concept Atlas and the review
 * queue but nothing for "/".
 *
 * Seeded via the checked-in tests/fixtures/home-demo.json (the
 * `?demo=1` search-param special case in src/app/(app)/page.tsx --
 * same reasoning as concept-atlas-renderer's and course-graph-
 * ingestion's `courseId === "demo"` fixture routes), not a live
 * Supabase read, so this suite needs no database.
 *
 * The fixture is deliberately built to exercise every rail row kind
 * at once: a due-now row WITH a count (Algorithms, Operating Systems,
 * Machine Learning), a future row WITHOUT one (Discrete Math, Computer
 * Networks, Compilers), and a "Nothing scheduled" row (Databases,
 * Linear Algebra) -- plus a non-empty Upcoming exams section. It also
 * has enough courses (8) that the rail's own scroller overflows, so
 * this is the one check Task 8 could previously only verify through
 * the DOM: the screenshot shows the review list clipped/scrolling
 * while the exam section stays visible underneath it (HomeReviewRail's
 * `min-height: 0` flex-shrink rule).
 *
 * Run AFTER the dev-mode-indicator fix (next.config.ts's
 * `devIndicators: false`) so these baselines don't inherit that noise
 * the way three Concept Atlas ones briefly did.
 *
 * Never approve a snapshot update blindly -- open the diff image
 * before accepting a new baseline (same rule concept-atlas-renderer's
 * suite already follows).
 */

test("a populated Home shows several islands and a rail with every row kind, exams included", async ({
  page,
}) => {
  await page.goto("/?demo=1");

  // Islands are plain <a> links inside the canvas, not an async-layout
  // library like ConceptAtlas's React Flow -- wait for the rail's own
  // due-now count text instead of a fixed timeout, since that's the
  // last thing to hydrate.
  await page.getByText("5 due").waitFor({ state: "visible" });

  await expect(page).toHaveScreenshot("home-populated.png");
});
