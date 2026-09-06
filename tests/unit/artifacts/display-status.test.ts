import test from "node:test";
import assert from "node:assert/strict";
import {
  getDisplayStatus,
  type DisplayStatusInputArtifact,
  type DisplayStatusInputExtraction,
} from "../../../src/features/artifacts/display-status.ts";

function artifact(status: DisplayStatusInputArtifact["status"], failureReason: string | null = null) {
  return { status, failureReason };
}

function extraction(
  status: DisplayStatusInputExtraction["status"],
  overrides: Partial<DisplayStatusInputExtraction> = {},
): DisplayStatusInputExtraction {
  return {
    status,
    failureReason: null,
    conceptsExtracted: 0,
    unitsCreatedOrMatched: 0,
    ...overrides,
  };
}

test("a failed upload reports the upload's own failure reason", () => {
  const display = getDisplayStatus(artifact("failed", "File was not a readable PDF."), undefined);

  assert.equal(display.label, "Upload failed");
  assert.equal(display.failureReason, "File was not a readable PDF.");
  assert.equal(display.counts, null);
});

test("a still-uploading artifact shows its upload stage, never an extraction label", () => {
  assert.equal(getDisplayStatus(artifact("queued"), undefined).label, "Queued");
  assert.equal(getDisplayStatus(artifact("processing"), undefined).label, "Processing…");
});

test("a ready artifact with NO extraction run is distinguishable from one being extracted", () => {
  const noRun = getDisplayStatus(artifact("ready"), undefined);
  const running = getDisplayStatus(artifact("ready"), extraction("queued"));

  // The whole point: an artifact whose extraction was never enqueued must
  // not read as "Extracting…" forever (design goal 5 -- a failure is never
  // indistinguishable from still processing).
  assert.equal(noRun.label, "Not yet queued");
  assert.notEqual(noRun.label, running.label);
});

test("a queued or processing extraction run both read as 'Extracting…'", () => {
  assert.equal(getDisplayStatus(artifact("ready"), extraction("queued")).label, "Extracting…");
  assert.equal(getDisplayStatus(artifact("ready"), extraction("processing")).label, "Extracting…");
});

test("a completed run reports Ready with the real counts, not a fabricated one", () => {
  const display = getDisplayStatus(
    artifact("ready"),
    extraction("completed", { conceptsExtracted: 7, unitsCreatedOrMatched: 2 }),
  );

  assert.equal(display.label, "Ready");
  assert.deepEqual(display.counts, { conceptsExtracted: 7, unitsCreatedOrMatched: 2 });
  assert.equal(display.failureReason, null);
});

test("a failed extraction is worded distinctly from a failed upload and carries the run's reason", () => {
  const uploadFailure = getDisplayStatus(artifact("failed", "bad file"), undefined);
  const extractionFailure = getDisplayStatus(
    artifact("ready"),
    extraction("failed", { failureReason: "OpenAI rate limit hit." }),
  );

  assert.notEqual(extractionFailure.label, uploadFailure.label);
  assert.equal(extractionFailure.label, "Extraction failed");
  assert.equal(extractionFailure.failureReason, "OpenAI rate limit hit.");
  assert.equal(extractionFailure.counts, null);
});
