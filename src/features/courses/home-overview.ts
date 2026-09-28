import { createClient } from "@/lib/supabase/server.ts";
import { listCoursesResult, type CourseWithIsland } from "@/features/courses/actions.ts";
import { getDueQueueResult } from "@/features/review-scheduler/due-queue.ts";
import { listExamConfigs } from "@/features/exam-planner/actions.ts";
import { sortUpcomingExams, daysUntil } from "@/features/courses/today-selection.ts";
import { summarizeCourseDue, orderSummaries, type ExamSection, type HomeOverview } from "@/features/courses/home-summary.ts";

/**
 * Everything the Home dashboard renders.
 *
 * Reads each course's due queue once. That is one query batch per
 * course, which is the right trade for a student's handful of courses
 * and reuses the ranking and bucketing that getDueQueue already has
 * unit-tested, rather than deriving a second copy of either.
 *
 * This module is the impure half of the split: `summarizeCourseDue`
 * and `orderSummaries` (the pure rules, unit-tested without a
 * database) live in `home-summary.ts`, which has zero `@/...`-aliased
 * imports. This file is free to use normal static `@/...` imports for
 * `listCoursesResult`, `getDueQueueResult`, and `listExamConfigs`
 * because the unit test never loads it -- it imports `home-summary.ts`
 * directly -- so the `@/*` alias (resolved by Next's bundler and by
 * `tsc`, not by the plain `node --test` runner this project's unit
 * suite uses) is never in the test's path.
 */
export async function getHomeOverview(): Promise<HomeOverview> {
  // Checked first and separately from `listCoursesResult`: RLS alone
  // would make a signed-out visitor's query come back as zero rows,
  // indistinguishable from a signed-in student who genuinely has no
  // courses yet. Those are different states (home-summary.ts's
  // `HomeOverview` doc comment) and only an explicit session check can
  // tell them apart.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { kind: "signed-out" };
  }

  const coursesResult = await listCoursesResult();
  if (!coursesResult.ok) {
    return { kind: "courses-unavailable", reason: coursesResult.reason };
  }
  const courses: CourseWithIsland[] = coursesResult.courses;

  const summaries = await Promise.all(
    courses.map(async (course) => summarizeCourseDue(course, await getDueQueueResult(course.id))),
  );

  return {
    kind: "ready",
    courses: orderSummaries(summaries),
    exams: await loadExamSection(courses),
  };
}

async function loadExamSection(courses: CourseWithIsland[]): Promise<ExamSection> {
  try {
    const now = new Date();
    const configured = (
      await Promise.all(
        courses.map(async (course) =>
          (await listExamConfigs(course.id)).map((config) => ({
            courseId: course.id,
            courseName: course.name,
            examConfigId: config.id,
            examDate: config.examDate,
            daysLeft: daysUntil(config.examDate, now),
          })),
        ),
      )
    ).flat();

    // sortUpcomingExams (today-selection.ts) owns the filter-to-future
    // and sort-by-daysLeft rule -- pickNearestExam is defined in terms
    // of the same function, so there is exactly one place that rule
    // lives, not a copy per caller.
    return { kind: "ok", upcoming: sortUpcomingExams(configured).slice(0, 3) };
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
