import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSING_OPENAI_KEY_REASON,
  UNREADABLE_ARTIFACT_REASON,
} from "../../../trigger/extract-course-graph.ts";
import { parseExtractionResult } from "../../../src/features/course-graph-ingestion/extraction-schema.ts";

/**
 * trigger/extract-course-graph.ts's `run` function is tightly coupled to
 * a live Supabase admin client and the OpenAI SDK -- it is not
 * meaningfully unit-testable in isolation without either a live project
 * or a hand-rolled fake covering the Postgres/Storage query surface it
 * uses, which this project doesn't have yet. What IS directly,
 * honestly testable without either: that the two failure-reason
 * constants that gate distinct extraction_runs.failure_reason values
 * are actually distinct (the real risk T015 exists to catch -- two
 * different causes collapsing into the same message), and that a
 * zero-candidate extraction result is a real, valid, non-failure case
 * (already exercised by extraction-schema.test.ts, referenced again
 * here so the "completed with concepts_extracted: 0 is not a failure"
 * claim has a test pointing at it, not just a comment).
 *
 * Full end-to-end status-transition verification (missing key ->
 * "failed", unreadable artifact -> "failed" with a different reason,
 * zero content -> "completed") is quickstart.md Group C's job, which
 * requires a live Supabase project and (for the first two cases) a
 * deliberately misconfigured environment -- not something this test
 * suite fakes convincingly enough to claim as verified here.
 */

test("the missing-OpenAI-key and unreadable-artifact failure reasons are distinct strings", () => {
  assert.notEqual(MISSING_OPENAI_KEY_REASON, UNREADABLE_ARTIFACT_REASON);
  assert.ok(MISSING_OPENAI_KEY_REASON.length > 0);
  assert.ok(UNREADABLE_ARTIFACT_REASON.length > 0);
});

test("zero extractable content is a valid, parseable, non-failure extraction result", () => {
  const result = parseExtractionResult({ units: [], concepts: [], edges: [] });
  assert.deepEqual(result, { units: [], concepts: [], edges: [] });
});
