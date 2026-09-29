import test from "node:test";
import assert from "node:assert/strict";
import {
  isPassedOutcome,
  statusFor,
  progressPercent,
  sessionScore,
  firstSkippedIndex,
  deepReviewStubLabel,
} from "../../../src/features/review-scheduler/quick-review-state.ts";

const pass = { result: { outcome: "correct" }, error: null };
const fail = { result: { outcome: "incorrect" }, error: null };
const errored = { result: { outcome: "did_not_complete" }, error: "Grading failed" };

test("a code submission reported as graded+allPassed counts as passed", () => {
  assert.equal(isPassedOutcome({ outcome: "graded", allPassed: true }), true);
  assert.equal(isPassedOutcome({ outcome: "graded", allPassed: false }), false);
  assert.equal(isPassedOutcome({ outcome: "correct" }), true);
  assert.equal(isPassedOutcome({ outcome: "incorrect" }), false);
});

test("an item is answered, skipped, or unanswered -- and a failed submission is none of them", () => {
  const results = { c1: pass, c3: errored };
  const skipped = new Set(["c2"]);
  assert.equal(statusFor("c1", results, skipped), "answered");
  assert.equal(statusFor("c2", results, skipped), "skipped");
  assert.equal(statusFor("c4", results, skipped), "unanswered");
  // A submission that errored left no evidence, so it is not answered.
  assert.equal(statusFor("c3", results, skipped), "unanswered");
});

test("progress counts answered items only -- skipping never advances the bar", () => {
  assert.equal(progressPercent(0, 4), 0);
  assert.equal(progressPercent(1, 4), 25);
  assert.equal(progressPercent(4, 4), 100);
  // Rounded, so the bar and the number never disagree visually.
  assert.equal(progressPercent(1, 3), 33);
});

test("progress on an empty session is 0, not NaN", () => {
  assert.equal(progressPercent(0, 0), 0);
});

test("the score counts passes over answered items, ignoring skipped and errored ones", () => {
  const score = sessionScore({ c1: pass, c2: fail, c3: errored }, new Set(["c4"]));
  assert.deepEqual(score, { correct: 1, answered: 2, skipped: 1 });
});

test("the skip dialog jumps to the first skipped item in session order", () => {
  const ids = ["c1", "c2", "c3", "c4"];
  assert.equal(firstSkippedIndex(ids, new Set(["c3", "c2"])), 1);
  assert.equal(firstSkippedIndex(ids, new Set()), null);
});

test("the deep-review stub names the band above the session's weakest concept", () => {
  assert.equal(deepReviewStubLabel(["weak", "solid"]), "Deep review to reach solid");
  assert.equal(deepReviewStubLabel(["unverified", "weak"]), "Deep review to reach exposed");
});

test("with every concept already solid there is no next band, and the stub says so without inventing one", () => {
  assert.equal(deepReviewStubLabel(["solid", "solid"]), "Deep review for extra practice");
});

test("an empty band list returns null rather than a fabricated label", () => {
  assert.equal(deepReviewStubLabel([]), null);
});
