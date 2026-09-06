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

/**
 * Units sort ahead of concepts, unconditionally and ahead of every
 * urgency signal below: a concept cannot be confirmed while its parent
 * unit is still 'proposed' (confirmCandidate refuses -- see actions.ts),
 * so a queue that showed concepts first would walk the reviewer straight
 * into a block. This is an ordering *constraint* of the workflow, not an
 * urgency heuristic, which is why it's a separate, higher-precedence key
 * rather than folded into the tiers below.
 */
function kindTierOf(item: ReviewQueueItem): number {
  return item.kind === "unit" ? 0 : 1;
}

function priorityOf(item: ReviewQueueItem): PriorityKey {
  // Units aren't flaggable (submitFlag only accepts "concept"/"edge"
  // targets -- an edge can still be flagged even though it no longer
  // goes through manual review itself), so units carry no `flags` field
  // at all -- narrow past them before touching `.flags`.
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
  return { tier: 2, secondary: item.concept.confidence };
}

export function sortReviewQueueByPriority(items: ReviewQueueItem[]): ReviewQueueItem[] {
  return [...items].sort((a, b) => {
    const kindTierA = kindTierOf(a);
    const kindTierB = kindTierOf(b);
    if (kindTierA !== kindTierB) {
      return kindTierA - kindTierB;
    }
    const priorityA = priorityOf(a);
    const priorityB = priorityOf(b);
    if (priorityA.tier !== priorityB.tier) {
      return priorityA.tier - priorityB.tier;
    }
    return priorityA.secondary - priorityB.secondary;
  });
}
