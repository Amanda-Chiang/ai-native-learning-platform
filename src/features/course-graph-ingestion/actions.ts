"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { materializeCourseGraph } from "@/features/course-graph-ingestion/materialize-course-graph.ts";
import {
  isCourseConcept,
  type CourseConcept,
  type CourseUnit,
} from "@/types/domain/index.ts";
import type { CourseGraph } from "@/types/graph/course-graph.ts";
import type {
  CourseConceptRow,
  CourseUnitRow,
  ReconciliationDecisionRow,
  ConceptFlagRow,
} from "@/lib/supabase/database.types.ts";
import { validateFlagReason } from "@/features/course-graph-ingestion/flag-validation.ts";
import { sortReviewQueueByPriority } from "@/features/course-graph-ingestion/review-queue-priority.ts";
import { resolveOtherEndpoint, shouldAutoConfirmEdge, selectSweepableEdgeIds } from "./edge-auto-confirm.ts";
import { shouldAutoConfirmConcept } from "./concept-auto-confirm.ts";
import { indexDecisionsByCandidateId } from "./reconciliation-decision-match.ts";

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

function unitRowToDomain(row: CourseUnitRow): CourseUnit {
  return { id: row.id, courseId: row.course_id, title: row.title, status: row.status };
}

/**
 * Non-archived units for a course, used both to refresh the "Add a
 * unit" list and to populate the upload-time unit picker (design.md's
 * target_unit_id hard rule) -- excludes archived units since those are
 * no longer valid upload targets.
 */
