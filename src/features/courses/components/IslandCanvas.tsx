import Link from "next/link";
import { layoutIslands, ISLANDS_PER_ROW } from "@/features/courses/island-layout.ts";
import { shapeForIndex, islandColorForCourseId, ISLAND_VIEWBOX } from "@/features/courses/island-shapes.ts";
import type { CourseReviewSummary } from "@/features/courses/home-summary.ts";

/**
 * One island per course.
 *
 * The islands encode WHICH COURSE this is -- shape from a stored
 * index, color from the course id -- and nothing else. They
 * deliberately do not represent mastery: turning a course's
 * per-concept evidence into one visual quantity is a real design
 * decision with an evidence-boundary dimension, and this screen does
 * not need it.
 *
 * The shapes are placeholders and are meant to look like placeholders
 * (island-shapes.ts).
 */
export function IslandCanvas({ courses }: { courses: CourseReviewSummary[] }) {
  const { placements, rows } = layoutIslands(courses.map((c) => ({ id: c.courseId })));
  const summaryByCourseId = new Map(courses.map((c) => [c.courseId, c]));

  return (
    <div style={s.canvas}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={s.row}>
          {placements
            .slice(row * ISLANDS_PER_ROW, (row + 1) * ISLANDS_PER_ROW)
            .map((placement) => {
              const summary = summaryByCourseId.get(placement.courseId);
              if (!summary) return null;
              const failed = summary.kind === "failed";

              return (
                <Link
                  key={placement.courseId}
                  href={`/courses/${placement.courseId}`}
                  style={{
                    ...s.island,
                    left: `${placement.leftPercent}%`,
                    top: `${placement.topPercent}%`,
                  }}
                  aria-label={
                    failed
                      ? `${summary.courseName} — review status could not be loaded`
                      : summary.courseName
                  }
                >
                  <svg viewBox={ISLAND_VIEWBOX} width="88" height="88" aria-hidden="true">
                    <path
                      d={shapeForIndex(summary.islandShapeIndex).path}
                      fill={islandColorForCourseId(summary.courseId)}
                      stroke="var(--border)"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <span style={s.name}>{summary.courseName}</span>
                  {failed && <span style={s.failed}>Couldn&apos;t load</span>}
                </Link>
              );
            })}
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  canvas: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  row: { position: "relative", height: 200 },
  island: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    textDecoration: "none",
  },
  name: { fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.01em" },
  failed: { fontSize: 12, color: "var(--status-warning)" },
};
