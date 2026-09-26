import test from "node:test";
import assert from "node:assert/strict";
import { pickDefaultExamConfig } from "../../../src/features/exam-planner/default-exam-selection.ts";

const NOW = new Date("2026-09-26T12:00:00Z");

function config(id: string, examDate: string) {
  return { id, courseId: "course-1", examDate, scopeConceptIds: [], scopeUnitIds: [] };
}

test("picks the nearest upcoming exam when one or more are upcoming", () => {
  const result = pickDefaultExamConfig(
    [config("far", "2026-12-01"), config("near", "2026-10-01"), config("past", "2026-01-01")],
    NOW,
  );
  assert.equal(result?.id, "near");
});

test("falls back to the most recent past exam when none are upcoming", () => {
  const result = pickDefaultExamConfig([config("older", "2026-01-01"), config("recent", "2026-08-01")], NOW);
  assert.equal(result?.id, "recent");
});

test("returns null when there are no exams at all", () => {
  assert.equal(pickDefaultExamConfig([], NOW), null);
});

test("an exam dated exactly now counts as past, not upcoming (matches getExamPlan's own passed-check boundary)", () => {
  const result = pickDefaultExamConfig([config("today", NOW.toISOString())], NOW);
  assert.equal(result?.id, "today");
  // Confirmed via the "falls back to past" path, not the upcoming one --
  // a second, later-dated exam should win if one exists, since "today"
  // is not upcoming:
  const withLater = pickDefaultExamConfig(
    [config("today", NOW.toISOString()), config("later", "2026-12-01")],
    NOW,
  );
  assert.equal(withLater?.id, "later");
});
