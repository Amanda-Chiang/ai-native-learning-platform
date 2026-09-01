/**
 * Pure validation, factored out of actions.ts's submitFlag specifically
 * so it's testable without a Supabase/auth session -- "use server"
 * modules may only export async functions, so this can't live directly
 * in actions.ts alongside the server action itself.
 */
export function validateFlagReason(reason: string): { valid: true; trimmed: string } | { valid: false; error: string } {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "A reason is required to flag a concept or relationship." };
  }
  return { valid: true, trimmed };
}
