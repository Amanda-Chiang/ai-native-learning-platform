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

              // shapeForIndex throws when a course's stored
              // islandShapeIndex has no entry in the shape library --
              // correct, because rendering shape 0 instead would show
              // a plausible island for a course whose real shape is
              // unknown (island-shapes.ts). But this component renders
              // inside a server component, so letting that throw
              // propagate would take down the WHOLE Home page over one
              // corrupt row. Caught here and scoped to just this
              // island: it renders with a neutral fill and a visible
              // "couldn't load" label instead of a shape, the same
              // treatment a `failed` due-queue read already gets --
              // not a silent fallback, an explicit broken state.
              let shapePath: string | null = null;
              let corrupt = false;
              if (!failed) {
                try {
                  shapePath = shapeForIndex(summary.islandShapeIndex).path;
                } catch {
                  corrupt = true;
                }
              }
              const broken = failed || corrupt;

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
                    broken
                      ? `${summary.courseName} — review status could not be loaded`
                      : summary.courseName
                  }
                >
                  <svg viewBox={ISLAND_VIEWBOX} width="88" height="88" aria-hidden="true">
                    {shapePath ? (
                      <path
                        d={shapePath}
                        fill={islandColorForCourseId(summary.courseId)}
                        stroke="var(--border)"
                        strokeWidth="1.5"
                      />
                    ) : (
                      <rect x="8" y="8" width="84" height="84" rx="12" fill="var(--border)" stroke="var(--border-strong)" strokeWidth="1.5" />
                    )}
                  </svg>
                  <span style={s.name}>{summary.courseName}</span>
                  {broken && <span style={s.failed}>Couldn&apos;t load</span>}
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
