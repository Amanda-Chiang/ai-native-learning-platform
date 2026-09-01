import { task } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { toFile } from "openai";
import type { Database } from "../src/lib/supabase/database.types.ts";
import { getOpenAiClient, isOpenAiConfigured } from "../src/lib/openai/client.ts";
import {
  EXTRACTION_RESPONSE_SCHEMA,
  parseExtractionResult,
  type ExtractionResult,
} from "../src/features/course-graph-ingestion/extraction-schema.ts";
import {
  createOpenAiReconciliationClassifier,
  reconcileConcept,
  type ExistingConceptSummary,
  type ReconciliationClassifier,
} from "../src/features/course-graph-ingestion/reconciliation.ts";

/**
 * Trigger.dev task contract: specs/004-course-graph-ingestion/contracts/ingestion-actions.md
 *
 * Runs as a Supabase service-role client, same reasoning as
 * trigger/ingest-artifact.ts: acts on behalf of the system, not any
 * single student's session.
 *
 * Triggered from trigger/ingest-artifact.ts once an artifact reaches
 * "ready" -- kept a separate task rather than folded into that one
 * (research.md "Chaining onto Phase 1's ingest-artifact task"), so a
 * retried ingest-artifact run can't accidentally re-trigger extraction,
 * and Phase 1's already-shipped task doesn't need an OpenAI key just to
 * validate a file exists.
 */
function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type ExtractCourseGraphPayload = {
  artifactId: string;
  courseId: string;
};

/**
 * Model choice is deliberately isolated to this one constant (and
 * overridable via env) rather than inlined at the call site -- model ids
 * change over time and this project has no basis yet for treating one
 * specific id as permanent. If this model id is ever retired, the
 * OpenAI call fails loudly with a real API error (caught below and
 * written as a distinct extraction_runs failure) -- never silently
 * degrades to a different, unrequested model or a fabricated empty
 * result.
 */
const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4.1";

// Named, exported constants (not inlined strings) specifically so a
// test can assert they're distinct from each other -- two different
// failure causes collapsing into the same message would defeat the
// point of a "distinct failure status" (research.md, FR-012).
export const MISSING_OPENAI_KEY_REASON = "OpenAI is not configured for this environment.";
export const UNREADABLE_ARTIFACT_REASON = "The uploaded file could not be found in storage.";

const EXTRACTION_PROMPT = `You are extracting a course concept graph from one course artifact for a data-structures-and-algorithms course.

Read the attached file and identify the distinct teachable concepts it introduces or discusses, and the relationships between them.

Rules:
- Only extract concepts and relationships that are actually present in this artifact. If the artifact has no extractable course content, return empty concepts and edges arrays -- do not invent placeholder content.
- Every concept and every edge MUST include at least one sourceAnchor (locator + a short excerpt or close paraphrase) grounding it in this specific artifact. Never omit this.
- Use the standard relationType taxonomy (prerequisite_for, part_of, mechanism_for, contrasts_with, used_in, generalizes_to, example_of) wherever one fits. Only use "other" when none of these genuinely fit, and in that case you MUST fill in relationTypeNote explaining why.
- Assign each concept a short, stable localId (e.g. "c1", "c2") and reference those localIds from edges -- do not invent ids that look like database ids.
- confidence and importanceScore are your own honest 0-1 estimates, not fixed defaults.`;

async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  runId: string,
  reason: string,
) {
  await supabase
    .from("extraction_runs")
    .update({ status: "failed", failure_reason: reason, completed_at: new Date().toISOString() })
    .eq("id", runId);
  return { status: "failed" as const, failureReason: reason };
}

