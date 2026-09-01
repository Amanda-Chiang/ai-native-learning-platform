import type { ArtifactStatus } from "@/lib/supabase/database.types.ts";

export type { ArtifactStatus };

/**
 * State machine per data-model.md:
 *
 *   queued -> processing -> ready
 *                        -> failed
 *
 * ready/failed are terminal for a given artifact_processing_runs row -- a
 * retry creates a NEW row rather than transitioning out of a terminal one.
 */
const VALID_TRANSITIONS: Record<ArtifactStatus, ArtifactStatus[]> = {
  queued: ["processing"],
  processing: ["ready", "failed"],
  ready: [],
  failed: [],
};

export function isValidStatusTransition(from: ArtifactStatus, to: ArtifactStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * PRD S11.1 MVP upload types: PDF lecture slides/notes, syllabus,
 * homework PDFs, practice exams, and images/screenshots of handwritten
 * notes. Pasted text/code is a separate text-entry flow, not a file
 * upload (spec.md Assumptions) -- not included here.
 */
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/webp",
]);

// PRD S6.2 frames a "normal lecture PDF" as the baseline ingestion case;
// 25MB comfortably covers that without real usage data to size against
// yet (data-model.md's Validation rules).
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

export type UploadValidationResult = { valid: true } | { valid: false; reason: string };

export function validateUpload(mimeType: string, sizeBytes: number): UploadValidationResult {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      reason: `Unsupported file type "${mimeType}". Supported types: PDF and common image formats (PNG, JPEG, HEIC, WEBP).`,
    };
  }

  if (sizeBytes <= 0) {
    return { valid: false, reason: "The file appears to be empty." };
  }

  if (sizeBytes > MAX_SIZE_BYTES) {
    const maxMb = MAX_SIZE_BYTES / (1024 * 1024);
    return { valid: false, reason: `File is too large. Maximum size is ${maxMb}MB.` };
  }

  return { valid: true };
}
