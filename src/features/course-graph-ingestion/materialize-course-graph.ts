import type { CourseGraph, Relationship, RelationshipType } from "@/types/graph/course-graph.ts";
import type { CourseConceptRow, ConceptEdgeRow, CourseUnitRow, RelationTypeDb } from "@/lib/supabase/database.types.ts";

/**
 * Confirmed canonical ontology -> renderer-neutral CourseGraph DTO
 * (data-model.md "Materialization"). Pure function -- no Supabase call
 * here, callers (actions.ts's getCourseGraph) do the confirmed-only
 * filtering and pass rows in.
 *
 * Baseline states only (Constitution Principle III / research.md): no
 * learner evidence exists at ingestion time, so masteryState is always
 * "unverified" and learnerState is always "strong" ("weak" is an earned
 * state, never a default). This function has no way to know a real
 * mastery/relationship state and does not pretend to -- Phase 3
 * (learner-graph-evidence) is what actually computes those.
 */

const DB_TO_DTO_RELATIONSHIP_TYPE: Partial<Record<RelationTypeDb, RelationshipType>> = {
  prerequisite_for: "prerequisite-of",
  part_of: "builds-on",
  mechanism_for: "applies-to",
  contrasts_with: "contrasts-with",
  generalizes_to: "analogous-to",
};

/**
 * The renderer DTO's RelationshipType (5 values, spec.md's original
 * relationship-taxonomy vocabulary) and the domain ConceptEdge's
 * RelationType (7 values + "other", PRD S10.2's extraction taxonomy)
 * were designed for two different audiences at two different times and
 * don't map one-to-one. `used_in` and `example_of` have no clean
 * equivalent in the renderer's 5-value vocabulary -- rather than
 * silently guessing the closest-sounding one (which would misrepresent
 * what was actually extracted), both those and `"other"` map to
 * "applies-to" AND get their real type preserved in the label text via
 * the concept-atlas-renderer's existing `label` field, so a viewer sees
 * the true extracted type, not a lossy reclassification pretending to
 * be more precise than it is. This mapping gap is a real, known
 * limitation -- not fixed here, since resolving it properly is a
 * renderer-taxonomy decision, not this function's job.
 */
function mapRelationType(dbType: RelationTypeDb): RelationshipType {
  return DB_TO_DTO_RELATIONSHIP_TYPE[dbType] ?? "applies-to";
}

export function materializeCourseGraph(
  units: CourseUnitRow[],
  concepts: CourseConceptRow[],
  edges: ConceptEdgeRow[],
): CourseGraph {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const conceptToUnitId = new Map<string, string>();

  for (const concept of concepts) {
    if (!unitById.has(concept.unit_id)) {
      // A confirmed concept's unit_id must resolve to a real unit --
      // unit_id is a required not-null FK (data-model.md), so a
      // dangling reference here is a genuine data-integrity gap, not a
      // legitimate "no unit yet" case (that's what an *empty* course
      // graph looks like, handled naturally below by units/concepts
      // both being empty arrays). Throwing rather than silently
      // omitting or defaulting into an arbitrary unit is the point of
      // the no-silent-placeholders rule applied here.
      throw new Error(
        `Confirmed concept "${concept.id}" references unit_id "${concept.unit_id}", which does not exist.`,
      );
    }
    conceptToUnitId.set(concept.id, concept.unit_id);
  }

  const conceptIdsByUnit = new Map<string, string[]>();
  for (const unit of units) {
    conceptIdsByUnit.set(unit.id, []);
  }
  for (const concept of concepts) {
    conceptIdsByUnit.get(concept.unit_id)!.push(concept.id);
  }

  const relationships: Relationship[] = edges.map((edge) => {
    const fromUnitId = conceptToUnitId.get(edge.source_concept_id);
    const toUnitId = conceptToUnitId.get(edge.target_concept_id);
    if (!fromUnitId || !toUnitId) {
      // A confirmed edge referencing a concept that isn't among the
      // confirmed concepts passed in is the same class of integrity gap
      // as above -- an edge should never outlive/outrank its own
      // endpoints' confirmation status (the review workflow shouldn't
      // allow confirming an edge before both its concepts), so this
      // should never fire; if it does, that's a real bug to surface,
      // not paper over.
      throw new Error(
        `Confirmed edge "${edge.id}" references a concept not present among the confirmed concepts passed in.`,
      );
    }

    return {
      id: edge.id,
      type: mapRelationType(edge.relation_type),
      fromConceptId: edge.source_concept_id,
      toConceptId: edge.target_concept_id,
      crossUnit: fromUnitId !== toUnitId,
      // Baseline, never fabricated -- see module doc comment.
      learnerState: "strong",
      explanation: edge.explanation,
    };
  });

  return {
    units: units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      conceptIds: conceptIdsByUnit.get(unit.id) ?? [],
    })),
    concepts: concepts.map((concept) => ({
      id: concept.id,
      canonicalLabel: concept.canonical_name,
      aliases: concept.aliases,
      // Baseline, never fabricated -- see module doc comment.
      masteryState: "unverified",
    })),
    relationships,
  };
}
