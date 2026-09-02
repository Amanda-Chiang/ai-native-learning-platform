import test from "node:test";
import assert from "node:assert/strict";
import { computeExamStages, currentStage } from "../../../src/features/exam-planner/stage-boundaries.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-01T00:00:00Z");

test("four stages' date ranges sum to exactly the days between now and examDate", () => {
  const examDate = new Date(NOW.getTime() + 20 * MS_PER_DAY);
  const stages = computeExamStages(examDate, NOW);
  const totalDays = stages.reduce((sum, s) => sum + (s.endDate.getTime() - s.startDate.getTime()) / MS_PER_DAY, 0);
  assert.equal(totalDays, 20);
  assert.equal(stages[0].startDate.getTime(), NOW.getTime());
  assert.equal(stages[stages.length - 1].endDate.getTime(), examDate.getTime());
});

test("stages are contiguous, in order", () => {
  const examDate = new Date(NOW.getTime() + 20 * MS_PER_DAY);
  const stages = computeExamStages(examDate, NOW);
  for (let i = 1; i < stages.length; i++) {
    assert.equal(stages[i].startDate.getTime(), stages[i - 1].endDate.getTime());
  }
  assert.deepEqual(stages.map((s) => s.name), ["diagnostic", "interleaving", "timed-mixed", "final-weakness"].filter((name) => stages.some((s) => s.name === name)));
});

test("final-weakness still gets at least one day when the exam is only a few days out", () => {
  const examDate = new Date(NOW.getTime() + 2 * MS_PER_DAY);
  const stages = computeExamStages(examDate, NOW);
  const finalStage = stages.find((s) => s.name === "final-weakness");
  assert.ok(finalStage);
  const finalDays = (finalStage.endDate.getTime() - finalStage.startDate.getTime()) / MS_PER_DAY;
  assert.ok(finalDays >= 1);
  const totalDays = stages.reduce((sum, s) => sum + (s.endDate.getTime() - s.startDate.getTime()) / MS_PER_DAY, 0);
  assert.equal(totalDays, 2);
});

test("throws when examDate is not after now", () => {
  assert.throws(() => computeExamStages(NOW, NOW));
  assert.throws(() => computeExamStages(new Date(NOW.getTime() - MS_PER_DAY), NOW));
});

test("currentStage finds the stage containing now", () => {
  const examDate = new Date(NOW.getTime() + 20 * MS_PER_DAY);
  const stages = computeExamStages(examDate, NOW);
  assert.equal(currentStage(stages, NOW)?.name, "diagnostic");
  const later = new Date(NOW.getTime() + 19 * MS_PER_DAY);
  assert.equal(currentStage(stages, later)?.name, "final-weakness");
});
