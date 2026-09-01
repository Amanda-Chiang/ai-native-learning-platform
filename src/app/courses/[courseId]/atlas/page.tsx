import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConceptAtlas } from "@/features/concept-atlas/components/ConceptAtlas.tsx";
import { getCourseGraph } from "@/features/course-graph-ingestion/actions.ts";
import type { CourseGraph } from "@/types/graph/course-graph.ts";

/**
 * Loads the checked-in demo fixture as the CourseGraph -- kept as an
 * explicit special case for courseId === "demo" specifically because
 * concept-atlas-renderer's Playwright visual regression suite
 * (tests/visual/concept-atlas.spec.ts) navigates to /courses/demo/atlas
 * and its 5 checked-in baseline screenshots are all generated against
 * this exact fixture's content. Every other courseId goes through
 * getCourseGraph (course-graph-ingestion's contract), which reads real,
 * possibly-empty course data from Supabase -- "demo" is a fixture route
 * for that renderer's own test suite, not a stand-in for "no real data
 * exists yet" (that would be exactly the kind of silent placeholder
 * this project has decided against).
 */
async function loadDemoCourseGraph(): Promise<CourseGraph> {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/concept-atlas-demo.json");
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as CourseGraph;
}

export default async function CourseAtlasPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const graph = courseId === "demo" ? await loadDemoCourseGraph() : await getCourseGraph(courseId);

  return (
    <main>
      <h1>Concept Atlas</h1>
      <ConceptAtlas graph={graph} courseId={courseId} />
    </main>
  );
}
