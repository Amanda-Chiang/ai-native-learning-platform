import type { NearestExam } from "./today-selection.ts";
// `DueQueueResult` is a type-only import: Node's native TS support
// erases `import type` at parse time, so it never touches module
// resolution -- the plain `node --test` runner (no `@/*` alias
// resolver) never has to walk this specifier. Relative path used
// instead of the `@/...` alias anyway, to match this module's
// alias-free convention.
import type { DueQueueResult } from "../review-scheduler/due-queue.ts";

/**
 * The identity fields a rail row needs, independent of where the
 * course came from. Kept separate from `CourseWithIsland` (the real
 * DB-backed shape from `actions.ts`) so this module stays alias-free
 * and importable by the plain `node --test` unit runner with zero
 * database dependency.
 */
export type CourseIdentity = { id: string; name: string; islandShapeIndex: number };

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
