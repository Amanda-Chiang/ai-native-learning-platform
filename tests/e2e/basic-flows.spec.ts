import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types.ts";

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

let admin: ReturnType<typeof createClient<Database>>;
let userId: string | null = null;
let email: string;
const createdCourseIds: string[] = [];

test.beforeAll(async () => {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Already loaded (e.g. CI sets real env vars directly) -- fine.
  }

  admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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
  // "Study" is deliberately absent here -- it's no longer a top-level nav
  // tab (course-shell.tsx), only reachable via the Review page's own
  // "Start review" button (covered by review-navigates-to-study below).
  const featurePages: [name: string, path: string, heading: string][] = [
    ["Atlas", "atlas", "Concept Atlas"],
    ["Review", "review", "Review queue"],
    ["Tutor", "tutor", "Tutor"],
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

test("Review's Start review button still reaches Study's UI, with no separate Study nav tab", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/courses$/);

  const courseName = `E2E Study Redirect Course ${Date.now()}`;
  await page.getByLabel("Course name").fill(courseName);
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]{36}$/);
  const courseId = page.url().split("/").filter(Boolean).pop()!;
  createdCourseIds.push(courseId);

  // Regression guard for the redundant-tab cleanup: the course shell's
  // own sub-nav must never render a "Study" link -- the only path in is
  // Review's "Start review" button.
  await expect(page.getByRole("navigation").getByRole("link", { name: "Study" })).toHaveCount(0);

  // DueQueue only renders "Start review" once it has at least one
  // confirmed concept (empty course = empty-state message, no button) --
  // seed one real confirmed concept + question directly via the admin
  // client so this test reaches a real, non-empty Review page.
  const { data: unit } = await admin
    .from("course_units")
    .insert({ course_id: courseId, owner_id: userId!, title: "Unit", status: "confirmed", extraction_run_id: null })
    .select("id")
    .single();
  const { data: concept } = await admin
    .from("course_concepts")
    .insert({
      course_id: courseId,
      owner_id: userId!,
      unit_id: unit!.id as string,
      canonical_name: "Test Concept",
      aliases: [],
      description: "d",
      importance_score: 0.9,
      source_anchors: [{ artifactId: "00000000-0000-0000-0000-000000000000", locator: "l", excerpt: "e" }],
      status: "confirmed",
      confidence: 0.9,
      extraction_run_id: null,
    })
    .select("id")
    .single();
  await admin.from("question_bank").insert({
    course_id: courseId,
    owner_id: userId!,
    target_concept_ids: [concept!.id as string],
    question_text: "Test question",
    response_modality: "text",
    rubric: {},
    hints: [],
    common_mistakes: [],
    source_anchors: [{ artifactId: "00000000-0000-0000-0000-000000000000", locator: "l", excerpt: "e" }],
    validation_report: {},
    checker_domain: null,
    checker_input: null,
    generation_run_id: null,
  });

  await page.goto(`/courses/${courseId}/review`);
  await page.getByRole("link", { name: "Start review" }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${courseId}/study$`));
  await expect(page.getByRole("heading", { name: "Study" })).toBeVisible();
});
