import { listArtifacts } from "@/features/artifacts/actions.ts";
import { getReviewQueue, listUnits } from "@/features/course-graph-ingestion/actions.ts";
import { getExtractionStatuses } from "@/features/course-graph-ingestion/extraction-status.ts";
import { UnitsSection } from "@/features/course-graph-ingestion/components/UnitsSection.tsx";
import { ReviewQueue } from "@/features/course-graph-ingestion/components/ReviewQueue.tsx";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const [artifacts, pendingItems, units, extractionStatuses] = await Promise.all([
    listArtifacts(courseId),
    getReviewQueue(courseId),
    listUnits(courseId),
    getExtractionStatuses(courseId),
  ]);

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.section}>
          <h1 style={s.sectionTitle}>Course material</h1>
          <p style={s.sectionDesc}>
            Upload lecture notes, slides, or problem sets. Luminary will extract concepts and build your knowledge
            graph.
          </p>
        </div>

        <UnitsSection
          courseId={courseId}
          initialArtifacts={artifacts}
          initialUnits={units}
          initialExtractionStatuses={extractionStatuses}
        />

        <ReviewQueue items={pendingItems} courseId={courseId} />
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
  inner: {
    width: "100%",
    maxWidth: 600,
    display: "flex",
    flexDirection: "column",
    gap: 32,
  },
  section: { display: "flex", flexDirection: "column", gap: 4 },
  sectionTitle: { margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--text-primary)" },
  sectionDesc: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55, letterSpacing: "-0.005em" },
};
