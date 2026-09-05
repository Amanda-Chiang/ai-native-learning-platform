"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { materializeCourseGraph } from "@/features/course-graph-ingestion/materialize-course-graph.ts";
import {
  isCourseConcept,
  isConceptEdge,
  type CourseConcept,
  type ConceptEdge,
  type CourseUnit,
} from "@/types/domain/index.ts";
import type { CourseGraph } from "@/types/graph/course-graph.ts";
import type {
  CourseConceptRow,
  ConceptEdgeRow,
  CourseUnitRow,
  ReconciliationDecisionRow,
  ConceptFlagRow,
} from "@/lib/supabase/database.types.ts";
import { validateFlagReason } from "@/features/course-graph-ingestion/flag-validation.ts";
import { sortReviewQueueByPriority } from "@/features/course-graph-ingestion/review-queue-priority.ts";

/**
 * Server action contracts: specs/004-course-graph-ingestion/contracts/ingestion-actions.md
 */

function conceptRowToDomain(row: CourseConceptRow): CourseConcept {
  return {
    id: row.id,
    courseId: row.course_id,
    unitId: row.unit_id,
    canonicalName: row.canonical_name,
    aliases: row.aliases,
    description: row.description,
    importanceScore: row.importance_score,
    sourceAnchors: row.source_anchors,
    status: row.status,
    confidence: row.confidence,
  };
}

function edgeRowToDomain(row: ConceptEdgeRow): ConceptEdge {
  return {
    id: row.id,
    sourceConceptId: row.source_concept_id,
    targetConceptId: row.target_concept_id,
    relationType: row.relation_type,
    relationTypeNote: row.relation_type_note ?? undefined,
    explanation: row.explanation,
    sourceAnchors: row.source_anchors,
    status: row.status,
    confidence: row.confidence,
  };
}

function unitRowToDomain(row: CourseUnitRow): CourseUnit {
  return { id: row.id, courseId: row.course_id, title: row.title, status: row.status };
}

/**
 * Manual "add a unit" path (design.md) -- a source-of-truth unit the
 * student declares by hand, distinct from an extraction-proposed one.
 * Confirmed immediately (no reconciliation review needed: the student
 * is the authority on their own course structure), and carries no
 * extraction_run_id since it never went through the pipeline.
 */
export async function createUnit(
  courseId: string,
  title: string,
): Promise<{ unit: CourseUnit } | { error: string }> {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return { error: "Unit title cannot be empty." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a unit." };
  }

  // Manually-created units are authoritative immediately (design.md) --
  // status 'confirmed', no extraction_run_id, same as any other
  // owner-authored row this codebase has (courses/actions.ts's
  // createCourse).
  const { data, error } = await supabase
    .from("course_units")
    .insert({ course_id: courseId, owner_id: user.id, title: trimmedTitle, status: "confirmed", extraction_run_id: null })
    .select("id, course_id, title, status")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create unit." };
  }

  return { unit: { id: data.id, courseId: data.course_id, title: data.title, status: data.status } };
}

export type ReconciliationDecision = {
  decision: "merge" | "distinct" | "uncertain";
  matchedConceptId: string | null;
  matchedUnitId: string | null;
  reasoning: string;
};

export type ConceptFlag = {
  id: string;
  reporterId: string;
  reason: string;
  createdAt: string;
};

export type ReviewQueueItem =
  | { kind: "concept"; concept: CourseConcept; reconciliation: ReconciliationDecision | null; flags: ConceptFlag[] }
  | { kind: "edge"; edge: ConceptEdge; reconciliation: ReconciliationDecision | null; flags: ConceptFlag[] }
  | {
      kind: "unit";
      unit: CourseUnit;
      reconciliation: ReconciliationDecision | null;
      /** Populated only when reconciliation.decision === "distinct" --
       * the agreed mitigation (design.md) for the residual
       * confidently-wrong-distinct risk: gives the reviewer the same
       * existing-units context reconciliation itself had, since a
       * "distinct" decision otherwise shows no comparison at all. */
      otherExistingUnitTitles: string[];
    };

