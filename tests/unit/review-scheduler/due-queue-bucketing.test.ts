import test from "node:test";
import assert from "node:assert/strict";
import { bucketFor } from "../../../src/features/review-scheduler/due-queue-bucketing.ts";

test("a negative daysUntilDue buckets as overdue", () => {
  assert.equal(bucketFor(-1).bucket, "overdue");
  assert.equal(bucketFor(-1).label, "Overdue");
});

test("0 and 1 days bucket as today, with distinct labels", () => {
  assert.equal(bucketFor(0).bucket, "today");
  assert.equal(bucketFor(0).label, "Due today");
  assert.equal(bucketFor(1).bucket, "today");
  assert.equal(bucketFor(1).label, "Due tomorrow");
});

test("2 and 3 days bucket as soon", () => {
  assert.equal(bucketFor(2).bucket, "soon");
  assert.equal(bucketFor(3).bucket, "soon");
});

test("4+ days buckets as upcoming", () => {
  assert.equal(bucketFor(4).bucket, "upcoming");
  assert.equal(bucketFor(30).bucket, "upcoming");
});
