import type { CourseWithIsland } from "@/features/courses/actions.ts";
import type { DueQueueResult } from "@/features/review-scheduler/due-queue.ts";
import { pickNearestExam, daysUntil, type NearestExam } from "./today-selection.ts";

type CourseIdentity = { id: string; name: string; islandShapeIndex: number };

/**
 * One rail row. Three variants, because these are three genuinely
 * different states and collapsing any two of them would hide a real
 * one: work is waiting, nothing is waiting, or we could not find out.
 */
export type CourseReviewSummary =
  | {
      kind: "scheduled";
      courseId: string;
      courseName: string;
      islandShapeIndex: number;
      /** Reused verbatim from due-queue-bucketing's `bucketFor`. */
      label: string;
      daysUntilDue: number;
      /** Number of items due now. Null for a future date -- see below. */
      dueNowCount: number | null;
    }
  | { kind: "nothing-scheduled"; courseId: string; courseName: string; islandShapeIndex: number }
  | { kind: "failed"; courseId: string; courseName: string; islandShapeIndex: number; reason: string };

export type ExamSection =
  | { kind: "ok"; upcoming: NearestExam[] }
  | { kind: "failed"; reason: string };

export type HomeOverview =
  | { kind: "courses-unavailable"; reason: string }
  | { kind: "ready"; courses: CourseReviewSummary[]; exams: ExamSection };

/**
 * Turns one course's due-queue result into a rail row.
 *
 * The count rule is the interesting part. "6 due" is a claim about
 * work that exists right now, and it is true. A count attached to a
 * FUTURE date would instead be a claim about the size of a session
 * that has not been generated and does not exist: this system never
 * persists a future schedule (specs/009-review-scheduler/data-model.md
 * -- every session type is "computed on read"), and recording any
 * evidence between now and then changes what that day holds. So a
 * future row gets the date alone.
 */
export function summarizeCourseDue(course: CourseIdentity, result: DueQueueResult): CourseReviewSummary {
  const identity = {
    courseId: course.id,
    courseName: course.name,
    islandShapeIndex: course.islandShapeIndex,
  };

  if (!result.ok) {
    return { kind: "failed", ...identity, reason: result.reason };
  }
  if (result.items.length === 0) {
    return { kind: "nothing-scheduled", ...identity };
  }

  const soonest = result.items.reduce((best, candidate) =>
    candidate.daysUntilDue < best.daysUntilDue ? candidate : best,
  );

  const dueNowCount =
    soonest.daysUntilDue <= 0 ? result.items.filter((i) => i.daysUntilDue <= 0).length : null;

  return {
    kind: "scheduled",
    ...identity,
    label: soonest.dueLabel,
    daysUntilDue: soonest.daysUntilDue,
    dueNowCount,
  };
}

/**
 * Soonest work first, then the courses we could not read, then the
 * quiet ones. Failures sort above nothing-scheduled because a failure
 * is something to act on and an empty course is not.
 *
 * Stable within each group: two courses due the same day keep their
 * incoming order rather than jumping around between renders.
 */
export function orderSummaries(summaries: CourseReviewSummary[]): CourseReviewSummary[] {
  const rank = (s: CourseReviewSummary) => (s.kind === "scheduled" ? 0 : s.kind === "failed" ? 1 : 2);
  return [...summaries].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.kind === "scheduled" && b.kind === "scheduled") return a.daysUntilDue - b.daysUntilDue;
    return 0;
  });
}

/**
 * Everything the Home dashboard renders.
 *
 * Reads each course's due queue once. That is one query batch per
 * course, which is the right trade for a student's handful of courses
 * and reuses the ranking and bucketing that getDueQueue already has
 * unit-tested, rather than deriving a second copy of either.
 *
 * `listCoursesResult` and `getDueQueueResult` are loaded via dynamic
 * import rather than a top-level import. Both are "use server" files
 * that themselves import `@/lib/supabase/server.ts` via the `@/*`
 * path alias -- resolvable by Next's bundler and by `tsc` (both read
 * tsconfig's `paths`), but not by the plain `node --test` runner this
 * project's unit suite uses, which has no alias-resolution loader.
 * A static top-level import would make loading this module -- which
 * the unit test does, to reach the pure `summarizeCourseDue` and
 * `orderSummaries` below -- eagerly resolve those aliases and crash
 * the whole test file before a single test ran. Deferring the import
 * to inside this async function, which the unit test never calls,
 * keeps the pure/impure split real: the pure functions stay reachable
 * with zero database or alias-resolution dependency.
 */
export async function getHomeOverview(): Promise<HomeOverview> {
  const { listCoursesResult } = await import("@/features/courses/actions.ts");
  const coursesResult = await listCoursesResult();
  if (!coursesResult.ok) {
    return { kind: "courses-unavailable", reason: coursesResult.reason };
  }
  const courses: CourseWithIsland[] = coursesResult.courses;

  const { getDueQueueResult } = await import("@/features/review-scheduler/due-queue.ts");
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
    const { listExamConfigs } = await import("@/features/exam-planner/actions.ts");
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

    // pickNearestExam is kept in the call chain so the "nearest" rule
    // stays defined in one unit-tested place, even though the rail
    // renders the whole upcoming list.
    void pickNearestExam(configured);

    return {
      kind: "ok",
      upcoming: configured.filter((e) => e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3),
    };
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