function toReconciliationDecision(row: ReconciliationDecisionRow | undefined): ReconciliationDecision | null {
  if (!row) return null;
  return {
    decision: row.decision,
    matchedConceptId: row.matched_concept_id,
    matchedUnitId: row.matched_unit_id,
    reasoning: row.reasoning,
  };
}

function toConceptFlag(row: ConceptFlagRow): ConceptFlag {
  return { id: row.id, reporterId: row.reporter_id, reason: row.reason, createdAt: row.created_at };
}

export async function getReviewQueue(courseId: string): Promise<ReviewQueueItem[]> {
  const supabase = await createClient();

  // RLS-scoped, no owner_id parameter, same pattern as every other
  // server action in this codebase.
  const [conceptsRes, edgesRes, unitsRes, decisionsRes, flagsRes] = await Promise.all([
    supabase.from("course_concepts").select("*").eq("course_id", courseId).eq("status", "proposed"),
    supabase.from("concept_edges").select("*").eq("course_id", courseId).eq("status", "proposed"),
    supabase.from("course_units").select("*").eq("course_id", courseId).eq("status", "proposed"),
    supabase.from("reconciliation_decisions").select("*").eq("course_id", courseId),
    supabase.from("concept_flags").select("*").eq("course_id", courseId),
  ]);

  const concepts = conceptsRes.data ?? [];
  const edges = edgesRes.data ?? [];
  const proposedUnits = unitsRes.data ?? [];
  const decisions = decisionsRes.data ?? [];
  const flags = flagsRes.data ?? [];

  // Every already-confirmed unit's title -- used for the "distinct"
  // mitigation below, so it needs status='confirmed', a separate
  // query from the 'proposed' one above (different filter).
  const { data: confirmedUnitRows } = await supabase
    .from("course_units")
    .select("title")
    .eq("course_id", courseId)
    .eq("status", "confirmed");
  const confirmedUnitTitles = (confirmedUnitRows ?? []).map((u) => u.title);

  // reconciliation_decisions doesn't carry a direct FK to the concept it
  // evaluated (it's a record of a moment in the pipeline, not a foreign
  // key relationship to the row that resulted) -- matched by candidate
  // kind + a name/description match against the row it produced. A
  // "distinct"/"uncertain" candidate's canonical_name is unique enough
  // within one extraction_run_id for this join to be reliable; a real
  // FK would be a cleaner design, noted here rather than silently
  // assumed correct with no explanation.
  const decisionsByExtractionRun = new Map<string, ReconciliationDecisionRow[]>();
  for (const d of decisions) {
    const list = decisionsByExtractionRun.get(d.extraction_run_id) ?? [];
    list.push(d);
    decisionsByExtractionRun.set(d.extraction_run_id, list);
  }

  const flagsByTarget = new Map<string, ConceptFlagRow[]>();
  for (const f of flags) {
    const list = flagsByTarget.get(f.target_id) ?? [];
    list.push(f);
    flagsByTarget.set(f.target_id, list);
  }

  const conceptItems: ReviewQueueItem[] = concepts.map((row) => {
    const runDecisions = row.extraction_run_id ? decisionsByExtractionRun.get(row.extraction_run_id) ?? [] : [];
    const matchingDecision = runDecisions.find(
      (d) => d.candidate_kind === "concept" && d.decision !== "merge",
    );
    return {
      kind: "concept",
      concept: conceptRowToDomain(row),
      reconciliation: toReconciliationDecision(matchingDecision),
      flags: (flagsByTarget.get(row.id) ?? []).map(toConceptFlag),
    };
  });

  const edgeItems: ReviewQueueItem[] = edges.map((row) => ({
    kind: "edge",
    edge: edgeRowToDomain(row),
    reconciliation: null,
    flags: (flagsByTarget.get(row.id) ?? []).map(toConceptFlag),
  }));

  const unitItems: ReviewQueueItem[] = proposedUnits.map((row) => {
    const runDecisions = row.extraction_run_id ? decisionsByExtractionRun.get(row.extraction_run_id) ?? [] : [];
    const matchingDecision = runDecisions.find((d) => d.candidate_kind === "unit" && d.decision !== "merge");
    const reconciliation = toReconciliationDecision(matchingDecision);
    return {
      kind: "unit",
      unit: unitRowToDomain(row),
      reconciliation,
      otherExistingUnitTitles: reconciliation?.decision === "distinct" ? confirmedUnitTitles : [],
    };
  });

  return sortReviewQueueByPriority([...conceptItems, ...edgeItems, ...unitItems]);
}

