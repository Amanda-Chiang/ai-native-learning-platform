import Link from "next/link";
import { createCourse } from "@/features/courses/actions.ts";
import { CreateCourseModal } from "@/features/courses/components/CreateCourseModal.tsx";
import { IslandCanvas } from "@/features/courses/components/IslandCanvas.tsx";
import { HomeReviewRail } from "@/features/courses/components/HomeReviewRail.tsx";
import { orderByCreatedAt, type HomeOverview } from "@/features/courses/home-summary.ts";

/**
 * Side-by-side on desktop, stacked (islands above the rail) below
 * 768px -- the same shared breakpoint ConceptDetailPanel/ConceptAtlas
 * already use for their own panel/sheet switch, so there's one
 * viewport threshold across the app rather than independently-tuned
 * copies that can drift.
 *
 * `flex-direction` lives here in CSS, not as a JS-computed inline
 * value, because `.inner` has no inline `flexDirection` to begin with
 * (row is the flexbox default) -- so a class-based override is never
 * fighting a same-named inline property, the same reasoning
 * HomeReviewRail's own `.home-review-rail` class documents for the
 * properties it DOES have to keep out of the inline object. Doing this
 * in pure CSS (an injected `<style>` block) rather than a
 * useMobileBreakpoint() JS hook keeps IslandHome a server component --
 * no client-side breakpoint hook, no hydration flash between server
 * and client render.
 *
 * Mobile's gap reuses 20, the same value `main`'s own internal gap
 * already uses elsewhere in this file, instead of introducing an
 * unrelated third spacing number.
 *
 * `.island-home-main`'s `flex` and `min-height` both flip at the
 * breakpoint, for two compounding reasons found by testing this fix
 * against the mobile baseline (recorded in architecture-log.md's
 * Phase 3 entry):
 *
 * 1. `main`'s desktop `flex: 1` is shorthand for `1 1 0%` -- a 0%
 *    flex-basis. Stacked next to `.home-review-rail`'s own content
 *    (which, below 768px, sizes to an explicit `max-height` -- see
 *    that file's comment for why a flex-shrink-based split was tried
 *    and abandoned), a 0% basis told the flex algorithm `main` had
 *    nothing worth protecting, and it collapsed to a literal 0px --
 *    the header and every island vanished. `1 1 auto` fixes that by
 *    seeding the calculation with `main`'s own real content size.
 * 2. `flex: 1 1 auto` alone still isn't enough, because `main` also
 *    carries its own `overflowY: "auto"` (so it can scroll internally
 *    when there are many island rows) -- and per spec, an item whose
 *    own overflow isn't `visible` gets an automatic minimum size of 0
 *    instead of a content-based one, REGARDLESS of its `flex-basis`.
 *    `main` needs an explicit `min-height` instead: 256px is the
 *    header's real measured height
 *    (36px) plus its gap to the canvas (20px, `s.main`'s own `gap`)
 *    plus one island row (200px, `IslandCanvas.tsx`'s `row.height`) --
 *    so at least the header and one row of islands are always visible
 *    on mobile without scrolling, even if a long rail below it pushes
 *    the rest past the fold (`page`'s `overflowY: "auto"` reaches it).
 */
const HOME_RESPONSIVE_STYLE = `
  .island-home-main {
    flex: 1;
  }
  @media (max-width: 768px) {
    .island-home-inner {
      flex-direction: column;
      gap: 20px;
    }
    .island-home-main {
      flex: 1 1 auto;
      min-height: 256px;
    }
  }
`;

export function IslandHome({ overview }: { overview: HomeOverview }) {
  // Distinct from "signed in, zero courses" below: a signed-out
  // visitor cannot create a course (createCourse rejects with no
  // session), so this state points at sign-in instead of offering a
  // create button that would fail on submit.
  if (overview.kind === "signed-out") {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.quiet}>Sign in to see your courses.</p>
          <Link href="/sign-in" style={s.signInLink}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  // A failed course list must never render as "no courses yet": that
  // would tell a student with twelve courses they have none.
  if (overview.kind === "courses-unavailable") {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.failed}>Your courses couldn&apos;t be loaded: {overview.reason}</p>
        </div>
      </div>
    );
  }

  if (overview.courses.length === 0) {
    return (
      <div style={s.page}>
        <div style={s.centered}>
          <h1 style={s.heading}>Welcome to Orca.</h1>
          <p style={s.quiet}>Add a class to get started.</p>
          <CreateCourseModal createCourse={createCourse} />
        </div>
      </div>
    );
  }

  // The canvas and the rail deliberately render the SAME set of
  // courses in DIFFERENT orders. `overview.courses` is due-date order
  // (home-overview.ts's `orderSummaries`) -- right for the rail, wrong
  // for the canvas: island-layout.ts derives each island's grid cell
  // from array ordinal, so feeding it due-date order would relocate a
  // course's island every time its due date changes. `orderByCreatedAt`
  // gives the canvas the one ordinal that never changes after a course
  // is created.
  const canvasCourses = orderByCreatedAt(overview.courses);

  return (
    <div style={s.page}>
      <style>{HOME_RESPONSIVE_STYLE}</style>
      <div className="island-home-inner" style={s.inner}>
        <div className="island-home-main" style={s.main}>
          <div style={s.header}>
            <h1 style={s.heading}>Welcome back.</h1>
            <CreateCourseModal createCourse={createCourse} />
          </div>
          <IslandCanvas courses={canvasCourses} />
        </div>
        <HomeReviewRail courses={overview.courses} exams={overview.exams} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  // overflowY: "auto" is the last-resort fallback: normally `main` and
  // the rail (HomeReviewRail.tsx) each render at their own natural,
  // content-defined floor (header + islands; both headings + every
  // exam row) and split whatever space is left. It only matters when
  // even those two floors together are taller than a very short phone
  // -- without it that combination would clip the overflow via
  // AppShell's own `outlet: { overflow: "hidden" }` with no way to
  // reach it, the "pushed off-screen with no way back" failure mode
  // this fix exists to rule out.
  page: { height: "100%", background: "var(--bg)", padding: "36px 40px", display: "flex", justifyContent: "center", overflowY: "auto" },
  inner: { width: "100%", maxWidth: 1000, display: "flex", gap: 32, alignItems: "stretch", minHeight: 0 },
  // `flex` and `minHeight` are NOT set here -- HOME_RESPONSIVE_STYLE's
  // `.island-home-main` class owns both (see its comment) so the
  // breakpoint can actually take effect; an inline value here would
  // always beat the class rule and silently defeat it.
  main: { minWidth: 0, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 },
  centered: { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  heading: { margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--text-primary)" },
  quiet: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" },
  failed: { margin: 0, fontSize: 13.5, color: "var(--status-warning)" },
  signInLink: { fontSize: 13.5, fontWeight: 500, color: "var(--accent)", textDecoration: "none" },
};