export const extractCourseGraphTask = task({
  id: "extract-course-graph",
  // OpenAI file-reading calls run well past ingest-artifact's 60s
  // deterministic-only budget -- overridden per-task rather than raising
  // the shared trigger.config.ts default, which is intentionally tight
  // for that other, unrelated task.
  maxDuration: 300,
  run: async (payload: ExtractCourseGraphPayload) => {
    const supabase = createAdminClient();

    // Idempotency guard (research.md): a prior run already reaching a
    // terminal status means skip, same pattern as ingest-artifact.ts.
    const { data: existingRuns } = await supabase
      .from("extraction_runs")
      .select("id, status")
      .eq("artifact_id", payload.artifactId)
      .order("created_at", { ascending: false })
      .limit(1);

    const existingRun = existingRuns?.[0];
    if (existingRun && (existingRun.status === "completed" || existingRun.status === "failed")) {
      return { skipped: true, reason: "already terminal" };
    }

    const { data: artifact, error: artifactError } = await supabase
      .from("artifacts")
      .select("owner_id, storage_path, original_filename")
      .eq("id", payload.artifactId)
      .single();

    if (artifactError || !artifact) {
      throw new Error(`Artifact ${payload.artifactId} not found -- cannot start extraction.`);
    }

    const { data: run, error: runInsertError } = await supabase
      .from("extraction_runs")
      .insert({
        course_id: payload.courseId,
        owner_id: artifact.owner_id,
        artifact_id: payload.artifactId,
        status: "queued",
        failure_reason: null,
        concepts_extracted: 0,
        edges_extracted: 0,
        edges_dropped_self_referential: 0,
        started_at: null,
        completed_at: null,
      })
      .select("id")
      .single();

    if (runInsertError || !run) {
      throw new Error(
        `Failed to create extraction_runs row for artifact ${payload.artifactId}: ${runInsertError?.message}`,
      );
    }

    // Missing OPENAI_API_KEY: a distinct, visible failure -- never a
    // silent no-op indistinguishable from "extracted zero concepts"
    // (research.md "Missing OPENAI_API_KEY").
    if (!isOpenAiConfigured()) {
      return markFailed(supabase, run.id, MISSING_OPENAI_KEY_REASON);
    }

    await supabase
      .from("extraction_runs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", run.id);

    // Unreadable artifact: a distinct failure status (FR-012), same
    // file-existence check pattern already proven in ingest-artifact.ts.
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("course-artifacts")
      .download(artifact.storage_path);

    if (downloadError || !fileBlob) {
      return markFailed(supabase, run.id, UNREADABLE_ARTIFACT_REASON);
    }

    const openai = getOpenAiClient();

    let rawResult: unknown;
    try {
      const uploaded = await openai.files.create({
        file: await toFile(fileBlob, artifact.original_filename),
        purpose: "user_data",
      });

      const response = await openai.responses.create({
        model: EXTRACTION_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: uploaded.id },
              { type: "input_text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: EXTRACTION_RESPONSE_SCHEMA.name,
            strict: EXTRACTION_RESPONSE_SCHEMA.strict,
            schema: EXTRACTION_RESPONSE_SCHEMA.schema,
          },
        },
      });

      rawResult = JSON.parse(response.output_text);
    } catch (err) {
      return markFailed(
        supabase,
        run.id,
        `Extraction call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let extraction: ExtractionResult;
    try {
      extraction = parseExtractionResult(rawResult);
    } catch (err) {
      return markFailed(
        supabase,
        run.id,
        `Extraction response failed validation: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const classify = createOpenAiReconciliationClassifier(openai, EXTRACTION_MODEL);
    const insertResult = await writeExtractionCandidates(
      supabase,
      payload.courseId,
      artifact.owner_id,
      run.id,
      payload.artifactId,
      extraction,
      classify,
    );

    await supabase
      .from("extraction_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        concepts_extracted: insertResult.conceptsExtracted,
        edges_extracted: insertResult.edgesExtracted,
        edges_dropped_self_referential: insertResult.edgesDroppedSelfReferential,
      })
      .eq("id", run.id);

    return {
      status: "completed" as const,
      conceptsExtracted: insertResult.conceptsExtracted,
      edgesExtracted: insertResult.edgesExtracted,
    };
  },
});

/**
 * Writes validated candidates, routing each concept through
 * reconciliation.ts first (User Story 2). A course with zero existing
 * concepts short-circuits inside reconcileConcept itself (nothing to
 * compare against) -- this function doesn't special-case that here, it
 * just always calls reconcileConcept and trusts that function's own
 * documented shortcut.
 */
