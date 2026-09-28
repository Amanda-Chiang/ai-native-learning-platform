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

  // Zipped by index rather than looked up from a `Map<courseId, ...>`:
  // `layoutIslands` produces exactly one placement per input course, in
  // the same order it was given them, so `placements[i]` and
  // `courses[i]` always describe the same course. Pairing them by
  // index makes that guarantee a type-level fact (no `| undefined` to
  // silently swallow) instead of a runtime lookup that could -- in
  // principle, if `layoutIslands` were ever changed to drop or reorder
  // entries -- come back empty and silently drop an island.
  const islands = placements.map((placement, i) => ({ placement, summary: courses[i] }));

  return (
    <div style={s.canvas}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={s.row}>
          {islands
            .slice(row * ISLANDS_PER_ROW, (row + 1) * ISLANDS_PER_ROW)
            .map(({ placement, summary }) => {
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
              // label instead of a shape -- not a silent fallback, an
              // explicit broken state.
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

              // These are two different failures and must say so: a
              // `failed` summary means the review-status READ failed
              // (the due queue query errored); `corrupt` means the
              // read succeeded fine and the STORED SHAPE INDEX is the
              // thing with no entry in the shape library. Collapsing
              // them into one "review status could not be loaded"
              // message (as this used to) would misreport a shape-data
              // problem as a review-data problem.
              const brokenLabel = failed
                ? `${summary.courseName} — review status could not be loaded`
                : corrupt
                  ? `${summary.courseName} — island shape could not be loaded`
                  : summary.courseName;

              return (
                <Link
                  key={placement.courseId}
                  href={`/courses/${placement.courseId}`}
                  style={{
                    ...s.island,
                    left: `${placement.leftPercent}%`,
                    top: `${placement.topPercent}%`,
                  }}
                  aria-label={brokenLabel}
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
                  {broken && (
                    <span style={s.failed}>
                      {failed ? "Couldn't load" : "Unknown shape"}
                    </span>
                  )}
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
