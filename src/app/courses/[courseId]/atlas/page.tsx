import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConceptAtlas } from "@/features/concept-atlas/components/ConceptAtlas.tsx";
import type { CourseGraph } from "@/types/graph/course-graph.ts";

/**
 * Loads the checked-in demo fixture as the CourseGraph, per spec.md
 * Assumptions -- real per-course data is course-graph-ingestion's job,
 * built after this feature. Server Component: reads the fixture file
 * directly rather than a deep relative import, so this doesn't need to
 * change if the fixture ever moves.
 */
async function loadDemoCourseGraph(): Promise<CourseGraph> {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/concept-atlas-demo.json");
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as CourseGraph;
}

export default async function CourseAtlasPage() {
  const graph = await loadDemoCourseGraph();

  return (
    <main>
      <h1>Concept Atlas</h1>
      <ConceptAtlas graph={graph} />
    </main>
  );
}
