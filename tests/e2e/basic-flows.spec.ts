import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Covers the account -> course -> feature-navigation path end to end
 * against a real (throwaway) Supabase user -- found live while
 * manually testing this session: course creation silently discarded
 * its own error/success result, and the course detail page had no
 * links to any other feature. Both are real regressions this suite
 * guards against; nothing here is faked (real sign-in, real course
 * insert, real page loads) except the tutor's own model call, which
 * this suite never triggers (visiting /tutor only starts a
 * conversation row -- sending a message is what would need the
 * TUTOR_AGENT_USE_TEST_DOUBLE-gated fixture tutor-agent.spec.ts uses).
 */

const PASSWORD = "basic-flows-e2e-password-1234";

let admin: ReturnType<typeof createClient>;
let userId: string | null = null;
let email: string;
const createdCourseIds: string[] = [];

test.beforeAll(async () => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already loaded (e.g. CI sets real env vars directly) -- fine.
  }

  admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  email = `basic-flows-e2e-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) {
    throw new Error(`basic-flows E2E setup: could not create test user: ${error?.message}`);
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

test("sign in, create a course via the real form, and reach every linked feature page", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

  const courseName = `E2E Basic Flow Course ${Date.now()}`;
  await page.getByLabel("Course name").fill(courseName);
  await page.getByRole("button", { name: "Create course" }).click();

  // Regression guard: submitting must navigate to the new course, not
  // silently stay on /courses with no feedback (the real bug found
  // live -- createCourse's {course}|{error} result was being
  // discarded entirely).
  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Course material" })).toBeVisible();

  const courseId = page.url().split("/").filter(Boolean).pop()!;
  createdCourseIds.push(courseId);

  // Regression guard: the course detail page must link to every other
  // feature (previously had none at all).
  const featurePages: [name: string, path: string, heading: string][] = [
    ["Atlas", "atlas", "Concept Atlas"],
    ["Review", "review", "Review queue"],
    ["Tutor", "tutor", "Tutor"],
    ["Study", "study", "Study"],
    ["Exam plan", "exam-plan", "Exam Plan"],
  ];

  for (const [linkName, path, heading] of featurePages) {
    const link = page.getByRole("link", { name: linkName });
    await expect(link).toHaveAttribute("href", `/courses/${courseId}/${path}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/${path}$`));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.goBack();
  }
});
