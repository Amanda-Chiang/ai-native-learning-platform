// Alias-free, same reason as home-summary.ts: the plain `node --test`
// runner resolves no `@/*` alias. The type-only import is erased at
// parse time.
import type { CourseReviewSummary } from "./home-summary.ts";

export type NextDueCourse =
  | { kind: "found"; courseId: string; courseName: string }
  | { kind: "none" }
  | { kind: "unknown"; reason: string };

/**
 * The next course a student should review after finishing one.
 *
 * `summaries` must already be in Home's soonest-first order
 * (`orderSummaries`) -- this selects from that ordering rather than
 * deriving a second, divergent notion of "next".
 *
 * "unknown" is a real third outcome, not defensive noise: a `failed`
 * row means that course's due query errored, so claiming "nothing
 * else is due" would assert something we could not check. A course
 * found due *before* any failed row still answers the question, so
 * the scan returns as soon as it finds one.
 */
export function selectNextDueCourse(
  summaries: CourseReviewSummary[],
  excludeCourseId: string,
): NextDueCourse {
  let failure: string | null = null;

  for (const summary of summaries) {
    if (summary.courseId === excludeCourseId) continue;
    if (summary.kind === "failed") {
      failure ??= `${summary.courseName}: ${summary.reason}`;
      continue;
    }
    if (summary.kind === "scheduled" && summary.daysUntilDue <= 0) {
      return { kind: "found", courseId: summary.courseId, courseName: summary.courseName };
    }
  }

  return failure === null ? { kind: "none" } : { kind: "unknown", reason: failure };
}
