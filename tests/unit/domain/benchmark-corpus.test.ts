import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isCourseConcept } from "../../../src/types/domain/concept.ts";
import { isConceptEdge } from "../../../src/types/domain/concept-edge.ts";
import { isEvidenceEvent } from "../../../src/types/domain/evidence-event.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, "../../../benchmark/dsa-course");

function loadJson(fileName: string): unknown {
  const raw = readFileSync(path.join(corpusDir, fileName), "utf-8");
  return JSON.parse(raw);
}

const artifacts = loadJson("artifacts.json") as Array<{ id: string; artifactType: string }>;
const concepts = loadJson("concepts.json") as Array<Record<string, unknown>>;
const edges = loadJson("edges.json") as Array<Record<string, unknown>>;
const qaPairs = loadJson("qa-pairs.json") as Array<Record<string, unknown>>;
const edgeCases = loadJson("edge-cases.json") as Record<string, unknown>;

const knownArtifactIds = new Set(artifacts.map((a) => a.id));
const knownConceptIds = new Set(concepts.map((c) => c.id as string));
const knownEdgeIds = new Set(edges.map((e) => e.id as string));

test("artifacts.json has 7 entries: 5 lectures + 2 homework sets (spec FR-008)", () => {
  assert.equal(artifacts.length, 7);
  const lectures = artifacts.filter((a) => a.artifactType === "lecture");
  const homework = artifacts.filter((a) => a.artifactType === "homework");
  assert.equal(lectures.length, 5);
  assert.equal(homework.length, 2);
});

test("concepts.json has at least 30 entries, all conforming to CourseConcept (spec FR-009)", () => {
  assert.ok(concepts.length >= 30, `expected >= 30 concepts, got ${concepts.length}`);
  for (const concept of concepts) {
    assert.equal(isCourseConcept(concept), true, `invalid CourseConcept: ${JSON.stringify(concept.id)}`);
  }
});

test("edges.json has at least 30 entries, all conforming to ConceptEdge, including the relationTypeNote conditional rule (spec FR-009, FR-002)", () => {
  assert.ok(edges.length >= 30, `expected >= 30 edges, got ${edges.length}`);
  for (const edge of edges) {
    assert.equal(isConceptEdge(edge), true, `invalid ConceptEdge: ${JSON.stringify(edge.id)}`);
  }
});

test("every edge's source and target concept IDs resolve to real concepts (no dangling references)", () => {
  for (const edge of edges) {
    assert.ok(knownConceptIds.has(edge.sourceConceptId as string), `dangling sourceConceptId in ${edge.id}`);
    assert.ok(knownConceptIds.has(edge.targetConceptId as string), `dangling targetConceptId in ${edge.id}`);
  }
});

test("qa-pairs.json has at least 20 entries, each schema-shaped, with at least one isAmbiguous:true (spec FR-010, FR-011)", () => {
  assert.ok(qaPairs.length >= 20, `expected >= 20 qa-pairs, got ${qaPairs.length}`);
  for (const qa of qaPairs) {
    assert.equal(typeof qa.id, "string");
    assert.equal(typeof qa.question, "string");
    assert.equal(typeof qa.answer, "string");
    assert.ok(Array.isArray(qa.targetConceptIds));
    assert.ok(Array.isArray(qa.targetEdgeIds));
    assert.equal(typeof qa.isAmbiguous, "boolean");
    assert.ok(
      (qa.targetConceptIds as string[]).length > 0 || (qa.targetEdgeIds as string[]).length > 0,
      `qa-pair ${qa.id} targets nothing`,
    );
  }
  const ambiguousCount = qaPairs.filter((qa) => qa.isAmbiguous === true).length;
  assert.ok(ambiguousCount >= 1, "expected at least one qa-pair with isAmbiguous: true");
});

test("every qa-pair's target concept/edge IDs resolve to real entries", () => {
  for (const qa of qaPairs) {
    for (const id of qa.targetConceptIds as string[]) {
      assert.ok(knownConceptIds.has(id), `qa-pair ${qa.id} targets unknown concept ${id}`);
    }
    for (const id of qa.targetEdgeIds as string[]) {
      assert.ok(knownEdgeIds.has(id), `qa-pair ${qa.id} targets unknown edge ${id}`);
    }
  }
});

test("every sourceAnchors[].artifactId across concepts, edges, and qa-pairs resolves to a real artifact (no dangling references, spec FR-007)", () => {
  const collections: Array<{ name: string; items: Array<Record<string, unknown>> }> = [
    { name: "concepts", items: concepts },
    { name: "edges", items: edges },
    { name: "qa-pairs", items: qaPairs },
  ];
  for (const { name, items } of collections) {
    for (const item of items) {
      const anchors = (item.sourceAnchors as Array<{ artifactId: string }> | undefined) ?? [];
      for (const anchor of anchors) {
        assert.ok(
          knownArtifactIds.has(anchor.artifactId),
          `${name} entry ${item.id} has a dangling sourceAnchors artifactId: ${anchor.artifactId}`,
        );
      }
    }
  }
});

test("edge-cases.json contains all 4 required edge cases, each referencing a real corpus entry (spec FR-011)", () => {
  assert.ok("nonStandardRelationType" in edgeCases);
  assert.ok("multiAliasConcept" in edgeCases);
  assert.ok("multiTargetEvidence" in edgeCases);
  assert.ok("ambiguousQuestion" in edgeCases);

  const nonStandard = edgeCases.nonStandardRelationType as { edgeId: string };
  assert.ok(knownEdgeIds.has(nonStandard.edgeId));
  const referencedEdge = edges.find((e) => e.id === nonStandard.edgeId);
  assert.equal(referencedEdge?.relationType, "other");

  const multiAlias = edgeCases.multiAliasConcept as { conceptId: string; aliases: string[] };
  assert.ok(knownConceptIds.has(multiAlias.conceptId));
  assert.ok(multiAlias.aliases.length >= 1);

  const multiTarget = edgeCases.multiTargetEvidence as { example: unknown };
  assert.equal(isEvidenceEvent(multiTarget.example), true);
  const example = multiTarget.example as { conceptIds: string[]; edgeIds: string[] };
  assert.ok(example.conceptIds.length >= 2 || (example.conceptIds.length >= 1 && example.edgeIds.length >= 1));
  assert.ok(example.edgeIds.length >= 2);

  const ambiguous = edgeCases.ambiguousQuestion as { qaPairId: string };
  const referencedQa = qaPairs.find((qa) => qa.id === ambiguous.qaPairId);
  assert.equal(referencedQa?.isAmbiguous, true);
});

test("the corpus is scoreable offline: a trivial baseline extraction can be checked against concepts.json with no network or model calls (Constitution Principle IV)", () => {
  // A deliberately trivial "extraction": pretend a pipeline extracted only the
  // first 3 concepts' canonical names. Scoring this against the corpus is the
  // same mechanism a real extraction pipeline's output would be scored with.
  function trivialBaselineExtraction(allConcepts: Array<Record<string, unknown>>): string[] {
    return allConcepts.slice(0, 3).map((c) => c.canonicalName as string);
  }

  function scoreAgainstCorpus(extracted: string[], corpus: Array<Record<string, unknown>>): number {
    const corpusNames = new Set(corpus.map((c) => c.canonicalName as string));
    const correct = extracted.filter((name) => corpusNames.has(name)).length;
    return correct / extracted.length;
  }

  const extracted = trivialBaselineExtraction(concepts);
  const score = scoreAgainstCorpus(extracted, concepts);

  assert.equal(extracted.length, 3);
  assert.equal(score, 1, "trivial baseline should score perfectly against its own source corpus");
});
