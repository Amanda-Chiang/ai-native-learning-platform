import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConceptAtlas } from "@/features/concept-atlas/components/ConceptAtlas.tsx";
import { submitConceptAtlasFlag } from "@/features/course-graph-ingestion/actions.ts";
import { getCourseGraphForLearner, getEvidenceProvenance } from "@/features/learner-graph-evidence/actions.ts";
import type { CourseGraph } from "@/types/graph/course-graph.ts";
import type { EvidenceProvenance } from "@/features/concept-atlas/components/ConceptDetailPanel.tsx";

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

/**
 * A fixed, checked-in provenance for one demo concept ("Big-O Notation")
 * -- same reasoning as loadDemoCourseGraph's own fixture special case:
 * concept-atlas-renderer's visual suite needs a deterministic,
 * non-live-database "real evidence provenance displayed" scenario
 * (tasks.md T020), and the demo route has no real student account or
 * evidence_events behind it to query. Every other concept/relationship
 * on the demo route honestly reports null (no evidence recorded), not a
 * fabricated value.
 */
async function demoEvidenceProvenance(
  kind: "concept" | "relationship",
  id: string,
): Promise<EvidenceProvenance> {
  "use server";
  if (kind === "concept" && id === "c-big-o") {
    return Promise.resolve({ lastEvidenceType: "retrieval", lastEvidenceAt: "2026-08-20T00:00:00.000Z" });
  }
  return Promise.resolve(null);
}

export default async function CourseAtlasPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const graph = courseId === "demo" ? await loadDemoCourseGraph() : await getCourseGraphForLearner(courseId);

  return (
    <main>
      <h1>Concept Atlas</h1>
      <ConceptAtlas
        graph={graph}
        courseId={courseId}
        onFlag={submitConceptAtlasFlag}
        getEvidenceProvenance={
          courseId === "demo"
            ? demoEvidenceProvenance
            : // Found live (basic-flows.spec.ts's first real run against
              // a non-demo course): a plain inline arrow closure has no
              // "use server" reference of its own, so React's RSC
              // boundary rejects passing it to a Client Component at
              // all -- unlike demoEvidenceProvenance above, this branch
              // was never actually exercised by the demo-route-only
              // visual regression suite, so the whole real (non-demo)
              // atlas page was silently broken until now. An inline
              // "use server" directive as the function's first
              // statement makes it a real server reference, the same
              // way demoEvidenceProvenance already is.
              async (kind: "concept" | "relationship", id: string) => {
                "use server";
                return getEvidenceProvenance(kind, courseId, id);
              }
        }
      />
    </main>
  );
}
