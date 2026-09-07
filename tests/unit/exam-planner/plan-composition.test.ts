import test from "node:test";
import assert from "node:assert/strict";
import { composeStagedPlan, type StageSelectionResult } from "../../../src/features/exam-planner/plan-composition.ts";
import type { ExamStage, ExamStageName } from "../../../src/features/exam-planner/stage-boundaries.ts";

function stages(): ExamStage[] {
  return [
    { name: "diagnostic", startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-07T00:00:00Z") },
    { name: "interleaving", startDate: new Date("2026-09-07T00:00:00Z"), endDate: new Date("2026-09-13T00:00:00Z") },
    { name: "timed-mixed", startDate: new Date("2026-09-13T00:00:00Z"), endDate: new Date("2026-09-18T00:00:00Z") },
    { name: "final-weakness", startDate: new Date("2026-09-18T00:00:00Z"), endDate: new Date("2026-09-21T00:00:00Z") },
  ];
}

function fullSelections(
  overrides: Partial<Record<ExamStageName, StageSelectionResult>> = {},
): Record<ExamStageName, StageSelectionResult> {
  return {
    diagnostic: { items: [{ id: "c1" }], hasContent: true },
    interleaving: { items: [{ id: "e1" }], hasContent: true },
    "timed-mixed": { items: [{ id: "c2" }], hasContent: true },
    "final-weakness": { items: [{ id: "c3" }], hasContent: true },
    ...overrides,
  };
}

test("a stage with no available content produces contentGap: true with a real message", () => {
  const plan = composeStagedPlan(stages(), stages()[0], fullSelections({ interleaving: { items: [], hasContent: false } }));
  const interleavingResult = plan.stages.find((s) => s.stage === "interleaving")!;
  assert.equal(interleavingResult.contentGap, true);
  if (interleavingResult.contentGap) {
    assert.ok(interleavingResult.message.length > 0);
  }
});

test("a stage with real content never reports contentGap", () => {
  const plan = composeStagedPlan(stages(), stages()[0], fullSelections());
  for (const stageResult of plan.stages) {
    assert.equal(stageResult.contentGap, false);
  }
});

test("currentStageName reflects the passed-in current stage", () => {
  const plan = composeStagedPlan(stages(), stages()[2], fullSelections());
  assert.equal(plan.currentStageName, "timed-mixed");
});

test("currentStageName is null when no stage is current", () => {
  const plan = composeStagedPlan(stages(), null, fullSelections());
  assert.equal(plan.currentStageName, null);
});
