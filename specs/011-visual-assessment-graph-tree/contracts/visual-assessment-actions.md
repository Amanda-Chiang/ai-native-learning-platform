# Server Action Contracts

Server actions live in `src/features/visual-assessment/actions.ts`. All
are plain `"use server"` synchronous actions -- no background task
(research.md/plan.md: one vision call plus one deterministic checker
call is bounded work).

## `submitDrawing(courseId: string, questionBankEntryId: string, imageDataUrl: string): Promise<{ attemptDraftId: string; claimFields: Record<string, unknown>; confidence: number; needsConfirmation: boolean; error: string | null }>`

- **Consumes**: the real `question_bank` entry being answered and the
  student's captured drawing (a data URI from the canvas).
- **Produces**: uploads the drawing to the `assessment-drawings`
  Storage bucket, resolves the entry's `checker_domain`/`checker_input`
  (rejecting if the entry has neither, since this feature only handles
  checker-domain graph/tree questions), calls `extractProblemSetup` +
  `extractDrawing`, and returns the extracted claim fields plus a real
  confidence value. **Never grades** -- this action's whole job is
  extraction, not correctness.
- **Never**: calls `gradeStructuredResponse` itself; fabricates a
  confidence value; silently proceeds past a genuinely unreadable
  drawing (FR-007) -- an extraction that produces no coherent
  structure at all returns a real error instead of empty/placeholder
  claim fields.

## `submitConfirmedVisualResponse(courseId: string, questionBankEntryId: string, conceptIds: string[], edgeIds: string[], confirmedClaimFields: Record<string, unknown>, drawingStoragePath: string, evidenceMeta: { evidenceType, assistanceLevel, difficulty, transferDistance, studentConfidence? }): Promise<{ result: unknown; error: string | null }>`

- **Consumes**: the student's confirmed (or corrected) claim fields --
  this is the **only** path into grading, and it always requires this
  explicit argument (research.md "Confirmation is enforced
  structurally") -- there is no server-side shortcut from a
  high-confidence `submitDrawing` result straight to grading without
  passing back through here, even though the UI may skip showing a
  confirmation screen when confidence is high (FR-005's "no
  confirmation step" case is a UI/UX shortcut, not a server-side
  grading shortcut).
- **Produces**: `mergeStructure`s the real problem setup back in, then
  calls `deterministic-grading`'s existing `gradeStructuredResponse`
  unchanged (FR-004/FR-008) -- this feature performs no correctness
  judgment and commits no evidence itself.
- **Never**: introduces a second grading or evidence-commit mechanism.