const TABLE_BY_KIND = {
  concept: "course_concepts",
  edge: "concept_edges",
  unit: "course_units",
} as const;

export async function confirmCandidate(
  kind: "concept" | "edge" | "unit",
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const table = TABLE_BY_KIND[kind];

  const { data: existing, error: fetchError } = await supabase
    .from(table)
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { error: `No ${kind} found with id "${id}".` };
  }
  if (existing.status !== "proposed") {
    return { error: `This ${kind} is already "${existing.status}", not "proposed" -- nothing to confirm.` };
  }

  // course_units has no `updated_at` column (unlike course_concepts/
  // concept_edges), and `table`'s union type otherwise makes a single
  // `.update()` call across all three tables collapse to `never` for
  // any column that isn't common to every table -- branch on the
  // concrete table name so each `.update()` call gets its own,
  // correctly-typed payload.
  const { error } =
    kind === "unit"
      ? await supabase.from("course_units").update({ status: "confirmed" }).eq("id", id)
      : await supabase
          .from(kind === "concept" ? "course_concepts" : "concept_edges")
          .update({ status: "confirmed", updated_at: new Date().toISOString() })
          .eq("id", id);

  return { error: error?.message ?? null };
}

export async function rejectCandidate(
  kind: "concept" | "edge" | "unit",
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Archive, never delete (FR-007) -- preserves the extraction record.
  // Same `table`-union-collapses-to-`never` reasoning as confirmCandidate above.
  const { error } =
    kind === "unit"
      ? await supabase.from("course_units").update({ status: "archived" }).eq("id", id)
      : await supabase
          .from(kind === "concept" ? "course_concepts" : "concept_edges")
          .update({ status: "archived", updated_at: new Date().toISOString() })
          .eq("id", id);

  return { error: error?.message ?? null };
}

export type ConceptEdit = Partial<
  Pick<CourseConcept, "canonicalName" | "aliases" | "description" | "importanceScore">
>;
export type EdgeEdit = Partial<Pick<ConceptEdge, "relationType" | "relationTypeNote" | "explanation">>;
export type UnitEdit = Partial<Pick<CourseUnit, "title">>;

