import type { ExamStage, ExamStageName } from "./stage-boundaries.ts";

export type PlanStageResult =
  | { stage: ExamStageName; startDate: string; endDate: string; items: unknown[]; contentGap: false }
  | { stage: ExamStageName; startDate: string; endDate: string; contentGap: true; message: string };

export type StagedExamPlan = {
  stages: PlanStageResult[];
  currentStageName: ExamStageName | null;
};

export type StageSelectionResult = { items: unknown[]; hasContent: boolean };

/**
 * Assembles the real stage date ranges and the real per-stage
 * selections (already computed by scoped-selection.ts) into one
 * StagedExamPlan. A stage with no real available content produces
 * contentGap: true with an honest message, never a silently-empty or
 * fabricated stage (FR-007) -- this function makes no selection
 * decisions of its own, it only reports what scoped-selection.ts
 * already found.
 */
export function composeStagedPlan(
  stages: ExamStage[],
  currentStage: ExamStage | null,
  perStageSelections: Record<ExamStageName, StageSelectionResult>,
): StagedExamPlan {
  const stageResults: PlanStageResult[] = stages.map((stage) => {
    const selection = perStageSelections[stage.name];
    if (!selection.hasContent) {
      return {
        stage: stage.name,
        startDate: stage.startDate.toISOString(),
        endDate: stage.endDate.toISOString(),
        contentGap: true,
        message: `No validated practice content is available yet for this stage's scope (${stage.name}).`,
      };
    }
    return {
      stage: stage.name,
      startDate: stage.startDate.toISOString(),
      endDate: stage.endDate.toISOString(),
      items: selection.items,
      contentGap: false,
    };
  });

  return {
    stages: stageResults,
    currentStageName: currentStage?.name ?? null,
  };
}
