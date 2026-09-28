export type ConceptMasteryState = "unverified" | "exposed" | "weak" | "solid";

export type ConceptPathConcept = {
  id: string;
  name: string;
  unitId: string | null;
  masteryState: ConceptMasteryState;
};

export type ConceptPathUnit = { id: string; title: string };

export type ConceptPathSection = {
  unitId: string | null;
  title: string;
  concepts: ConceptPathConcept[];
};

/** Label for concepts with no unit, or whose unit no longer exists. */
export const UNASSIGNED_SECTION_TITLE = "Unassigned";

/**
 * Groups a course's concepts under their unit headers, units in the
 * order given (listUnits already orders by created_at).
 *
 * Two rules worth stating because they're easy to get wrong:
 *
 * 1. A concept whose `unitId` is null -- or points at a unit that isn't
 *    in `units` (archived or deleted since extraction) -- goes into an
 *    explicit "Unassigned" section. It is never dropped and never
 *    folded into an unrelated unit: a concept vanishing from this
 *    screen because of a stale foreign key would be exactly the kind of
 *    silent, plausible-looking gap CLAUDE.md forbids.
 * 2. Units with no concepts are omitted rather than rendered empty --
 *    an empty header communicates nothing, and a freshly-created course
 *    has many of them.
 */
export function groupConceptsByUnit(
  concepts: ConceptPathConcept[],
  units: ConceptPathUnit[],
): ConceptPathSection[] {
  const knownUnitIds = new Set(units.map((u) => u.id));
  const byUnit = new Map<string | null, ConceptPathConcept[]>();

  for (const concept of concepts) {
    const key = concept.unitId !== null && knownUnitIds.has(concept.unitId) ? concept.unitId : null;
    const list = byUnit.get(key) ?? [];
    list.push(concept);
    byUnit.set(key, list);
  }

  const sections: ConceptPathSection[] = [];
  for (const unit of units) {
    const unitConcepts = byUnit.get(unit.id);
    if (!unitConcepts || unitConcepts.length === 0) continue;
    sections.push({ unitId: unit.id, title: unit.title, concepts: unitConcepts });
  }

  const unassigned = byUnit.get(null);
  if (unassigned && unassigned.length > 0) {
    sections.push({ unitId: null, title: UNASSIGNED_SECTION_TITLE, concepts: unassigned });
  }

  return sections;
}
