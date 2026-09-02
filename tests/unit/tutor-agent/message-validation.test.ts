import test from "node:test";
import assert from "node:assert/strict";
import { validateStudentMessage, MAX_STUDENT_MESSAGE_LENGTH } from "../../../src/features/tutor-agent/message-validation.ts";

test("an empty or whitespace-only message is rejected", () => {
  assert.equal(validateStudentMessage("").valid, false);
  assert.equal(validateStudentMessage("   ").valid, false);
});

test("a normal-length message is accepted, trimmed", () => {
  const result = validateStudentMessage("  What is a queue?  ");
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.trimmed, "What is a queue?");
});

test("a message over the max length is rejected", () => {
  const tooLong = "a".repeat(MAX_STUDENT_MESSAGE_LENGTH + 1);
  const result = validateStudentMessage(tooLong);
  assert.equal(result.valid, false);
});

test("a message at exactly the max length is accepted", () => {
  const exact = "a".repeat(MAX_STUDENT_MESSAGE_LENGTH);
  assert.equal(validateStudentMessage(exact).valid, true);
});