export async function listUnits(courseId: string): Promise<CourseUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_units")
    .select("id, course_id, title, status")
    .eq("course_id", courseId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, courseId: row.course_id, title: row.title, status: row.status }));
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

  // Duplicate-title check (design.md's add-unit-form error table). On a
  // feature whose whole purpose is duplicate-unit avoidance, silently
  // accepting a second "Graphs" would undercut the reconciliation the
  // extraction side spends an OpenAI call per candidate on. Compared
  // case-insensitively on the trimmed title, and against archived units
  // too -- re-adding a title the owner previously rejected should be an
  // explicit act (rename or un-archive), not a silent second row.
  const { data: siblingUnits, error: siblingError } = await supabase
    .from("course_units")
    .select("title")
    .eq("course_id", courseId);

  if (siblingError) {
    return { error: `Could not check this course's existing units: ${siblingError.message}` };
  }
  const duplicate = (siblingUnits ?? []).find(
    (u) => u.title.trim().toLowerCase() === trimmedTitle.toLowerCase(),
  );
  if (duplicate) {
    return { error: `This course already has a unit called "${duplicate.title}".` };
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
  | {
      kind: "concept";
      concept: CourseConcept;
      reconciliation: ReconciliationDecision | null;
      flags: ConceptFlag[];
      /** The unit this concept belongs to, resolved for display so a
       * reviewer can see (a) which unit they're filing this concept
       * under and (b) whether that unit is itself still 'proposed' --
       * confirmCandidate refuses to confirm a concept whose unit isn't
       * confirmed yet (otherwise a confirmed concept would reference a
       * unit getCourseGraph filters out, and materializeCourseGraph
       * throws for the whole course). Null only if the concept's
       * unit_id doesn't resolve to a row of this course at all, which
       * is surfaced as an explicit "unknown unit" in the UI rather than
       * silently rendered as "no unit". */
      unit: CourseUnit | null;
      /** The extraction_runs row this candidate came from -- null for
       * anything that never went through the pipeline (there is none for
       * concepts today, but kept nullable for consistency with the unit
       * variant, which does have a manually-created, run-less case). */
      extractionRunId: string | null;
    }
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
      /** Null for a manually-created unit (createUnit never sets
       * extraction_run_id) -- a proposed unit always has one, since only
       * the extraction pipeline creates 'proposed' rows. */
      extractionRunId: string | null;
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
  // server action in this codebase. concept_edges is deliberately absent
  // here (2026-09-05 amendment to FR-006) -- edges no longer go through
  // manual review, they auto-confirm once both endpoint concepts are
  // confirmed (see confirmCandidate's autoConfirmEligibleEdges cascade
  // and extract-course-graph.ts's insert-time check).
  const [conceptsRes, unitsRes, decisionsRes, flagsRes] = await Promise.all([
    supabase.from("course_concepts").select("*").eq("course_id", courseId).eq("status", "proposed"),
    // Every unit of the course, whatever its status -- one query serving
    // three needs: the 'proposed' ones are themselves review candidates,
    // the 'confirmed' ones' titles feed the "distinct" mitigation below,
    // and all of them are needed to resolve each proposed concept's own
    // parent unit for display (a concept can only be confirmed once its
    // unit is, so the reviewer has to be able to see that unit's state).
    supabase.from("course_units").select("*").eq("course_id", courseId),
    supabase.from("reconciliation_decisions").select("*").eq("course_id", courseId),
    supabase.from("concept_flags").select("*").eq("course_id", courseId),
  ]);

  const concepts = conceptsRes.data ?? [];
  const allUnits = unitsRes.data ?? [];
  const decisions = decisionsRes.data ?? [];
  const flags = flagsRes.data ?? [];

  const proposedUnits = allUnits.filter((u) => u.status === "proposed");
  const confirmedUnitTitles = allUnits.filter((u) => u.status === "confirmed").map((u) => u.title);
  const unitById = new Map(allUnits.map((u) => [u.id, unitRowToDomain(u)]));

  // Each decision is matched to the exact candidate row it produced, by
  // reconciliation_decisions.candidate_id (migration 0014) -- written by
  // the extraction task right after it inserts the concept/unit. This
  // replaces an earlier "first decision of this run with this
  // candidate_kind wins" match, which showed one candidate's
  // model-authored reasoning on a different candidate's card.
  //
  // A candidate with no matching decision renders `null` rather than a
  // neighbour's: 'merge' decisions produce no candidate row at all, and
  // rows written before 0014 have no candidate_id to match on. Both are
  // honestly "no reconciliation text for this card", not a stand-in.
  const decisionByCandidateId = indexDecisionsByCandidateId(decisions);

  const flagsByTarget = new Map<string, ConceptFlagRow[]>();
  for (const f of flags) {
    const list = flagsByTarget.get(f.target_id) ?? [];
    list.push(f);
    flagsByTarget.set(f.target_id, list);
  }

  const conceptItems: ReviewQueueItem[] = concepts.map((row) => {
    return {
      kind: "concept",
      concept: conceptRowToDomain(row),
      reconciliation: toReconciliationDecision(decisionByCandidateId.get(row.id)),
      flags: (flagsByTarget.get(row.id) ?? []).map(toConceptFlag),
      unit: unitById.get(row.unit_id) ?? null,
      extractionRunId: row.extraction_run_id,
    };
  });

  const unitItems: ReviewQueueItem[] = proposedUnits.map((row) => {
    const reconciliation = toReconciliationDecision(decisionByCandidateId.get(row.id));
    return {
      kind: "unit",
      unit: unitRowToDomain(row),
      reconciliation,
      otherExistingUnitTitles: reconciliation?.decision === "distinct" ? confirmedUnitTitles : [],
      extractionRunId: row.extraction_run_id,
    };
  });

  return sortReviewQueueByPriority([...conceptItems, ...unitItems]);
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

  // A concept may not become 'confirmed' while the unit it belongs to is
  // still 'proposed' (or archived). getCourseGraph selects only
  // status='confirmed' units, so a confirmed concept pointing at a
  // non-confirmed unit makes materializeCourseGraph throw and 500s the
  // whole Atlas route for the course -- permanently, with no self-healing
  // path the user can discover. The unit review gate is deliberately NOT
  // auto-satisfied here (we don't silently confirm the unit on the
  // reviewer's behalf): unit review is its own independent gate, and it is
  // the design's own mitigation for the confidently-wrong-"distinct"
  // duplicate-unit risk. The review queue orders units ahead of concepts
  // and bulk-confirm confirms units first, so in the normal flow this
  // guard never fires; when it does, it says exactly what to do.
  if (kind === "concept") {
    const { data: conceptRow, error: conceptError } = await supabase
      .from("course_concepts")
      .select("unit_id")
      .eq("id", id)
      .single();
    if (conceptError || !conceptRow) {
      return { error: `No concept found with id "${id}".` };
    }
    // unit_id is NOT NULL in the schema today, but the domain type allows
    // null -- a concept with no unit has no dependency to gate on.
    if (conceptRow.unit_id) {
      const { data: unitRow, error: unitError } = await supabase
        .from("course_units")
        .select("title, status")
        .eq("id", conceptRow.unit_id)
        .single();
      if (unitError || !unitRow) {
        return {
          error: `This concept's unit (id "${conceptRow.unit_id}") could not be loaded, so it cannot be confirmed yet.`,
        };
      }
      if (unitRow.status !== "confirmed") {
        return {
          error: `Cannot confirm this concept: its unit "${unitRow.title}" must be confirmed first.`,
        };
      }
    }
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

  if (!error && kind === "concept") {
    await autoConfirmEligibleEdges(supabase, id);
  }
  if (!error && kind === "unit") {
    await autoConfirmEligibleConcepts(supabase, id);
  }

  return { error: error?.message ?? null };
}

/**
 * Edges have no manual review step of their own (2026-09-05 amendment
 * to FR-006, specs/004-course-graph-ingestion/spec.md) -- instead, the
 * moment a reviewer confirms a concept, every 'proposed' edge touching
 * it (as either endpoint) is re-checked: if the edge's OTHER endpoint is
 * ALSO already 'confirmed', the edge auto-confirms too. This is the only
 * other place (besides extract-course-graph.ts's insert-time check) an
 * edge can ever transition to 'confirmed' -- both paths share the same
 * invariant: an edge is never confirmed while either endpoint concept is
 * not, or materializeCourseGraph would throw at Atlas render time for a
 * confirmed edge pointing at an unconfirmed concept.
 *
 * Reuses confirmCandidate("edge", ...) for the actual status flip rather
 * than duplicating that update here -- this function only decides WHICH
 * edges are eligible.
 */
async function autoConfirmEligibleEdges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  confirmedConceptId: string,
): Promise<void> {
  const { data: candidateEdges, error: edgesError } = await supabase
    .from("concept_edges")
    .select("id, source_concept_id, target_concept_id")
    .eq("status", "proposed")
    .or(`source_concept_id.eq.${confirmedConceptId},target_concept_id.eq.${confirmedConceptId}`);

  // Never a silent no-op: an edge that misses this cascade has no other
  // path to becoming visible, so a failed query has to leave a trace
  // somewhere a developer can find it (server logs -- same convention as
  // concept-atlas's adapter). sweepEligibleEdges is the actual
  // correctness backstop; this logging is what makes a failure here
  // diagnosable rather than invisible.
  if (edgesError || !candidateEdges) {
    console.error(
      `[course-graph-ingestion] failed to load proposed edges touching concept ${confirmedConceptId} for auto-confirm:`,
      edgesError?.message ?? "no rows returned",
    );
    return;
  }

  for (const edge of candidateEdges) {
    const otherConceptId = resolveOtherEndpoint(edge, confirmedConceptId);

    const { data: otherConcept, error: otherConceptError } = await supabase
      .from("course_concepts")
      .select("status")
      .eq("id", otherConceptId)
      .single();

    if (otherConceptError || !otherConcept) {
      console.error(
        `[course-graph-ingestion] failed to read status of concept ${otherConceptId} while auto-confirming edge ${edge.id}:`,
        otherConceptError?.message ?? "no rows returned",
      );
      continue;
    }
    if (!shouldAutoConfirmEdge(otherConcept.status)) continue;

    const { error: confirmError } = await confirmCandidate("edge", edge.id);
    if (confirmError) {
      console.error(`[course-graph-ingestion] failed to auto-confirm edge ${edge.id}: ${confirmError}`);
    }
  }
}

