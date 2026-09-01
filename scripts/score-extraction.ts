#!/usr/bin/env node
/**
 * FR-013/SC-001, research.md "Extraction scoring": runs extraction
 * against every benchmark/dsa-course/ artifact that has a matching
 * sources/*.md file, scores the result against concepts.json/edges.json,
 * and reports precision/recall -- Constitution Principle IV's
 * "offline-scoreable, not eyeballed" requirement.
 *
 * Reuses the exact production extraction call (openai-extraction-call.ts)
 * and reconciliation matching logic (reconciliation.ts) rather than a
 * parallel reimplementation that could quietly drift from what actually
 * runs in trigger/extract-course-graph.ts.
 *
 * Usage: OPENAI_API_KEY=... npx tsx scripts/score-extraction.ts
 *   (or: node --experimental-strip-types scripts/score-extraction.ts,
 *   matching this project's Node 24 native-TS convention elsewhere)
 *
 * Exits non-zero only if aggregate recall regresses from the last
 * recorded baseline (scripts/extraction-score-baseline.json) -- there is
 * no fixed target number this project has real calibration data to
 * justify yet (research.md), so this is regression detection, not a
 * pass/fail threshold.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  parseExtractionResult,
  type CandidateConcept,
  type ExtractionResult,
} from "../src/features/course-graph-ingestion/extraction-schema.ts";
import { EXTRACTION_PROMPT, callExtractionModel } from "../src/features/course-graph-ingestion/openai-extraction-call.ts";
import {
  reconcileConcept,
  createOpenAiReconciliationClassifier,
  type ExistingConceptSummary,
} from "../src/features/course-graph-ingestion/reconciliation.ts";
import type { CourseConcept, ConceptEdge } from "../src/types/domain/index.ts";

const CORPUS_DIR = path.join(import.meta.dirname, "..", "benchmark", "dsa-course");
const BASELINE_PATH = path.join(import.meta.dirname, "extraction-score-baseline.json");
const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4.1";

type ArtifactMeta = { id: string; title: string };

type ArtifactScore = {
  artifactId: string;
  conceptsExtracted: number;
  conceptsExpected: number;
  conceptsMatched: number;
  edgesExtracted: number;
  edgesExpected: number;
  edgesMatched: number;
};

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function conceptNameOrAliasMatches(candidate: CandidateConcept, expected: CourseConcept): boolean {
  const candidateNames = [candidate.canonicalName, ...candidate.aliases];
  const expectedNames = [expected.canonicalName, ...expected.aliases];
  return candidateNames.some((c) => expectedNames.some((e) => namesMatch(c, e)));
}

async function matchConceptsForArtifact(
  candidates: CandidateConcept[],
  expected: CourseConcept[],
  classify: ReturnType<typeof createOpenAiReconciliationClassifier>,
): Promise<{ localIdToExpectedId: Map<string, string>; matchedExpectedIds: Set<string> }> {
  const existingSummaries: ExistingConceptSummary[] = expected.map((c) => ({
    id: c.id,
    canonicalName: c.canonicalName,
    aliases: c.aliases,
    description: c.description,
  }));

  const localIdToExpectedId = new Map<string, string>();
  const matchedExpectedIds = new Set<string>();

  for (const candidate of candidates) {
    const exact = expected.find((e) => conceptNameOrAliasMatches(candidate, e));
    if (exact) {
      localIdToExpectedId.set(candidate.localId, exact.id);
      matchedExpectedIds.add(exact.id);
      continue;
    }

    if (existingSummaries.length === 0) {
      continue;
    }

    // No exact name/alias match -- fall back to the same reconciliation
    // call production code uses (research.md: "the reconciliation step
    // itself would classify them as a match", not a second, different
    // matching algorithm).
    const result = await reconcileConcept(
      classify,
      { canonicalName: candidate.canonicalName, aliases: candidate.aliases, description: candidate.description },
      existingSummaries,
    );
    if (result.decision === "merge") {
      localIdToExpectedId.set(candidate.localId, result.matchedConceptId);
      matchedExpectedIds.add(result.matchedConceptId);
    }
  }

  return { localIdToExpectedId, matchedExpectedIds };
}

function scoreEdgesForArtifact(
  candidateEdges: ExtractionResult["edges"],
  expectedEdges: ConceptEdge[],
  localIdToExpectedId: Map<string, string>,
): number {
  let matched = 0;
  const consumedExpectedIds = new Set<string>();

  for (const edge of candidateEdges) {
    const sourceExpectedId = localIdToExpectedId.get(edge.sourceLocalId);
    const targetExpectedId = localIdToExpectedId.get(edge.targetLocalId);
    if (!sourceExpectedId || !targetExpectedId) continue;

    const match = expectedEdges.find(
      (e) =>
        !consumedExpectedIds.has(e.id) &&
        e.sourceConceptId === sourceExpectedId &&
        e.targetConceptId === targetExpectedId &&
        e.relationType === edge.relationType,
    );
    if (match) {
      matched += 1;
      consumedExpectedIds.add(match.id);
    }
  }

  return matched;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set -- cannot run extraction against the benchmark corpus.");
    process.exitCode = 1;
    return;
  }

  const [artifactsRaw, conceptsRaw, edgesRaw] = await Promise.all([
    readFile(path.join(CORPUS_DIR, "artifacts.json"), "utf-8"),
    readFile(path.join(CORPUS_DIR, "concepts.json"), "utf-8"),
    readFile(path.join(CORPUS_DIR, "edges.json"), "utf-8"),
  ]);

  const artifacts: ArtifactMeta[] = JSON.parse(artifactsRaw);
  const allConcepts: CourseConcept[] = JSON.parse(conceptsRaw);
  const allEdges: ConceptEdge[] = JSON.parse(edgesRaw);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const classify = createOpenAiReconciliationClassifier(openai, EXTRACTION_MODEL);

  const scores: ArtifactScore[] = [];

  for (const artifact of artifacts) {
    const sourcePath = path.join(CORPUS_DIR, "sources", `${artifact.id}.md`);
    let sourceText: string;
    try {
      sourceText = await readFile(sourcePath, "utf-8");
    } catch {
      console.warn(`Skipping "${artifact.id}" -- no source file at ${sourcePath}.`);
      continue;
    }

    const expectedConcepts = allConcepts.filter((c) =>
      c.sourceAnchors.some((a) => a.artifactId === artifact.id),
    );
    const expectedEdges = allEdges.filter((e) => e.sourceAnchors.some((a) => a.artifactId === artifact.id));

    console.log(`Extracting "${artifact.title}" (${artifact.id})...`);
    const raw = await callExtractionModel(openai, EXTRACTION_MODEL, [
      { type: "input_text", text: `${EXTRACTION_PROMPT}\n\n---\n\n${sourceText}` },
    ]);
    const extraction = parseExtractionResult(raw);

    const { localIdToExpectedId, matchedExpectedIds } = await matchConceptsForArtifact(
      extraction.concepts,
      expectedConcepts,
      classify,
    );
    const edgesMatched = scoreEdgesForArtifact(extraction.edges, expectedEdges, localIdToExpectedId);

    scores.push({
      artifactId: artifact.id,
      conceptsExtracted: extraction.concepts.length,
      conceptsExpected: expectedConcepts.length,
      conceptsMatched: matchedExpectedIds.size,
      edgesExtracted: extraction.edges.length,
      edgesExpected: expectedEdges.length,
      edgesMatched,
    });
  }

  if (scores.length === 0) {
    console.error("No artifacts had a matching source file -- nothing was scored.");
    process.exitCode = 1;
    return;
  }

  const totals = scores.reduce(
    (acc, s) => ({
      conceptsExtracted: acc.conceptsExtracted + s.conceptsExtracted,
      conceptsExpected: acc.conceptsExpected + s.conceptsExpected,
      conceptsMatched: acc.conceptsMatched + s.conceptsMatched,
      edgesExtracted: acc.edgesExtracted + s.edgesExtracted,
      edgesExpected: acc.edgesExpected + s.edgesExpected,
      edgesMatched: acc.edgesMatched + s.edgesMatched,
    }),
    { conceptsExtracted: 0, conceptsExpected: 0, conceptsMatched: 0, edgesExtracted: 0, edgesExpected: 0, edgesMatched: 0 },
  );

  // A rate with a zero denominator is not "1.0" or "0" -- it's not a
  // meaningful number at all, and reporting one anyway would be exactly
  // the kind of confident-looking placeholder this project has decided
  // against. Reported as null / "n/a" instead of a fabricated rate.
  const rate = (numerator: number, denominator: number): number | null =>
    denominator === 0 ? null : numerator / denominator;

  const conceptPrecision = rate(totals.conceptsMatched, totals.conceptsExtracted);
  const conceptRecall = rate(totals.conceptsMatched, totals.conceptsExpected);
  const edgePrecision = rate(totals.edgesMatched, totals.edgesExtracted);
  const edgeRecall = rate(totals.edgesMatched, totals.edgesExpected);

  console.log("\nPer-artifact:");
  for (const s of scores) {
    console.log(
      `  ${s.artifactId}: concepts ${s.conceptsMatched}/${s.conceptsExpected} expected (${s.conceptsExtracted} extracted); edges ${s.edgesMatched}/${s.edgesExpected} expected (${s.edgesExtracted} extracted)`,
    );
  }

  const fmt = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
  console.log("\nAggregate:");
  console.log(`  Concept precision: ${fmt(conceptPrecision)}, recall: ${fmt(conceptRecall)}`);
  console.log(`  Edge precision: ${fmt(edgePrecision)}, recall: ${fmt(edgeRecall)}`);

  type Baseline = { conceptRecall: number | null; edgeRecall: number | null; recordedAt: string };
  let baseline: Baseline | null = null;
  try {
    baseline = JSON.parse(await readFile(BASELINE_PATH, "utf-8"));
  } catch {
    // No baseline yet -- first run establishes one, same bootstrapping
    // pattern as Playwright's first-run screenshot baseline.
  }

  const newBaseline: Baseline = { conceptRecall, edgeRecall, recordedAt: new Date().toISOString() };

  if (!baseline) {
    await writeFile(BASELINE_PATH, JSON.stringify(newBaseline, null, 2) + "\n");
    console.log(`\nNo prior baseline found -- recorded this run as the new baseline at ${BASELINE_PATH}.`);
    return;
  }

  const conceptRegressed =
    baseline.conceptRecall !== null && (conceptRecall === null || conceptRecall < baseline.conceptRecall);
  const edgeRegressed = baseline.edgeRecall !== null && (edgeRecall === null || edgeRecall < baseline.edgeRecall);

  if (conceptRegressed || edgeRegressed) {
    console.error(
      `\nRegression: concept recall ${fmt(conceptRecall)} (was ${fmt(baseline.conceptRecall)}), edge recall ${fmt(edgeRecall)} (was ${fmt(baseline.edgeRecall)}).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nNo regression vs. baseline recorded ${baseline.recordedAt} (concept recall was ${fmt(baseline.conceptRecall)}, edge recall was ${fmt(baseline.edgeRecall)}). Baseline left unchanged -- pass --save to update it.`,
  );

  if (process.argv.includes("--save")) {
    await writeFile(BASELINE_PATH, JSON.stringify(newBaseline, null, 2) + "\n");
    console.log(`Baseline updated at ${BASELINE_PATH}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
