import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

/**
 * Covers uploading real course material through the real UI --
 * found live (a real first-ever authenticated upload): RLS blocked
 * every upload with "new row violates row-level security policy for
 * table \"artifact_processing_runs\"", because that table had a
 * select policy but no insert policy for the real signed-in student
 * who actually creates that row (0011_artifact_processing_runs_insert_policy.sql).
 * This test is the regression guard for that fix.
 *
 * Uses a real PDF (tests/fixtures/dummy-syllabus.pdf, a short DSA-unit
 * excerpt) since the upload input's own accept attribute is scoped to
 * pdf/image types -- a plain .txt wouldn't reflect real usage.
 */

const PASSWORD = "upload-e2e-password-1234";

let admin: ReturnType<typeof createClient>;
let userId: string | null = null;
let email: string;
const createdCourseIds: string[] = [];

test.beforeAll(async () => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already loaded -- fine.
  }
  admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  email = `upload-e2e-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) {
    throw new Error(`upload E2E setup: could not create test user: ${error?.message}`);
  }
  userId = data.user.id;
});

test.afterAll(async () => {
  for (const courseId of createdCourseIds) {
    await admin.from("courses").delete().eq("id", courseId);
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("uploading a real course syllabus succeeds, with no RLS error, and appears queued", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/courses$/);

  const courseName = `E2E Upload Course ${Date.now()}`;
  await page.getByLabel("Course name").fill(courseName);
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
  createdCourseIds.push(page.url().split("/").filter(Boolean).pop()!);

  await page.setInputFiles('input[type="file"]', path.join(process.cwd(), "tests/fixtures/dummy-syllabus.pdf"));
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  // The real regression guard: this must never show the RLS error
  // found live ("new row violates row-level security policy for
  // table \"artifact_processing_runs\"") or any other upload error.
  // Next.js's own built-in route announcer also uses role="alert" (to
  // read page titles to screen readers on navigation) -- found live
  // while writing this test, so the real regression guard checks for
  // the specific known error text, not "any role=alert at all".
  await expect(page.getByText(/row-level security|violates|Failed to record upload/)).toHaveCount(0);
  await expect(page.getByText("dummy-syllabus.pdf")).toBeVisible();
  await expect(page.getByText(/Queued|Processing…|Ready/)).toBeVisible();

  // Best-effort, not a hard requirement: if a real Trigger.dev worker
  // is connected and running, real extraction may complete within this
  // window and the status will move to "Processing…" or "Ready" via
  // the page's own Realtime subscription -- logged for visibility,
  // never failing the test if it doesn't (a worker not being connected
  // right now is a real, separate, already-documented environment
  // condition, not what this test exists to guard).
  try {
    await expect(page.getByText(/Processing…|Ready/)).toBeVisible({ timeout: 15_000 });
    console.log("Artifact progressed past 'Queued' -- a real Trigger.dev worker is processing it.");
  } catch {
    console.log("Artifact still 'Queued' after 15s -- no live Trigger.dev worker connected right now (expected if `npx trigger.dev dev` isn't running).");
  }
});