async function writeExtractionCandidates(
  supabase: ReturnType<typeof createAdminClient>,
  courseId: string,
  ownerId: string,
  extractionRunId: string,
  artifactId: string,
  extraction: ExtractionResult,
  classify: ReconciliationClassifier,
): Promise<{ conceptsExtracted: number; edgesExtracted: number; edgesDroppedSelfReferential: number }> {
  const { data: units, error: unitsError } = await supabase
    .from("course_units")
    .select("id")
    .eq("course_id", courseId)
    .limit(1);

  if (unitsError) {
    throw new Error(`Failed to look up course_units for course ${courseId}: ${unitsError.message}`);
  }

  // A course must have at least one unit before extraction can attach
  // concepts to one -- extracted concepts need a real unit_id (data-model.md's
  // not-null FK), and this task does not invent a unit on the course
  // owner's behalf (that's organizational metadata the owner authors
  // directly, per data-model.md's course_units RLS comment).
  const unitId = units?.[0]?.id;
  if (!unitId) {
    throw new Error(
      `Course ${courseId} has no course_units yet -- create at least one unit before running extraction.`,
    );
  }

  // Only proposed/confirmed concepts are live candidates to reconcile
  // against -- an archived (rejected) concept is not something a new
  // extraction should merge onto.
  const { data: existingRows, error: existingError } = await supabase
    .from("course_concepts")
    .select("id, canonical_name, aliases, description")
    .eq("course_id", courseId)
    .in("status", ["proposed", "confirmed"]);

  if (existingError) {
    throw new Error(`Failed to look up existing concepts for course ${courseId}: ${existingError.message}`);
  }

  const existingConcepts: ExistingConceptSummary[] = (existingRows ?? []).map((row) => ({
    id: row.id,
    canonicalName: row.canonical_name,
    aliases: row.aliases,
    description: row.description,
  }));

  const localIdToRealId = new Map<string, string>();

  let conceptsExtracted = 0;
  for (const concept of extraction.concepts) {
    const reconciliation = await reconcileConcept(
      classify,
      { canonicalName: concept.canonicalName, aliases: concept.aliases, description: concept.description },
      existingConcepts,
    );

    // The model's own stated reasoning, kept verbatim (data-model.md
    // reconciliation_decisions.reasoning) -- never a generic
    // placeholder like "auto-decided", for both the real-model-call
    // path and the zero-existing-concepts shortcut alike.
    const { error: decisionInsertError } = await supabase.from("reconciliation_decisions").insert({
      course_id: courseId,
      owner_id: ownerId,
      extraction_run_id: extractionRunId,
      candidate_kind: "concept",
      decision: reconciliation.decision,
      matched_concept_id: reconciliation.decision === "merge" ? reconciliation.matchedConceptId : null,
      reasoning: reconciliation.reasoning,
    });
    if (decisionInsertError) {
      throw new Error(`Failed to record reconciliation decision: ${decisionInsertError.message}`);
    }

    if (reconciliation.decision === "merge") {
      const matched = existingConcepts.find((c) => c.id === reconciliation.matchedConceptId);
      if (!matched) {
        // The classifier returned a matchedConceptId that isn't in the
        // list it was given -- a real invariant violation (a model
        // hallucinating an id), not something to silently fall back to
        // "distinct" for, since that would hide the failure instead of
        // surfacing it.
        throw new Error(
          `Reconciliation returned matchedConceptId "${reconciliation.matchedConceptId}", which is not among this course's existing concepts.`,
        );
      }

      const mergedAliases = Array.from(
        new Set([...matched.aliases, concept.canonicalName, ...concept.aliases].filter(
          (a) => a !== matched.canonicalName,
        )),
      );

      const { data: existingRow, error: fetchAnchorsError } = await supabase
        .from("course_concepts")
        .select("source_anchors")
        .eq("id", matched.id)
        .single();
      if (fetchAnchorsError || !existingRow) {
        throw new Error(`Failed to load existing source_anchors for concept ${matched.id}.`);
      }

      const { error: updateError } = await supabase
        .from("course_concepts")
        .update({
          aliases: mergedAliases,
          source_anchors: [
            ...existingRow.source_anchors,
            ...concept.sourceAnchors.map((a) => ({ artifactId, ...a })),
          ],
          updated_at: new Date().toISOString(),
        })
        .eq("id", matched.id);
      if (updateError) {
        throw new Error(`Failed to merge candidate onto concept ${matched.id}: ${updateError.message}`);
      }

      localIdToRealId.set(concept.localId, matched.id);
      // Not counted in conceptsExtracted -- no new course_concepts row
      // was created; this candidate became additional evidence on an
      // existing one, not a new candidate for a reviewer to act on.
      continue;
    }

    // "distinct" and "uncertain" both get their own proposed row --
    // "uncertain" is still visible to a reviewer as its own candidate,
    // distinguished from "distinct" only via its reconciliation_decisions
    // row (FR-005: never silently auto-merged, but also never silently
    // dropped).
    const { data: inserted, error: insertError } = await supabase
      .from("course_concepts")
      .insert({
        course_id: courseId,
        owner_id: ownerId,
        unit_id: unitId,
        canonical_name: concept.canonicalName,
        aliases: concept.aliases,
        description: concept.description,
        importance_score: concept.importanceScore,
        source_anchors: concept.sourceAnchors.map((a) => ({ artifactId, ...a })),
        status: "proposed",
        confidence: concept.confidence,
        extraction_run_id: extractionRunId,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to insert concept "${concept.canonicalName}": ${insertError?.message}`);
    }

    localIdToRealId.set(concept.localId, inserted.id);
    // existingConcepts is only used to compare THIS extraction run's
    // remaining candidates against course state as of before this run
    // started -- a newly-inserted "distinct" concept is intentionally
    // NOT added to it, so two near-duplicate candidates extracted from
    // the SAME artifact in the SAME run are each reconciled against the
    // pre-run baseline, not against each other. Within-run duplication
    // is a real, separate case this feature doesn't yet handle (not
    // silently claimed to be handled) -- worth a future task, not
    // invented here.
    conceptsExtracted += 1;
  }

  const { toInsert, droppedSelfReferential } = resolveEdgeEndpoints(extraction.edges, localIdToRealId);

  let edgesExtracted = 0;
  for (const edge of toInsert) {
    const { error: edgeInsertError } = await supabase.from("concept_edges").insert({
      course_id: courseId,
      owner_id: ownerId,
      source_concept_id: edge.sourceConceptId,
      target_concept_id: edge.targetConceptId,
      relation_type: edge.relationType,
      relation_type_note: edge.relationTypeNote,
      explanation: edge.explanation,
      source_anchors: edge.sourceAnchors.map((a) => ({ artifactId, ...a })),
      status: "proposed",
      confidence: edge.confidence,
      extraction_run_id: extractionRunId,
    });

    if (edgeInsertError) {
      throw new Error(`Failed to insert edge: ${edgeInsertError.message}`);
    }
    edgesExtracted += 1;
  }

  return { conceptsExtracted, edgesExtracted, edgesDroppedSelfReferential: droppedSelfReferential };
}

/**
 * Pure: resolves each candidate edge's localId endpoints to real concept
 * ids and drops any that became self-referential (FR-011) -- two
 * originally distinct candidate endpoints can end up pointing at the
 * same real concept id after reconciliation merges one of them onto an
 * existing concept the other also merged onto. Factored out from
 * writeExtractionCandidates specifically so this invariant is testable
 * without a live Supabase client (tests/unit/course-graph-ingestion/self-referential-edge.test.ts).
 */
export function resolveEdgeEndpoints(
  edges: ExtractionResult["edges"],
  localIdToRealId: Map<string, string>,
): {
  toInsert: Array<
    Omit<ExtractionResult["edges"][number], "sourceLocalId" | "targetLocalId"> & {
      sourceConceptId: string;
      targetConceptId: string;
    }
  >;
  droppedSelfReferential: number;
} {
  const toInsert: Array<
    Omit<ExtractionResult["edges"][number], "sourceLocalId" | "targetLocalId"> & {
      sourceConceptId: string;
      targetConceptId: string;
    }
  > = [];
  let droppedSelfReferential = 0;

  for (const edge of edges) {
    const sourceConceptId = localIdToRealId.get(edge.sourceLocalId);
    const targetConceptId = localIdToRealId.get(edge.targetLocalId);
    if (!sourceConceptId || !targetConceptId) {
      // parseExtractionResult already guarantees every localId
      // referenced by an edge exists among the concepts array, so this
      // can only happen if a caller passed a localIdToRealId map that
      // doesn't cover every concept it processed. Kept as an explicit
      // invariant check rather than a silent skip so that bug surfaces
      // immediately instead of quietly dropping an edge
      // (no-silent-placeholders).
      throw new Error(
        `Edge references a concept id not present in localIdToRealId (sourceLocalId=${edge.sourceLocalId}, targetLocalId=${edge.targetLocalId}).`,
      );
    }

    if (sourceConceptId === targetConceptId) {
      droppedSelfReferential += 1;
      continue;
    }

    const { sourceLocalId: _s, targetLocalId: _t, ...rest } = edge;
    toInsert.push({ ...rest, sourceConceptId, targetConceptId });
  }

  return { toInsert, droppedSelfReferential };
}
