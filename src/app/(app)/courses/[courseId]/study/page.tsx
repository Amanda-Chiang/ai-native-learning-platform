import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDailyReviewSession, submitTextReviewAnswer, submitStructuredReviewAnswer, submitMultipleChoiceReviewAnswer } from "@/features/review-scheduler/actions.ts";
import { getHomeOverview } from "@/features/courses/home-overview.ts";
import { selectNextDueCourse, type NextDueCourse } from "@/features/courses/next-due-course.ts";
import { QuickReviewSession } from "@/features/review-scheduler/components/QuickReviewSession.tsx";
import type { DailySessionResult } from "@/features/review-scheduler/daily-session.ts";

/**
 * Checked-in fixture for tests/visual/quick-review.spec.ts -- the same
 * `?demo=1` switch src/app/(app)/page.tsx uses for Home, so the visual
 * suite needs no database. Values are pre-computed and committed, so
 * baselines never drift with the date the suite runs on.
 */
async function loadDemoSession(): Promise<DailySessionResult> {
  const raw = await readFile(path.join(process.cwd(), "tests/fixtures/quick-review-demo.json"), "utf-8");
  return JSON.parse(raw) as DailySessionResult;
}

/**
 * The quick-review flow (Orca Phase 4), replacing the all-items-at-once
 * list this route used to render. Home's play controls and the Review
 * page still point here -- Phase 3 linked them to this route precisely
 * so Phase 4 would change what it renders, not where anything points.
 */
async function resolveNextDueCourse(courseId: string): Promise<NextDueCourse> {
  const overview = await getHomeOverview();
  // A signed-out or unavailable overview is not "nothing else is due"
  // -- we could not check. The end screen renders those differently.
  if (overview.kind === "courses-unavailable") return { kind: "unknown", reason: overview.reason };
  if (overview.kind !== "ready") return { kind: "unknown", reason: "Not signed in" };
  return selectNextDueCourse(overview.courses, courseId);
}

export default async function CourseStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { courseId } = await params;
  const { demo } = await searchParams;
  const isDemo = demo === "1";

  const [daily, nextDueCourse] = isDemo
    ? ([await loadDemoSession(), { kind: "none" } as NextDueCourse] as const)
    : await Promise.all([getDailyReviewSession(courseId), resolveNextDueCourse(courseId)]);

  return (
    <>
      {daily.status === "budget_too_small" && <p style={{ margin: "16px 40px 0", fontSize: 13.5, color: "var(--status-warning)" }}>{daily.message}</p>}
      <QuickReviewSession
        courseId={courseId}
        daily={daily}
        nextDueCourse={nextDueCourse}
        submitTextAnswer={submitTextReviewAnswer}
        submitStructuredAnswer={submitStructuredReviewAnswer}
        submitMultipleChoiceAnswer={submitMultipleChoiceReviewAnswer}
      />
    </>
  );
}
