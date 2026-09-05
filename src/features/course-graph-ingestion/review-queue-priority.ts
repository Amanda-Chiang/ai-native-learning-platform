import type { ReviewQueueItem } from "./actions.ts";

/**
 * Orders the review queue by how urgently a candidate needs a
 * reviewer's attention, using signals that already exist for real
 * (never a fabricated score): flagged items first (more flags first
 * within that group), then reconciliation-"uncertain" items, then
 * everything else by ascending confidence (the extraction pipeline's
 * own least-confident guesses surface first).
 *
 * A plain sort, not a heap: this runs once per page load over a few
 * dozen items, not repeated insert/extract-max calls against a live
 * changing set -- a heap's O(log n) operations solve a problem this
 * function doesn't have (see brain/decisions/architecture-log.md).
 */

type PriorityKey = { tier: number; secondary: number };

function priorityOf(item: ReviewQueueItem): PriorityKey {
  // Units aren't flaggable (submitFlag only accepts "concept"/"edge"
  // targets), so they carry no `flags` field at all -- narrow past
  // them before touching `.flags`.
  if (item.kind !== "unit" && item.flags.length > 0) {
    // More flags => more urgent => sorts earlier. Negated so ascending
    // sort on `secondary` still puts the highest flag count first.
    return { tier: 0, secondary: -item.flags.length };
  }
  if (item.reconciliation?.decision === "uncertain") {
    return { tier: 1, secondary: 0 };
  }
  if (item.kind === "unit") {
    // course_units carries no per-row confidence score (unlike
    // concepts/edges), so there's no real signal to rank multiple
    // units against each other here -- treated the same tier as a
    // non-flagged, non-uncertain concept/edge, with a fixed secondary
    // key rather than a fabricated confidence value.
    return { tier: 2, secondary: 0 };
  }
  const confidence = item.kind === "concept" ? item.concept.confidence : item.edge.confidence;
  return { tier: 2, secondary: confidence };
}

export function sortReviewQueueByPriority(items: ReviewQueueItem[]): ReviewQueueItem[] {
  return [...items].sort((a, b) => {
    const priorityA = priorityOf(a);
    const priorityB = priorityOf(b);
    if (priorityA.tier !== priorityB.tier) {
      return priorityA.tier - priorityB.tier;
    }
    return priorityA.secondary - priorityB.secondary;
  });
}