/**
 * Deterministic backstop for the edge cascade: re-decides, from the
 * course's CURRENT state, every 'proposed' edge whose both endpoint
 * concepts are now 'confirmed', and confirms them in one batched update.
 *
 * Called once after a bulk-confirm batch finishes (ReviewQueue's
 * handleBulkConfirm), not per concept. That's the point: the per-confirm
 * cascade above decides from statuses as of the moment one concept was
 * confirmed, so its correctness depends on the order (and concurrency) in
 * which N individual confirmCandidate calls happen to run -- and Next.js
 * explicitly documents its one-at-a-time Server Function dispatch as an
 * implementation detail that may change. This pass depends on none of
 * that, and it's cheaper than the N+M round trips it backstops.
 *
 * Returns a real error string rather than swallowing it, since a failed
 * sweep means relationships may be silently missing from the Atlas.
 */
export async function sweepEligibleEdges(courseId: string): Promise<{ confirmed: number; error: string | null }> {
  const supabase = await createClient();

  const [edgesRes, conceptsRes] = await Promise.all([
    supabase
      .from("concept_edges")
      .select("id, source_concept_id, target_concept_id")
      .eq("course_id", courseId)
      .eq("status", "proposed"),
    supabase.from("course_concepts").select("id").eq("course_id", courseId).eq("status", "confirmed"),
  ]);

  if (edgesRes.error || !edgesRes.data) {
    const message = edgesRes.error?.message ?? "Could not load this course's proposed relationships.";
    console.error(`[course-graph-ingestion] edge sweep failed to load proposed edges: ${message}`);
    return { confirmed: 0, error: message };
  }
  if (conceptsRes.error || !conceptsRes.data) {
    const message = conceptsRes.error?.message ?? "Could not load this course's confirmed concepts.";
    console.error(`[course-graph-ingestion] edge sweep failed to load confirmed concepts: ${message}`);
    return { confirmed: 0, error: message };
  }

  const confirmedConceptIds = new Set(conceptsRes.data.map((c) => c.id));
  const eligibleIds = selectSweepableEdgeIds(edgesRes.data, confirmedConceptIds);
  if (eligibleIds.length === 0) {
    return { confirmed: 0, error: null };
  }

  const { error: updateError } = await supabase
    .from("concept_edges")
    .update({ status: "confirmed", updated_at: new Date().toISOString() })
    .in("id", eligibleIds);

  if (updateError) {
    console.error(`[course-graph-ingestion] edge sweep failed to confirm edges: ${updateError.message}`);
    return { confirmed: 0, error: updateError.message };
  }

  return { confirmed: eligibleIds.length, error: null };
}

