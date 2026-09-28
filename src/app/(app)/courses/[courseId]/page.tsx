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
      <div style={s.inner}>
        <ConceptPath sections={sections} />
        <DueRail items={dueItems} />
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
  inner: { width: "100%", maxWidth: 900, display: "flex", gap: 32, alignItems: "flex-start" },
};
