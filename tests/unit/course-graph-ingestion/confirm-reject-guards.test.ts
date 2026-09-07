import test from "node:test";
import assert from "node:assert/strict";

/**
 * confirmCandidate/rejectCandidate/getCourseGraph ("use server",
 * src/features/course-graph-ingestion/actions.ts) need a real Next.js
 * request-scoped auth session (cookies()) plus a live Supabase project,
 * so they can't be called from a plain node test -- the same limitation
 * submit-flag.test.ts documents. What IS assertable here, using that
 * file's established source-parsing technique, is the structure of the
 * guards these functions must contain, because the invariant they
 * protect is a whole-course outage:
 *
 *   getCourseGraph selects only status='confirmed' units AND only
 *   status='confirmed' concepts, and materializeCourseGraph throws if a
 *   selected concept's unit_id isn't among the selected units. So a
 *   'confirmed' concept whose unit is still 'proposed' (or archived)
 *   permanently 500s /courses/{id}/atlas for that course.
 *
 * These are structural assertions, not a substitute for the live
 * walkthrough (confirm a concept whose unit is still proposed in the
 * real app and observe the explicit error) -- they exist to catch the
 * specific regression of someone removing the guards.
 */

async function readActionsSource(): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return fs.readFile(
    path.join(import.meta.dirname, "../../../src/features/course-graph-ingestion/actions.ts"),
    "utf-8",
  );
}

function bodyBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start !== -1, `expected to find "${startMarker}" in actions.ts`);
  assert.ok(end !== -1, `expected to find "${endMarker}" after "${startMarker}" in actions.ts`);
  return source.slice(start, end);
}

test("confirmCandidate refuses to confirm a concept whose unit is not itself confirmed (C1)", async () => {
  const source = await readActionsSource();
  const body = bodyBetween(source, "export async function confirmCandidate", "async function autoConfirmEligibleEdges");

  // The guard reads the parent unit's status...
  assert.ok(
    /\.from\("course_units"\)\s*\n?\s*\.select\("title, status"\)/.test(body),
    "confirmCandidate must look up the concept's parent unit status before confirming",
  );
  // ...and returns an explicit error (never proceeds silently) when it
  // isn't 'confirmed'.
  const guardIndex = body.indexOf('unitRow.status !== "confirmed"');
  assert.ok(guardIndex !== -1, "confirmCandidate must compare the parent unit's status against 'confirmed'");
  const guardSlice = body.slice(guardIndex, guardIndex + 400);
  assert.ok(
    /return \{\s*\n?\s*error:/.test(guardSlice),
    "the unit-status guard must return an explicit error, not fall through",
  );

  // The guard has to run BEFORE the status flip, or it guards nothing.
  const updateIndex = body.indexOf('.update({ status: "confirmed"');
  assert.ok(updateIndex !== -1, "confirmCandidate must contain a status->confirmed update");
  assert.ok(guardIndex < updateIndex, "the unit-status guard must precede the status update");
});

test("rejectCandidate refuses to archive a unit that confirmed concepts still reference (same throw, irreversibly)", async () => {
  const source = await readActionsSource();
  const body = bodyBetween(source, "export async function rejectCandidate", "export type ConceptEdit");

  const dependentsCheck = body.indexOf('.from("course_concepts")');
  assert.ok(dependentsCheck !== -1, "rejectCandidate must check for dependent concepts before archiving a unit");
  const checkSlice = body.slice(dependentsCheck, dependentsCheck + 400);
  assert.ok(checkSlice.includes('.eq("unit_id", id)'), "the dependency check must be scoped to this unit");
  assert.ok(checkSlice.includes('.eq("status", "confirmed")'), "only CONFIRMED dependents block a unit rejection");

  const archiveIndex = body.indexOf('.update({ status: "archived"');
  assert.ok(archiveIndex !== -1, "rejectCandidate must contain a status->archived update");
  assert.ok(dependentsCheck < archiveIndex, "the dependency check must precede the archive update");
});

test("rejectCandidate's 'proposed'-only guard has one deliberate exception: a confirmed concept", async () => {
  const source = await readActionsSource();
  const body = bodyBetween(source, "export async function rejectCandidate", "export type ConceptEdit");

  // 2026-09-07 decision (architecture-log.md): units are the sole
  // review-gated side of extraction, so a concept is often already
  // 'confirmed' by the time anyone looks at it -- rejectCandidate must
  // still be able to archive one, unlike edges/units which stay
  // 'proposed'-only.
  assert.ok(
    /rejectableStatuses[\s\S]{0,80}"concept"[\s\S]{0,40}\["proposed",\s*"confirmed"\]/.test(body) ||
      /kind === "concept"[\s\S]{0,40}\["proposed",\s*"confirmed"\]/.test(body),
    "rejectCandidate must allow archiving a concept from 'confirmed', not only 'proposed'",
  );
  assert.ok(
    body.includes('!rejectableStatuses.includes(existing.status)'),
    "the actual guard check must be status-set-based, not a single hardcoded 'proposed' comparison",
  );
});

test("rejectCandidate refuses to archive a confirmed concept that confirmed relationships still reference (same throw, from the edge side)", async () => {
  const source = await readActionsSource();
  const body = bodyBetween(source, "export async function rejectCandidate", "export type ConceptEdit");

  const dependentsCheck = body.indexOf('.from("concept_edges")');
  assert.ok(dependentsCheck !== -1, "rejectCandidate must check for dependent edges before archiving a concept");
  const checkSlice = body.slice(dependentsCheck, dependentsCheck + 400);
  assert.ok(
    checkSlice.includes('source_concept_id.eq.${id},target_concept_id.eq.${id}'),
    "the dependency check must cover this concept as either endpoint",
  );
  assert.ok(checkSlice.includes('.eq("status", "confirmed")'), "only CONFIRMED dependent edges block a rejection");

  const archiveIndex = body.indexOf('kind === "concept" ? "course_concepts" : "concept_edges"');
  assert.ok(archiveIndex !== -1, "rejectCandidate must contain the concept/edge archive branch");
  assert.ok(dependentsCheck < archiveIndex, "the dependency check must precede the archive update");
});

test("getCourseGraph filters units, concepts and edges by the SAME status value -- the rows it selects can never make materializeCourseGraph throw", async () => {
  const source = await readActionsSource();
  const body = bodyBetween(source, "export async function getCourseGraph", "export async function submitFlag");

  const statusFilters = [...body.matchAll(/\.eq\("status", "(\w+)"\)/g)].map((m) => m[1]);

  // Three queries (units, concepts, edges), all on the same status. If
  // these ever diverge -- e.g. concepts widened to include 'proposed'
  // while units stay 'confirmed' -- materializeCourseGraph throws for
  // the whole course at Atlas render time.
  assert.deepEqual(statusFilters, ["confirmed", "confirmed", "confirmed"]);
});