/**
 * Concepts have no manual review step of their own once the unit they
 * file under is already confirmed (2026-09-07 decision, architecture-
 * log.md -- units, not concepts, are the review-gated side of
 * extraction; trigger/extract-course-graph.ts's own insert-time check
 * covers a concept whose unit was already confirmed at extraction time,
 * this covers the other half). The moment a reviewer confirms a unit,
 * every 'proposed' concept under it is re-checked: unless its own
 * reconciliation decision was "uncertain", it auto-confirms too --
 * cascading again, via confirmCandidate("concept", ...) below reusing
 * this same function's concept branch, into autoConfirmEligibleEdges for
 * every edge that concept completes.
 *
 * No two-sided race to backstop the way edges have (a concept depends on
 * exactly one unit, never two units converging) -- this per-confirm
 * cascade is the whole mechanism, not half of one paired with a sweep.
 *
 * Reuses confirmCandidate("concept", ...) for the actual status flip
 * rather than duplicating that update here -- this function only decides
 * WHICH concepts are eligible.
 */
async function autoConfirmEligibleConcepts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  confirmedUnitId: string,
): Promise<void> {
  const { data: candidateConcepts, error: conceptsError } = await supabase
    .from("course_concepts")
    .select("id")
    .eq("unit_id", confirmedUnitId)
    .eq("status", "proposed");

  // Never a silent no-op, same reasoning as autoConfirmEligibleEdges: a
  // concept that misses this cascade has no other path to becoming
  // visible short of a reviewer clicking its own Confirm button by hand.
  if (conceptsError || !candidateConcepts) {
    console.error(
      `[course-graph-ingestion] failed to load proposed concepts under unit ${confirmedUnitId} for auto-confirm:`,
      conceptsError?.message ?? "no rows returned",
    );
    return;
  }
  if (candidateConcepts.length === 0) return;

  const conceptIds = candidateConcepts.map((c) => c.id);
  const { data: decisions, error: decisionsError } = await supabase
    .from("reconciliation_decisions")
    .select("candidate_id, decision")
    .eq("candidate_kind", "concept")
    .in("candidate_id", conceptIds);

  if (decisionsError || !decisions) {
    console.error(
      `[course-graph-ingestion] failed to load reconciliation decisions for concepts under unit ${confirmedUnitId} for auto-confirm:`,
      decisionsError?.message ?? "no rows returned",
    );
    return;
  }
  const decisionByConceptId = new Map(decisions.map((d) => [d.candidate_id, d.decision]));

  for (const conceptId of conceptIds) {
    if (!shouldAutoConfirmConcept(decisionByConceptId.get(conceptId) ?? undefined)) continue;

    const { error: confirmError } = await confirmCandidate("concept", conceptId);
    if (confirmError) {
      console.error(`[course-graph-ingestion] failed to auto-confirm concept ${conceptId}: ${confirmError}`);
    }
  }
}

