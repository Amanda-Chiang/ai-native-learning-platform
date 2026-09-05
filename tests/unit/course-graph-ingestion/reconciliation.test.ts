import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileConcept,
  type ExistingConceptSummary,
  type ReconciliationClassifier,
  type ReconciliationResult,
  reconcileUnit,
  type ExistingUnitSummary,
  type UnitReconciliationClassifier,
  type UnitReconciliationResult,
} from "../../../src/features/course-graph-ingestion/reconciliation.ts";

// benchmark/dsa-course/concepts.json's own multiAliasConcept edge case:
// "BFS" extracted from a second artifact should reconcile onto the
// existing "Breadth-First Search" concept.
const existingConcepts: ExistingConceptSummary[] = [
  {
    id: "concept-bfs-real-id",
    canonicalName: "Breadth-First Search",
    aliases: [],
    description: "Explores graph nodes in increasing order of distance from a source vertex.",
  },
  {
    id: "concept-quick-sort-real-id",
    canonicalName: "Quick Sort",
    aliases: [],
    description: "A divide-and-conquer comparison sort using a pivot.",
  },
];

function fakeClassifier(result: ReconciliationResult): ReconciliationClassifier {
  return async () => result;
}

test("a mocked 'merge' response resolves to the existing concept's id", async () => {
  const classify = fakeClassifier({
    decision: "merge",
    matchedConceptId: "concept-bfs-real-id",
    reasoning: "\"BFS\" is a common abbreviation for \"Breadth-First Search\", already in the course.",
  });

  const result = await reconcileConcept(
    classify,
    { canonicalName: "BFS", aliases: [], description: "A graph traversal algorithm." },
    existingConcepts,
  );

  assert.equal(result.decision, "merge");
  if (result.decision === "merge") {
    assert.equal(result.matchedConceptId, "concept-bfs-real-id");
  }
});

test("'uncertain' is a distinct outcome from 'distinct', not treated the same by the return type", async () => {
  const classify = fakeClassifier({
    decision: "uncertain",
    reasoning: "Could plausibly be the same as an existing concept, but not confident enough to merge.",
  });

  const result = await reconcileConcept(
    classify,
    { canonicalName: "Sorting via priority extraction", aliases: [], description: "..." },
    existingConcepts,
  );

  assert.equal(result.decision, "uncertain");
  assert.notEqual(result.decision, "distinct");
  // "uncertain" and "distinct" share no fields beyond `reasoning` --
  // a caller can't accidentally read a `matchedConceptId` off either.
  assert.equal("matchedConceptId" in result, false);
});

test("a genuinely new concept classifies as 'distinct'", async () => {
  const classify = fakeClassifier({
    decision: "distinct",
    reasoning: "No existing concept covers dynamic programming memoization.",
  });

  const result = await reconcileConcept(
    classify,
    { canonicalName: "Memoization", aliases: [], description: "Caching subproblem results." },
    existingConcepts,
  );

  assert.equal(result.decision, "distinct");
});

test("a course with zero existing concepts short-circuits to 'distinct' without calling the classifier", async () => {
  let called = false;
  const classify: ReconciliationClassifier = async () => {
    called = true;
    return { decision: "distinct", reasoning: "should not be reached" };
  };

  const result = await reconcileConcept(
    classify,
    { canonicalName: "Big-O Notation", aliases: [], description: "..." },
    [],
  );

  assert.equal(result.decision, "distinct");
  assert.equal(called, false, "classifier must not be called when there's nothing to compare against");
});

// Unit reconciliation tests (parallel to concept reconciliation above)
const existingUnits: ExistingUnitSummary[] = [
  { id: "unit-graph-theory-real-id", title: "Graph Theory" },
  { id: "unit-dp-real-id", title: "Dynamic Programming" },
];

function fakeUnitClassifier(result: UnitReconciliationResult): UnitReconciliationClassifier {
  return async () => result;
}

test("a mocked unit 'merge' response resolves to the existing unit's id", async () => {
  const classify = fakeUnitClassifier({
    decision: "merge",
    matchedUnitId: "unit-graph-theory-real-id",
    reasoning: "\"Graphs\" is the same topic as the existing \"Graph Theory\" unit.",
  });

  const result = await reconcileUnit(classify, { title: "Graphs" }, existingUnits);

  assert.equal(result.decision, "merge");
  if (result.decision === "merge") {
    assert.equal(result.matchedUnitId, "unit-graph-theory-real-id");
  }
});

test("a genuinely new unit classifies as 'distinct'", async () => {
  const classify = fakeUnitClassifier({
    decision: "distinct",
    reasoning: "No existing unit covers sorting algorithms.",
  });

  const result = await reconcileUnit(classify, { title: "Sorting & Search" }, existingUnits);

  assert.equal(result.decision, "distinct");
});

test("a course with zero existing units short-circuits to 'distinct' without calling the classifier", async () => {
  let called = false;
  const classify: UnitReconciliationClassifier = async () => {
    called = true;
    return { decision: "distinct", reasoning: "should not be reached" };
  };

  const result = await reconcileUnit(classify, { title: "Graph Theory" }, []);

  assert.equal(result.decision, "distinct");
  assert.equal(called, false, "classifier must not be called when there's nothing to compare against");
});