export async function editCandidate(
  kind: "concept",
  id: string,
  edits: ConceptEdit,
): Promise<{ error: string | null }>;
export async function editCandidate(
  kind: "edge",
  id: string,
  edits: EdgeEdit,
): Promise<{ error: string | null }>;
export async function editCandidate(
  kind: "unit",
  id: string,
  edits: UnitEdit,
): Promise<{ error: string | null }>;
export async function editCandidate(
  kind: "concept" | "edge" | "unit",
  id: string,
  edits: ConceptEdit | EdgeEdit | UnitEdit,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  if (kind === "unit") {
    const { data: existing, error: fetchError } = await supabase
      .from("course_units")
      .select("title")
      .eq("id", id)
      .single();
    if (fetchError || !existing) {
      return { error: `No unit found with id "${id}".` };
    }
    const unitEdits = edits as UnitEdit;
    const newTitle = (unitEdits.title ?? existing.title).trim();
    if (newTitle.length === 0) {
      return { error: "Unit title cannot be empty." };
    }
    const { error } = await supabase
      .from("course_units")
      .update({ title: newTitle })
      .eq("id", id);
    return { error: error?.message ?? null };
  }

  if (kind === "concept") {
    const { data: existing, error: fetchError } = await supabase
      .from("course_concepts")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError || !existing) {
      return { error: `No concept found with id "${id}".` };
    }

    const conceptEdits = edits as ConceptEdit;
    const merged = {
      ...conceptRowToDomain(existing),
      ...conceptEdits,
    };
    // Re-validated against isCourseConcept's real rules -- never allows
    // an edit that would produce an invalid record (source_anchors,
    // status, confidence are not part of ConceptEdit's type, so they
    // can't be touched here at all).
    if (!isCourseConcept(merged)) {
      return { error: "This edit would produce an invalid concept (check aliases/canonicalName rules)." };
    }

    const { error } = await supabase
      .from("course_concepts")
      .update({
        canonical_name: merged.canonicalName,
        aliases: merged.aliases,
        description: merged.description,
        importance_score: merged.importanceScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return { error: error?.message ?? null };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("concept_edges")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return { error: `No edge found with id "${id}".` };
  }

  const edgeEdits = edits as EdgeEdit;
  const merged = { ...edgeRowToDomain(existing), ...edgeEdits };
  if (!isConceptEdge(merged)) {
    return { error: "This edit would produce an invalid edge (check relationType/relationTypeNote pairing)." };
  }

  const { error } = await supabase
    .from("concept_edges")
    .update({
      relation_type: merged.relationType,
      relation_type_note: merged.relationTypeNote ?? null,
      explanation: merged.explanation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function getCourseGraph(courseId: string): Promise<CourseGraph> {
  const supabase = await createClient();

  const [unitsRes, conceptsRes, edgesRes] = await Promise.all([
    supabase.from("course_units").select("*").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("course_concepts").select("*").eq("course_id", courseId).eq("status", "confirmed"),
    supabase.from("concept_edges").select("*").eq("course_id", courseId).eq("status", "confirmed"),
  ]);

  // A course with zero confirmed units/concepts/edges is a valid, real
  // state (spec.md Edge Cases) -- (data ?? []) here means "nothing
  // confirmed yet", not "the query failed"; a real query error still
  // surfaces as an empty graph today, same as every other read-only
  // server action in this codebase (courses/actions.ts's listCourses
  // does the same). Worth revisiting if this ever needs to distinguish
  // the two, but that's a pre-existing project-wide pattern, not
  // something invented here.
  return materializeCourseGraph(unitsRes.data ?? [], conceptsRes.data ?? [], edgesRes.data ?? []);
}

export async function submitFlag(
  targetKind: "concept" | "edge",
  targetId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const validation = validateFlagReason(reason);
  if (!validation.valid) {
    return { error: validation.error };
  }
  const trimmedReason = validation.trimmed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to flag a concept or relationship." };
  }

  // concept_flags.course_id can't be supplied by the caller (it isn't
  // part of this action's public parameters, matching FR-009's "a
  // student flags a concept/relationship" -- the student doesn't need
  // to already know or supply the course id) -- looked up from the
  // target itself instead.
  const table = targetKind === "concept" ? "course_concepts" : "concept_edges";
  const { data: target, error: targetError } = await supabase
    .from(table)
    .select("course_id")
    .eq("id", targetId)
    .single();

  if (targetError || !target) {
    return { error: `No ${targetKind} found with id "${targetId}" to flag.` };
  }

  // reporter_id comes from the authenticated session only, never
  // accepted as a parameter -- same reasoning as courses/actions.ts's
  // owner_id comment. This insert never touches course_concepts/
  // concept_edges in any way (FR-010).
  const { error } = await supabase.from("concept_flags").insert({
    course_id: target.course_id,
    target_kind: targetKind,
    target_id: targetId,
    reporter_id: user.id,
    reason: trimmedReason,
  });

  return { error: error?.message ?? null };
}

/**
 * Thin wrapper around submitFlag matching concept-atlas-renderer's own
 * vocabulary ("relationship", not "edge") so it can be passed directly
 * as a Server Action reference into ConceptAtlas's onFlag prop
 * (src/app/courses/[courseId]/atlas/page.tsx) without that renderer
 * feature importing anything from course-graph-ingestion by name --
 * Constitution Principle I's renderer-neutral boundary.
 */
export async function submitConceptAtlasFlag(
  kind: "concept" | "relationship",
  id: string,
  reason: string,
): Promise<{ error: string | null }> {
  return submitFlag(kind === "concept" ? "concept" : "edge", id, reason);
}
