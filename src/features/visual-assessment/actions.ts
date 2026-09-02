"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { getOpenAiClient, isOpenAiConfigured } from "@/lib/openai/client.ts";
import { extractProblemSetup, type CheckerDomain } from "@/features/visual-assessment/problem-setup.ts";
import { extractDrawing, needsConfirmation, isImplausibleExtraction } from "@/features/visual-assessment/vision-extraction.ts";
import { mergeStructure } from "@/features/visual-assessment/merge-structure.ts";
import { gradeStructuredResponse, type GradeStructuredResponseInput } from "@/features/deterministic-grading/actions.ts";

/**
 * Server action contracts: specs/011-visual-assessment-graph-tree/contracts/visual-assessment-actions.md
 */

const MISSING_OPENAI_KEY_REASON = "OpenAI is not configured for this environment.";
const NO_COHERENT_STRUCTURE_REASON = "No coherent structure could be extracted from this drawing -- try drawing it again.";

export type SubmitDrawingResult = {
  attemptDraftId: string | null;
  claimFields: Record<string, unknown> | null;
  confidence: number | null;
  needsConfirmation: boolean;
  error: string | null;
};

/**
 * Uploads the drawing, resolves the real question's checker
 * domain/input, and extracts the answer-claim fields via the vision
 * model. Never grades -- that's submitConfirmedVisualResponse's job
 * alone (research.md "Confirmation is enforced structurally").
 */
export async function submitDrawing(
  courseId: string,
  questionBankEntryId: string,
  imageDataUrl: string,
): Promise<SubmitDrawingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { attemptDraftId: null, claimFields: null, confidence: null, needsConfirmation: false, error: "You must be signed in to submit a drawing." };
  }

  if (!isOpenAiConfigured()) {
    return { attemptDraftId: null, claimFields: null, confidence: null, needsConfirmation: false, error: MISSING_OPENAI_KEY_REASON };
  }

  const { data: entry, error: entryError } = await supabase
    .from("question_bank")
    .select("checker_domain, checker_input")
    .eq("id", questionBankEntryId)
    .single();
  if (entryError || !entry || !entry.checker_domain || !entry.checker_input) {
    return {
      attemptDraftId: null,
      claimFields: null,
      confidence: null,
      needsConfirmation: false,
      error: `Question "${questionBankEntryId}" has no checker domain -- this feature only handles graph/tree checker-domain questions.`,
    };
  }

  const problemSetup = extractProblemSetup(entry.checker_input as Record<string, unknown>);

  const attemptDraftId = crypto.randomUUID();
  const storagePath = `${user.id}/${attemptDraftId}/drawing.png`;
  const imageBytes = Buffer.from(imageDataUrl.split(",")[1] ?? "", "base64");
  const { error: uploadError } = await supabase.storage.from("assessment-drawings").upload(storagePath, imageBytes, { contentType: "image/png" });
  if (uploadError) {
    return { attemptDraftId: null, claimFields: null, confidence: null, needsConfirmation: false, error: `Could not save the drawing: ${uploadError.message}` };
  }

  const openai = getOpenAiClient();
  let extraction: { claimFields: Record<string, unknown>; confidence: number };
  try {
    extraction = await extractDrawing(openai, entry.checker_domain as CheckerDomain, imageDataUrl);
  } catch (err) {
    return {
      attemptDraftId: null,
      claimFields: null,
      confidence: null,
      needsConfirmation: false,
      error: `${NO_COHERENT_STRUCTURE_REASON} (${err instanceof Error ? err.message : String(err)})`,
    };
  }

  // A deterministic backstop independent of the model's own reported
  // confidence (research.md / vision-extraction.ts's own comment) --
  // found live: a blank image once produced an empty claimedOrder at
  // confidence 1.0, which confidence alone would have silently
  // accepted (FR-007).
  if (isImplausibleExtraction(entry.checker_domain as CheckerDomain, extraction.claimFields, problemSetup)) {
    return { attemptDraftId: null, claimFields: null, confidence: null, needsConfirmation: false, error: NO_COHERENT_STRUCTURE_REASON };
  }

  return {
    attemptDraftId,
    claimFields: extraction.claimFields,
    confidence: extraction.confidence,
    needsConfirmation: needsConfirmation(extraction.confidence),
    error: null,
  };
}

export type SubmitConfirmedVisualResponseInput = {
  courseId: string;
  questionBankEntryId: string;
  conceptIds: string[];
  edgeIds: string[];
  confirmedClaimFields: Record<string, unknown>;
  evidenceMeta: {
    evidenceType: GradeStructuredResponseInput["evidenceType"];
    assistanceLevel: number;
    difficulty: number;
    transferDistance: number;
    studentConfidence?: number;
  };
};

/**
 * The ONLY path into grading (research.md "Confirmation is enforced
 * structurally") -- always requires an explicit confirmedClaimFields
 * argument, so a low-confidence extraction can never reach
 * gradeStructuredResponse without a value the student actually saw and
 * approved (or corrected) passing back through here first.
 */
export async function submitConfirmedVisualResponse(
  input: SubmitConfirmedVisualResponseInput,
): Promise<{ result: unknown; error: string | null }> {
  const supabase = await createClient();

  const { data: entry, error: entryError } = await supabase
    .from("question_bank")
    .select("checker_domain, checker_input")
    .eq("id", input.questionBankEntryId)
    .single();
  if (entryError || !entry || !entry.checker_domain || !entry.checker_input) {
    return { result: null, error: `Question "${input.questionBankEntryId}" has no checker domain.` };
  }

  const problemSetup = extractProblemSetup(entry.checker_input as Record<string, unknown>);
  const fullCheckerInput = mergeStructure(problemSetup, input.confirmedClaimFields);

  return gradeStructuredResponse({
    courseId: input.courseId,
    conceptIds: input.conceptIds,
    edgeIds: input.edgeIds,
    domain: entry.checker_domain as GradeStructuredResponseInput["domain"],
    checkerInput: fullCheckerInput as GradeStructuredResponseInput["checkerInput"],
    evidenceType: input.evidenceMeta.evidenceType,
    assistanceLevel: input.evidenceMeta.assistanceLevel,
    difficulty: input.evidenceMeta.difficulty,
    transferDistance: input.evidenceMeta.transferDistance,
    studentConfidence: input.evidenceMeta.studentConfidence,
  });
}
