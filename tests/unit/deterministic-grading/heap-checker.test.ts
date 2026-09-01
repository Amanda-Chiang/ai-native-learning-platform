import test from "node:test";
import assert from "node:assert/strict";
import { checkHeapOperations, checkHeapProperty } from "../../../src/features/deterministic-grading/checkers/heap-checker.ts";

test("a correct min-heap operation trace validates exactly", () => {
  const result = checkHeapOperations({
    heapType: "min",
    operations: [
      { kind: "insert", value: 5 },
      { kind: "insert", value: 3 },
      { kind: "insert", value: 8 },
      { kind: "extract" },
    ],
    claimedExtractedSequence: [3],
    claimedFinalState: [5, 8],
  });
  assert.equal(result.outcome, "correct");
});

test("an incorrect extracted sequence is rejected with the real expected sequence/state", () => {
  const result = checkHeapOperations({
    heapType: "min",
    operations: [
      { kind: "insert", value: 5 },
      { kind: "insert", value: 3 },
      { kind: "extract" },
    ],
    claimedExtractedSequence: [5],
    claimedFinalState: [3],
  });
  assert.equal(result.outcome, "incorrect");
  if (result.outcome === "incorrect") {
    assert.deepEqual(result.expectedExtractedSequence, [3]);
    assert.deepEqual(result.expectedFinalState, [5]);
  }
});

test("max-heap operations are graded against max-heap semantics", () => {
  const result = checkHeapOperations({
    heapType: "max",
    operations: [
      { kind: "insert", value: 5 },
      { kind: "insert", value: 9 },
      { kind: "extract" },
    ],
    claimedExtractedSequence: [9],
    claimedFinalState: [5],
  });
  assert.equal(result.outcome, "correct");
});

test("an extract on an empty heap is invalid_input", () => {
  const result = checkHeapOperations({
    heapType: "min",
    operations: [{ kind: "extract" }],
    claimedExtractedSequence: [],
    claimedFinalState: [],
  });
  assert.equal(result.outcome, "invalid_input");
});

test("checkHeapProperty validates a real min-heap array", () => {
  assert.equal(checkHeapProperty("min", [1, 3, 2, 5, 4]).valid, true);
});

test("checkHeapProperty rejects an array violating the min-heap property", () => {
  const result = checkHeapProperty("min", [5, 3, 2]);
  assert.equal(result.valid, false);
});

test("checkHeapProperty validates a real max-heap array", () => {
  assert.equal(checkHeapProperty("max", [9, 5, 7, 1, 2]).valid, true);
});
