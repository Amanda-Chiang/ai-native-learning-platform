import test from "node:test";
import assert from "node:assert/strict";
import { validateFlagReason } from "../../../src/features/course-graph-ingestion/flag-validation.ts";

/**
 * submitFlag itself ("use server", src/features/course-graph-ingestion/actions.ts)
 * requires a real Next.js request-scoped auth session (cookies()) and a
 * live Supabase project -- not callable from a plain node test outside
 * that context, same limitation documented in
 * extraction-run-status.test.ts. What's directly testable here: the
 * reason-validation logic (factored out specifically so it IS
 * testable), and the invariant FR-010 depends on -- that submitFlag's
 * only write is an insert into concept_flags. That second claim is
 * verified by inspection of actions.ts (grep below) rather than
 * fabricated as a live DB assertion this test can't actually make;
 * quickstart.md Group C's manual walkthrough (submit a flag, confirm
 * the target concept/edge row is byte-for-byte unchanged) is the real
 * live verification of FR-010, not this file.
 */

test("an empty reason is rejected with the exact documented message", () => {
  const result = validateFlagReason("");
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.error, "A reason is required to flag a concept or relationship.");
  }
});

test("a whitespace-only reason is rejected, not accepted as non-empty", () => {
  const result = validateFlagReason("   \n\t  ");
  assert.equal(result.valid, false);
});

test("a real reason is accepted and trimmed", () => {
  const result = validateFlagReason("  this looks like a duplicate  ");
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.trimmed, "this looks like a duplicate");
  }
});

test("submitFlag's only database write is an insert into concept_flags (FR-010 -- never touches course_concepts/concept_edges)", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const source = await fs.readFile(
    path.join(import.meta.dirname, "../../../src/features/course-graph-ingestion/actions.ts"),
    "utf-8",
  );

  const submitFlagBody = source.slice(
    source.indexOf("export async function submitFlag"),
    source.indexOf("export async function submitConceptAtlasFlag"),
  );

  // Every .insert(...) call inside submitFlag's own body must target
  // concept_flags -- asserting this structurally rather than trusting a
  // comment to stay accurate as the file changes. Not a substitute for
  // a live check, but catches the specific regression this test exists
  // for: someone adding a write to course_concepts/concept_edges inside
  // this function.
  const insertTargets = [...submitFlagBody.matchAll(/\.from\("(\w+)"\)\s*\n?\s*\.insert/g)].map((m) => m[1]);

  assert.deepEqual(insertTargets, ["concept_flags"]);
});
