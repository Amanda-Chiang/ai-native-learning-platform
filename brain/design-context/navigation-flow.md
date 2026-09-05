# Navigation / product flow (current, real)

## Real end-to-end path today

```
/ (landing)
  -> /sign-up or /sign-in
       -> /courses                         (post-login landing, no separate dashboard)
            -> create course -> /courses/{id}
            -> click existing course -> /courses/{id}

/courses/{id}  (course detail = material upload + hub nav)
    |-- upload material (stays on this page; status updates live)
    |-- nav: Concept atlas | Review queue | Tutor | Study | Exam plan
    |     (this <nav> is the ONLY link surface into the 5 feature pages --
    |      nothing else in the app links to them)
    |
    |-- /courses/{id}/atlas         (dead end: no links out except browser back /
    |                                header link to "/")
    |-- /courses/{id}/review        (same: dead end back to "/")
    |-- /courses/{id}/tutor         (same: dead end back to "/")
    |-- /courses/{id}/study         (same: dead end back to "/",
    |                                except when a due question is a
    |                                graph/tree checker-domain question,
    |                                which routes into visual-assessment)
    |-- /courses/{id}/exam-plan     (same: dead end back to "/")
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
4. **Landing page (`/`) is not actually a marketing/product page** — it's
   a one-line placeholder. A real landing page (for a logged-out visitor)
   and "logged-in home" are currently the same route conceptually
   collapsed into two different pages (`/` vs `/courses`), which a design
   pass should treat as two genuinely distinct page *types* even though
   only one of them (`/`) currently has content to design.

## What's deliberately NOT part of the navigation model

- No search, no global command palette, no notifications surface.
- No settings/profile page exists at all yet.
- No multi-course cross-navigation (e.g. "switch course" dropdown) —
  switching course means going back to `/courses` and picking again.
