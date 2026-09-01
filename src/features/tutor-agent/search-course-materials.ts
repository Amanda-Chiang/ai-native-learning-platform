import type { CourseConceptRow, ConceptEdgeRow, SourceAnchorJson } from "@/lib/supabase/database.types.ts";

/**
 * Pure grounding query (data-model.md "search_course_materials: the pure
 * grounding query"). Every confirmed concept/edge already carries real
 * source_anchors from course-graph-ingestion's extraction pipeline --
 * this is a plain in-memory filter over rows the caller already fetched
 * (mirrors materialize-course-graph.ts's own "pure function over rows,
 * caller does the fetch" shape), not a new retrieval/embeddings pipeline
 * (research.md).
 */

export type ConceptSearchResult = {
  kind: "concept";
  id: string;
  canonicalLabel: string;
  description: string;
  sourceAnchors: SourceAnchorJson[];
};

export type EdgeSearchResult = {
  kind: "edge";
  id: string;
  relationType: string;
  explanation: string;
  sourceAnchors: SourceAnchorJson[];
};

function matchesConcept(concept: CourseConceptRow, needle: string): boolean {
  return (
    concept.canonical_name.toLowerCase().includes(needle) ||
    concept.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
    concept.description.toLowerCase().includes(needle)
  );
}

function matchesEdge(edge: ConceptEdgeRow, needle: string): boolean {
  return edge.explanation.toLowerCase().includes(needle) || edge.relation_type.toLowerCase().includes(needle);
}

export function searchCourseMaterials(
  concepts: CourseConceptRow[],
  edges: ConceptEdgeRow[],
  courseId: string,
  query: string,
  filters?: { conceptIds?: string[] },
): { concepts: ConceptSearchResult[]; edges: EdgeSearchResult[] } {
  const needle = query.trim().toLowerCase();
  // An empty/whitespace query has no real signal to match against --
  // the honest answer is nothing found, not "everything matches."
  if (needle.length === 0) {
    return { concepts: [], edges: [] };
  }

  const matchedConcepts = concepts
    .filter((c) => c.course_id === courseId && c.status === "confirmed")
    .filter((c) => (filters?.conceptIds ? filters.conceptIds.includes(c.id) : true))
    .filter((c) => matchesConcept(c, needle))
    .map(
      (c): ConceptSearchResult => ({
        kind: "concept",
        id: c.id,
        canonicalLabel: c.canonical_name,
        description: c.description,
        sourceAnchors: c.source_anchors,
      }),
    );

  const matchedEdges = edges
    .filter((e) => e.course_id === courseId && e.status === "confirmed")
    .filter((e) => matchesEdge(e, needle))
    .map(
      (e): EdgeSearchResult => ({
        kind: "edge",
        id: e.id,
        relationType: e.relation_type,
        explanation: e.explanation,
        sourceAnchors: e.source_anchors,
      }),
    );

  return { concepts: matchedConcepts, edges: matchedEdges };
}

export type ConceptNeighborResult = {
  edgeId: string;
  neighborConceptId: string;
  relationType: string;
  explanation: string;
};

/**
 * Confirmed relationships touching one concept as either endpoint,
 * scoped to the given course -- shares this file with searchCourseMaterials
 * since both query the same confirmed course_concepts/concept_edges data
 * (data-model.md).
 */
export function getConceptNeighbors(
  edges: ConceptEdgeRow[],
  courseId: string,
  conceptId: string,
): ConceptNeighborResult[] {
  return edges
    .filter((e) => e.course_id === courseId && e.status === "confirmed")
    .filter((e) => e.source_concept_id === conceptId || e.target_concept_id === conceptId)
    .map((e) => ({
      edgeId: e.id,
      neighborConceptId: e.source_concept_id === conceptId ? e.target_concept_id : e.source_concept_id,
      relationType: e.relation_type,
      explanation: e.explanation,
    }));
}
