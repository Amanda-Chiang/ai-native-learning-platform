import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeCourseDue,
  orderSummaries,
} from "../../../src/features/courses/home-summary.ts";

const course = { id: "c1", name: "ALD", islandShapeIndex: 2 };

const item = (daysUntilDue: number, dueLabel: string) => ({
  conceptId: `concept-${daysUntilDue}-${dueLabel}`,
  label: "Concept",
  masteryValue: 0.4,
  daysUntilDue,
  urgencyBucket: daysUntilDue < 0 ? ("overdue" as const) : daysUntilDue <= 1 ? ("today" as const) : ("soon" as const),
  dueLabel,
});

test("a failed read becomes an explicit failed summary, never an empty one", () => {
  const summary = summarizeCourseDue(course, { ok: false, reason: "connection reset" });
  assert.equal(summary.kind, "failed");
  assert.match(summary.kind === "failed" ? summary.reason : "", /connection reset/);
});

test("no due items becomes an explicit nothing-scheduled summary", () => {
  const summary = summarizeCourseDue(course, { ok: true, items: [] });
  assert.equal(summary.kind, "nothing-scheduled");
});

test("the soonest item supplies the label, reusing the queue's own wording", () => {
  const summary = summarizeCourseDue(course, {
    ok: true,
    items: [item(3, "In 3 days"), item(0, "Due today"), item(5, "In 5 days")],
  });
  assert.equal(summary.kind, "scheduled");
  if (summary.kind !== "scheduled") return;
  assert.equal(summary.label, "Due today");
  assert.equal(summary.daysUntilDue, 0);
});

// The truthfulness rule: a count is a claim about work that exists
// right now. A future session's size is a projection that changes the
// moment any evidence is recorded, so a future row carries no count.
test("a count is given for work due now, and withheld for a future date", () => {
  const dueNow = summarizeCourseDue(course, {
    ok: true,
    items: [item(0, "Due today"), item(-2, "Overdue"), item(4, "In 4 days")],
  });
  assert.equal(dueNow.kind === "scheduled" ? dueNow.dueNowCount : null, 2);

  const future = summarizeCourseDue(course, { ok: true, items: [item(4, "In 4 days")] });
  assert.equal(future.kind === "scheduled" ? future.dueNowCount : "unset", null);
});

test("ordering puts the soonest first, then failures, then nothing-scheduled", () => {
  const scheduledIn = (id: string, days: number) =>
    summarizeCourseDue({ id, name: id, islandShapeIndex: 0 }, { ok: true, items: [item(days, `In ${days} days`)] });

  const ordered = orderSummaries([
    summarizeCourseDue({ id: "empty", name: "empty", islandShapeIndex: 0 }, { ok: true, items: [] }),
    scheduledIn("later", 5),
    summarizeCourseDue({ id: "broken", name: "broken", islandShapeIndex: 0 }, { ok: false, reason: "boom" }),
    scheduledIn("sooner", 1),
  ]);

  assert.deepEqual(ordered.map((s) => s.courseId), ["sooner", "later", "broken", "empty"]);
});

test("ordering is stable for two courses due on the same day", () => {
  const a = summarizeCourseDue({ id: "a", name: "a", islandShapeIndex: 0 }, { ok: true, items: [item(2, "In 2 days")] });
  const b = summarizeCourseDue({ id: "b", name: "b", islandShapeIndex: 0 }, { ok: true, items: [item(2, "In 2 days")] });
  assert.deepEqual(orderSummaries([a, b]).map((s) => s.courseId), ["a", "b"]);
  assert.deepEqual(orderSummaries([b, a]).map((s) => s.courseId), ["b", "a"]);
});