export async function rejectCandidate(
  kind: "concept" | "edge" | "unit",
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Same status guard confirmCandidate has for edges/units -- rejecting
  // something that is already archived was a real asymmetry between the
  // two actions (an already-'confirmed' row could be silently archived
  // out from under everything referencing it). Concepts are the one
  // exception: 2026-09-07 decision (architecture-log.md) made units the
  // sole review-gated side of extraction, so a concept is very often
  // already 'confirmed' by the time anyone looks at it -- "editable/
  // rejectable after confirmation" has to mean a confirmed concept can
  // still be archived, not only a proposed one.
  const rejectableStatuses: readonly string[] = kind === "concept" ? ["proposed", "confirmed"] : ["proposed"];
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE_BY_KIND[kind])
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { error: `No ${kind} found with id "${id}".` };
  }
  if (!rejectableStatuses.includes(existing.status)) {
    return {
      error: `This ${kind} is already "${existing.status}" -- nothing to reject.`,
    };
  }

  // The reject-side half of confirmCandidate's concept->unit invariant:
  // archiving a unit that confirmed concepts still point at produces the
  // exact same materializeCourseGraph throw (a confirmed concept
  // referencing a unit getCourseGraph no longer selects), and unlike the
  // confirm case it isn't recoverable by confirming something -- there is
  // no reparenting UI. Refuse instead.
  if (kind === "unit") {
    const { data: dependents, error: dependentsError } = await supabase
      .from("course_concepts")
      .select("id")
      .eq("unit_id", id)
      .eq("status", "confirmed")
      .limit(1);

    if (dependentsError) {
      return {
        error: `Could not check whether confirmed concepts still belong to this unit: ${dependentsError.message}`,
      };
    }
    if ((dependents ?? []).length > 0) {
      return {
        error: "Cannot reject this unit: confirmed concepts still belong to it.",
      };
    }
  }

  // The equivalent guard one level down: archiving a CONFIRMED concept
  // that a confirmed relationship still points at produces the same
  // dangling-reference throw from the edge side instead of the unit side
  // (materializeCourseGraph's own edge-endpoint check). A 'proposed'
  // concept can never have a 'confirmed' edge pointing at it (edges only
  // auto-confirm once BOTH endpoints are confirmed), so this is a no-op
  // in that case and only ever fires for the newly-possible confirmed-
  // concept path above.
  if (kind === "concept") {
    const { data: dependentEdges, error: dependentsError } = await supabase
      .from("concept_edges")
      .select("id")
      .eq("status", "confirmed")
      .or(`source_concept_id.eq.${id},target_concept_id.eq.${id}`)
      .limit(1);

    if (dependentsError) {
      return {
        error: `Could not check whether confirmed relationships still reference this concept: ${dependentsError.message}`,
      };
    }
    if ((dependentEdges ?? []).length > 0) {
      return {
        error: "Cannot reject this concept: confirmed relationships still reference it.",
      };
    }
  }

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
export type UnitEdit = Partial<Pick<CourseUnit, "title">>;

export async function editCandidate(
  kind: "concept",
  id: string,
  edits: ConceptEdit,
): Promise<{ error: string | null }>;
export async function editCandidate(
  kind: "unit",
  id: string,
  edits: UnitEdit,
): Promise<{ error: string | null }>;
/**
 * Edges have no edit path (and no EdgeEdit type): they left the review
 * queue in the 2026-09-05 FR-006 amendment, so nothing ever calls one.
 * The edge branch that used to live here was unreachable, untested code
 * kept only because it predated that change -- removed rather than left
 * as a plausible-looking API nothing exercises. If edge editing ever
 * comes back it belongs with whatever UI introduces it, written against
 * that UI's real requirements.
 */
export async function editCandidate(
  kind: "concept" | "unit",
  id: string,
  edits: ConceptEdit | UnitEdit,
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
