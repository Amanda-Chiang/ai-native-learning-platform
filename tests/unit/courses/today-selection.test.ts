import test from "node:test";
import assert from "node:assert/strict";
import { daysUntil, pickNearestExam } from "../../../src/features/courses/today-selection.ts";

const NOW = new Date("2026-09-05T00:00:00Z");

test("daysUntil counts whole days between now and a future exam date", () => {
  assert.equal(daysUntil("2026-09-09T00:00:00Z", NOW), 4);
});

test("daysUntil is negative for a date already in the past", () => {
  assert.equal(daysUntil("2026-09-01T00:00:00Z", NOW), -4);
});

test("pickNearestExam picks the smallest non-negative daysLeft, ignoring past exams", () => {
  const result = pickNearestExam([
    { courseId: "past", courseName: "Past Course", examDate: "2026-08-01", daysLeft: -30 },
    { courseId: "far", courseName: "Far Course", examDate: "2026-10-01", daysLeft: 26 },
    { courseId: "near", courseName: "Near Course", examDate: "2026-09-09", daysLeft: 4 },
  ]);
  assert.equal(result?.courseId, "near");
});

test("pickNearestExam returns null when every exam is in the past or none exist", () => {
  assert.equal(pickNearestExam([]), null);
  assert.equal(
    pickNearestExam([{ courseId: "past", courseName: "Past Course", examDate: "2026-08-01", daysLeft: -1 }]),
    null,
  );
});
