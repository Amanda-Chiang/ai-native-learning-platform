import test from "node:test";
import assert from "node:assert/strict";
import { selectNextDueCourse } from "../../../src/features/courses/next-due-course.ts";
import type { CourseReviewSummary } from "../../../src/features/courses/home-summary.ts";

function scheduled(id: string, daysUntilDue: number, dueNowCount: number | null): CourseReviewSummary {
  return {
    kind: "scheduled",
    courseId: id,
    courseName: `Course ${id}`,
    islandShapeIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    label: daysUntilDue <= 0 ? "Due today" : `In ${daysUntilDue} days`,
    daysUntilDue,
    dueNowCount,
  };
}

function nothingScheduled(id: string): CourseReviewSummary {
  return { kind: "nothing-scheduled", courseId: id, courseName: `Course ${id}`, islandShapeIndex: 0, createdAt: "2026-01-01T00:00:00.000Z" };
}

function failed(id: string, reason: string): CourseReviewSummary {
  return { kind: "failed", courseId: id, courseName: `Course ${id}`, islandShapeIndex: 0, createdAt: "2026-01-01T00:00:00.000Z", reason };
}

test("picks the first due course that is not the one just reviewed", () => {
  const result = selectNextDueCourse([scheduled("a", 0, 3), scheduled("b", 0, 1)], "a");
  assert.deepEqual(result, { kind: "found", courseId: "b", courseName: "Course b" });
});

test("a course due in the future is not due now", () => {
  assert.deepEqual(selectNextDueCourse([scheduled("a", 0, 2), scheduled("b", 4, null)], "a"), { kind: "none" });
});

test("an overdue course counts as due", () => {
  const result = selectNextDueCourse([scheduled("b", -2, 5)], "a");
  assert.deepEqual(result, { kind: "found", courseId: "b", courseName: "Course b" });
});

test("courses with nothing scheduled are skipped", () => {
  assert.deepEqual(selectNextDueCourse([nothingScheduled("b")], "a"), { kind: "none" });
});

test("a failed lookup yields unknown, never a confident 'nothing due'", () => {
  const result = selectNextDueCourse([nothingScheduled("b"), failed("c", "query timed out")], "a");
  assert.equal(result.kind, "unknown");
  if (result.kind === "unknown") assert.match(result.reason, /Course c/);
});

test("a due course found before a failed one still wins -- the answer is known", () => {
  const result = selectNextDueCourse([scheduled("b", 0, 1), failed("c", "query timed out")], "a");
  assert.deepEqual(result, { kind: "found", courseId: "b", courseName: "Course b" });
});
