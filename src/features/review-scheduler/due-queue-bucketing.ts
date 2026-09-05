export type UrgencyBucket = "overdue" | "today" | "soon" | "upcoming";

/**
 * Bucket cutoffs are a judgment call, not derived from anything else in
 * the codebase (there's no existing "urgency bucket" concept upstream --
 * only a raw next-review date). Overdue: past due already. Today: due
 * today or tomorrow (a 1-day early warning). Soon: within the next 3
 * days. Upcoming: everything else that's still ranked.
 */
export function bucketFor(daysUntilDue: number): { bucket: UrgencyBucket; label: string } {
  if (daysUntilDue < 0) return { bucket: "overdue", label: "Overdue" };
  if (daysUntilDue <= 1) return { bucket: "today", label: daysUntilDue === 0 ? "Due today" : "Due tomorrow" };
  if (daysUntilDue <= 3) return { bucket: "soon", label: `In ${daysUntilDue} days` };
  return { bucket: "upcoming", label: `In ${daysUntilDue} days` };
}
