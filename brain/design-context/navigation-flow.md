# Navigation / product flow (current, real)

## Real end-to-end path today

Updated for Orca Phase 2 (bottom nav gained a third entry, and a course
now opens on Concepts instead of Material) — the older per-feature-page
"dead end back to home" framing below still describes real gaps and was
left as-is except where the click-path itself changed. Updated again for
Orca Phase 3 (`/` replaced its Phase 2 `TodayDashboard` with the island
Home — see below and `page-map.md`).

```
/ (Island Home once signed in -- see below; a bare heading if signed out)
  -> /sign-up or /sign-in
       -> /courses                         (post-login landing, no separate dashboard)
            -> "Add class" (CreateCourseModal) -> /courses/{id}
            -> click existing course -> /courses/{id}

Bottom nav (AppShell), three entries, present on every page:
  Today | Courses | Chat
    |-- Today      -> / (label unchanged from Phase 2; now opens Island Home)
    |-- Courses    -> /courses
    `-- Chat       -> /chat -> CoursePicker -> pick a course -> /courses/{id}/tutor
                      (no message input on /chat itself; picking a course
                       is the only action this page offers)

Island Home (/, Orca Phase 3) has two distinct link surfaces per course,
and they go to different places on purpose:
  |-- click an island (IslandCanvas)        -> /courses/{id}        (Concepts)
  `-- rail row's ▷ control (HomeReviewRail) -> /courses/{id}/study  (Study)
      (the ▷ only renders for a "scheduled" row -- a nothing-scheduled
      or failed row has nothing to start, so it has no ▷ at all, not a
      disabled one)
The rail's "Upcoming exams" entries link to
  /courses/{id}/exam-plan?exam={examConfigId}

/courses/{id}  (course now opens on Concepts, not Material)
    |-- CourseShell sub-nav: Concepts | Material | Atlas | Review | Tutor | Exam plan
    |     (this <nav> is the ONLY link surface into the other 5 feature pages --
    |      nothing else in the app links to them)
    |
    |-- /courses/{id}                (Concepts: ConceptPath + DueRail, both ▷
    |                                 controls disabled with a visible reason)
    |-- /courses/{id}/material       (file upload; status updates live --
    |                                 this is where course detail used to live)
    |-- /courses/{id}/atlas          (dead end: no links out except browser back /
    |                                 header link to "/")
    |-- /courses/{id}/review         (same: dead end back to "/")
    |-- /courses/{id}/tutor          (same: dead end back to "/")
    |-- /courses/{id}/study          (same: dead end back to "/",
    |                                 except when a due question is a
    |                                 graph/tree checker-domain question,
    |                                 which routes into visual-assessment)
    |-- /courses/{id}/exam-plan      (same: dead end back to "/")
    |
    `-- /courses/{id}/visual-assessment/{questionId}
        (only reachable from inside a Study or Exam-plan session right now --
         no direct nav link, no back-to-course-detail link)
```

## Real gaps this exposes (worth the design pass fixing, not just skinning)

1. **No cross-links between the 5 feature pages.** A student on Atlas has
   no way to jump straight to Study or Tutor except going back to course
   detail first. Whether that's the intended IA (course detail as a
   mandatory hub) or should become a persistent sub-nav across all 5
   pages is a real open design question for whoever designs this next.
2. **No breadcrumb / "back to course" link** on any of the 5 feature
   pages — only the global header's link back to `/`, which also drops
   the course context entirely (`/` isn't "my courses", it's the
   marketing/landing page).
3. **Visual Assessment has no direct entry point** — it's an
   interstitial inside Study/Exam-plan, not a page a student navigates
   to on its own. Any redesign should treat it as embedded-in-session UI,
   not a standalone destination with its own nav needs.
4. **`/` still conflates two page types.** Orca Phase 3 gave the
   signed-in state real content (Island Home), but a signed-out visitor
   still gets a one-line placeholder heading on the same route — there is
   still no real logged-out landing/marketing page, just a different
   render branch of the same component. `/` vs `/courses` (post-login
   landing) remain two separate concepts sharing awkward naming.

## What's deliberately NOT part of the navigation model

- No search, no global command palette, no notifications surface.
- No settings/profile page exists at all yet.
- No multi-course cross-navigation (e.g. "switch course" dropdown) —
  switching course means going back to `/courses` and picking again.
