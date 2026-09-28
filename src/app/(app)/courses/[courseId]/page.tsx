import { listUnits } from "@/features/course-graph-ingestion/actions.ts";
import { getDueQueue } from "@/features/review-scheduler/due-queue.ts";
import { listCourseConceptsWithMastery } from "@/features/courses/concept-path-actions.ts";
import { groupConceptsByUnit } from "@/features/courses/concept-path.ts";
import { ConceptPath } from "@/features/courses/components/ConceptPath.tsx";
import { DueRail } from "@/features/courses/components/DueRail.tsx";

export default async function CourseConceptsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  // "demo" is a fixture route id, not a real course row (see
  // material/page.tsx's own courseId === "demo" branch) -- it isn't a
  // UUID, so listCourseConceptsWithMastery's `.eq("course_id", "demo")`
  // errors and (correctly, by the no-silent-placeholders rule) the
  // action throws, which would crash this page. Unlike the material and
  // atlas demo branches, there is no checked-in concept-path fixture to
  // stand in here, and inventing plausible-looking concept/mastery data
  // for a course that was never really ingested would itself be the
  // silent placeholder this project's rules forbid. So this branch
  // shows an explicit, honest "no concept data for this route" state
  // instead of fabricating one.
  if (courseId === "demo") {
    return (
      <div style={s.page}>
        <div style={s.outer}>
          <h1 style={s.heading}>Concepts</h1>
          <p style={s.demoNotice}>
            The demo course is a fixture for visual QA of the Review Queue and Concept Atlas. It has no concept
            data of its own, so there is nothing to show here.
          </p>
        </div>
      </div>
    );
  }

  const [concepts, units, dueItems] = await Promise.all([
    listCourseConceptsWithMastery(courseId),
    listUnits(courseId),
    getDueQueue(courseId),
  ]);

  const sections = groupConceptsByUnit(
    concepts,
    units.map((u) => ({ id: u.id, title: u.title })),
  );

  return (
    <div style={s.page}>
      <div style={s.outer}>
        <h1 style={s.heading}>Concepts</h1>
        <div style={s.inner}>
          <ConceptPath sections={sections} />
          <DueRail items={dueItems} />
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100%",
    overflowY: "auto",
    background: "var(--bg)",
    padding: "36px 40px",
    display: "flex",
    justifyContent: "center",
  },
  outer: { width: "100%", maxWidth: 900, display: "flex", flexDirection: "column", gap: 24 },
  heading: { margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--text-primary)" },
  inner: { width: "100%", display: "flex", gap: 32, alignItems: "flex-start" },
  demoNotice: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55, letterSpacing: "-0.005em" },
};
