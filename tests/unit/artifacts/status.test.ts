import test from "node:test";
import assert from "node:assert/strict";
import { isValidStatusTransition, validateUpload } from "../../../src/features/artifacts/status.ts";

test("queued -> processing is a valid transition", () => {
  assert.equal(isValidStatusTransition("queued", "processing"), true);
});

test("processing -> ready is a valid transition", () => {
  assert.equal(isValidStatusTransition("processing", "ready"), true);
});

test("processing -> failed is a valid transition", () => {
  assert.equal(isValidStatusTransition("processing", "failed"), true);
});

test("queued -> ready is rejected (skips the processing state)", () => {
  assert.equal(isValidStatusTransition("queued", "ready"), false);
});

test("queued -> failed is rejected (skips the processing state)", () => {
  assert.equal(isValidStatusTransition("queued", "failed"), false);
});

test("ready is terminal: no transition out of it is valid", () => {
  assert.equal(isValidStatusTransition("ready", "processing"), false);
  assert.equal(isValidStatusTransition("ready", "failed"), false);
  assert.equal(isValidStatusTransition("ready", "queued"), false);
});

test("failed is terminal: no transition out of it is valid", () => {
  assert.equal(isValidStatusTransition("failed", "processing"), false);
  assert.equal(isValidStatusTransition("failed", "ready"), false);
  assert.equal(isValidStatusTransition("failed", "queued"), false);
});

test("a status never transitions to itself", () => {
  assert.equal(isValidStatusTransition("queued", "queued"), false);
  assert.equal(isValidStatusTransition("processing", "processing"), false);
});

test("a supported PDF within the size limit passes upload validation", () => {
  const result = validateUpload("application/pdf", 5_000_000);
  assert.equal(result.valid, true);
});

test("a supported image within the size limit passes upload validation", () => {
  const result = validateUpload("image/png", 1_000_000);
  assert.equal(result.valid, true);
});

test("an unsupported mime type is rejected with a human-readable reason", () => {
  const result = validateUpload("application/x-executable", 1000);
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.reason, /type/i);
  }
});

test("a file over the size limit is rejected with a human-readable reason", () => {
  const result = validateUpload("application/pdf", 100_000_000);
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.reason, /size|large|MB/i);
  }
});

test("a zero-byte file is rejected", () => {
  const result = validateUpload("application/pdf", 0);
  assert.equal(result.valid, false);
});
