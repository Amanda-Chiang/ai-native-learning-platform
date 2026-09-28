import test from "node:test";
import assert from "node:assert/strict";
import { daysUntil, pickNearestExam, sortUpcomingExams } from "../../../src/features/courses/today-selection.ts";

const NOW = new Date("2026-09-05T00:00:00Z");

test("daysUntil counts whole days between now and a future exam date", () => {
  assert.equal(daysUntil("2026-09-09T00:00:00Z", NOW), 4);
});

test("daysUntil is negative for a date already in the past", () => {
  assert.equal(daysUntil("2026-09-01T00:00:00Z", NOW), -4);
});

test("pickNearestExam picks the smallest non-negative daysLeft, ignoring past exams", () => {
  const result = pickNearestExam([
    { courseId: "past", courseName: "Past Course", examConfigId: "exam-past", examDate: "2026-08-01", daysLeft: -30 },
    { courseId: "far", courseName: "Far Course", examConfigId: "exam-far", examDate: "2026-10-01", daysLeft: 26 },
    { courseId: "near", courseName: "Near Course", examConfigId: "exam-near", examDate: "2026-09-09", daysLeft: 4 },
  ]);
  assert.equal(result?.courseId, "near");
});

test("pickNearestExam returns null when every exam is in the past or none exist", () => {
  assert.equal(pickNearestExam([]), null);
  assert.equal(
    pickNearestExam([
      { courseId: "past", courseName: "Past Course", examConfigId: "exam-past", examDate: "2026-08-01", daysLeft: -1 },
    ]),
    null,
  );
});

test("pickNearestExam picks the nearer of two exams from the SAME course (multiple exams per course)", () => {
  const result = pickNearestExam([
    { courseId: "course-1", courseName: "Course One", examConfigId: "exam-a", examDate: "2026-12-01", daysLeft: 87 },
    { courseId: "course-1", courseName: "Course One", examConfigId: "exam-b", examDate: "2026-09-09", daysLeft: 4 },
  ]);
  assert.equal(result?.examConfigId, "exam-b");
});

test("sortUpcomingExams excludes past exams", () => {
  const result = sortUpcomingExams([
    { courseId: "past", courseName: "Past Course", examConfigId: "exam-past", examDate: "2026-08-01", daysLeft: -30 },
    { courseId: "near", courseName: "Near Course", examConfigId: "exam-near", examDate: "2026-09-09", daysLeft: 4 },
  ]);
  assert.deepEqual(
    result.map((e) => e.courseId),
    ["near"],
  );
});

test("sortUpcomingExams orders soonest first", () => {
  const result = sortUpcomingExams([
    { courseId: "far", courseName: "Far Course", examConfigId: "exam-far", examDate: "2026-10-01", daysLeft: 26 },
    { courseId: "near", courseName: "Near Course", examConfigId: "exam-near", examDate: "2026-09-09", daysLeft: 4 },
    { courseId: "mid", courseName: "Mid Course", examConfigId: "exam-mid", examDate: "2026-09-20", daysLeft: 15 },
  ]);
  assert.deepEqual(
    result.map((e) => e.courseId),
    ["near", "mid", "far"],
  );
});

test("pickNearestExam agrees with sortUpcomingExams's first element", () => {
  const exams = [
    { courseId: "past", courseName: "Past Course", examConfigId: "exam-past", examDate: "2026-08-01", daysLeft: -30 },
    { courseId: "far", courseName: "Far Course", examConfigId: "exam-far", examDate: "2026-10-01", daysLeft: 26 },
    { courseId: "near", courseName: "Near Course", examConfigId: "exam-near", examDate: "2026-09-09", daysLeft: 4 },
  ];
  assert.equal(pickNearestExam(exams), sortUpcomingExams(exams)[0]);
});
