/**
 * Pure validation, factored out of actions.ts's sendTutorMessage for
 * the same reason course-graph-ingestion/flag-validation.ts's own
 * validator is separate -- "use server" modules may only export async
 * functions.
 *
 * Found during a hardening-pass audit: no upper bound existed on a
 * student message sent to the model -- a real cost/abuse vector (the
 * message is sent directly to a paid model call) this project's
 * comparable input validator (validateFlagReason) also doesn't
 * enforce, but this one is worth bounding given it's the highest-cost
 * unbounded input in the product.
 */
export const MAX_STUDENT_MESSAGE_LENGTH = 4000;

export function validateStudentMessage(message: string): { valid: true; trimmed: string } | { valid: false; error: string } {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "A message is required." };
  }
  if (trimmed.length > MAX_STUDENT_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message is too long (${trimmed.length} characters, max ${MAX_STUDENT_MESSAGE_LENGTH}) -- try breaking it into a shorter question.`,
    };
  }
  return { valid: true, trimmed };
}
