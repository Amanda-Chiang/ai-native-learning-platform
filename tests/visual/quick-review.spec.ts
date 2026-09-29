import { test, expect } from "@playwright/test";

/**
 * Visual regression for the quick-review flow (Orca Phase 4), seeded
 * from the checked-in tests/fixtures/quick-review-demo.json via the
 * `?demo=1` switch -- no database, no model call.
 *
 * Mobile coverage is the point as much as desktop: Phase 3's only real
 * defect was a desktop-only layout that passed every check until its
 * mobile baseline existed, and this app's target form factor is
 * phone-shaped.
 *
 * Never approve a snapshot update blindly -- open the diff image
 * before accepting a new baseline.
 */
const DEMO_URL = "/courses/demo/study?demo=1";

test("the first question shows the progress bar, the question, and its options", async ({ page }) => {
  await page.goto(DEMO_URL);
  await page.getByText("Is this XOR truth table accurate?").waitFor({ state: "visible" });
  // Playwright's screenshot code hides the text caret by writing caret-color:transparent
  // into input/textarea/contenteditable inline styles. On slower CI runners this DOM
  // mutation can interleave with React hydration, causing a mismatch error badge to
  // appear in the captured image. These screens have no visible text caret anyway, so
  // we opt out of the hiding with caret: "initial".
  await expect(page).toHaveScreenshot("quick-review-question.png", { caret: "initial" });
});

test("skipping every question surfaces the skip confirmation, not the end screen", async ({ page }) => {
  await page.goto(DEMO_URL);
  await page.getByText("Is this XOR truth table accurate?").waitFor({ state: "visible" });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await expect(page).toHaveScreenshot("quick-review-skip-dialog.png", { caret: "initial" });
});

test("finishing anyway shows the end screen with the real skipped count and the disabled deep-review offer", async ({ page }) => {
  await page.goto(DEMO_URL);
  await page.getByText("Is this XOR truth table accurate?").waitFor({ state: "visible" });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await page.getByText("Keep going. Keep growing.").waitFor({ state: "visible" });

  // The stub names the band above the weakest concept in the fixture
  // (unverified -> exposed), and says it is not built yet.
  await expect(page.getByRole("button", { name: /Deep review to reach exposed/ })).toBeDisabled();
  await expect(page.getByText("Nothing else due today")).toBeVisible();
  await expect(page).toHaveScreenshot("quick-review-end.png", { caret: "initial" });
});
