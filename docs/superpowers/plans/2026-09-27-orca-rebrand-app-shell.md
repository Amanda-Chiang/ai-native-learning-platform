# Orca Rebrand + App Shell (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Orca brand identity (name, palette, placeholder
wordmark) across every existing page, and replace `AppShell`'s left sidebar
with a bottom icon nav bar per the wireframe — pure frontend, no backend or
schema change, no new npm dependency.

**Architecture:** Retint the existing CSS-custom-property token system in
`globals.css` (it already exists under the leftover "Luminary" brand name —
this is a retarget, not a system built from scratch) to derive every color
from the 6 canonical Orca tokens. Split the old, overloaded `--clay` token
(it meant both "primary brand action" *and* "error/incorrect" depending on
which file used it) into two independent concerns: `--accent*` (brand
primary — buttons, active nav, links) and `--status-danger*` (functional —
wrong-answer/error feedback, unrelated to brand color and deliberately kept
red regardless of brand palette, for the same reason `--status-success`
stays green: correct/incorrect is a near-universal, partly
accessibility-relevant color convention this redesign has no reason to
break). `--denim` (secondary/informational) becomes `--accent-secondary`.
`AppShell` reshapes from a left column to a bottom bar; its logo moves into
the existing top `SiteHeader` bar instead, since the wireframe's bottom bar
is icon-only. A new shared `BrandLogo` component replaces three duplicated
inline "Luminary" logo blocks (`AppShell`, sign-in, sign-up) — the single
point of change `tech-constraints.md` already anticipated for the logo.

**Tech Stack:** Next.js App Router, React, plain CSS (custom properties +
`color-mix()`, both already supported in every evergreen browser this app
targets — no new dependency). No changes to Supabase, Trigger.dev, or any
`src/features/*` domain logic.

## Global Constraints

- No new npm dependency (`tech-constraints.md`: "don't add a dependency
  when an existing one already solves the problem" — plain CSS already
  does).
- No backend/schema change in this phase (`docs/superpowers/specs/
  2026-09-27-orca-redesign-design.md`, Phase 1 scope).
- Brand tokens (name, logo description, 6-color palette) come verbatim
  from `brain/design-context/brand-identity.md` — do not invent new brand
  hues; every new color in this plan is either one of the 6 canonical
  tokens, a `color-mix()` derivation of them, white/black, or an
  explicitly-labeled non-brand functional status color kept from the
  existing app (`--status-danger`/`--status-success`/`--status-warning`).
- Logo asset gap: only a screenshot exists, not a real SVG/PNG
  (`brand-identity.md`'s own recorded gap). `BrandLogo` in this plan
  renders a **text-only wordmark, no icon mark** — an honest, visibly
  incomplete placeholder per this project's no-silent-placeholder rule,
  not an attempt to fake the real logo's icon. Swapping in the real
  asset later is a single-file change (`src/components/brand-logo.tsx`).
- Solo-authored commits, no AI co-author trailer, commit after each task
  (`CLAUDE.md`).

---

## File Structure

**Create:**
- `src/components/brand-logo.tsx` — shared `<BrandLogo />`, replaces 3
  duplicated inline logo blocks.

**Modify:**
- `src/app/globals.css` — full token retarget (Task 1, 5, 6).
- `src/app/layout.tsx` — `metadata.title`/`description`.
- `src/app/(app)/layout.tsx` — adds `<BrandLogo />` to the top header row.
- `src/components/app-shell.tsx` — sidebar → bottom bar; uses `BrandLogo`.
- `src/components/course-shell.tsx` — active-tab color token.
- `src/features/auth/site-header.tsx` — primary auth-link color token.
- `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-up/page.tsx` —
  `BrandLogo`, "Luminary" → "Orca" text, primary-link token.
- `src/app/(app)/courses/[courseId]/page.tsx` — "Luminary" → "Orca" copy.
- `src/features/courses/components/TodayDashboard.tsx` — "Welcome to
  Luminary." → "Welcome to Orca.", status-color tokens.
- `src/features/course-graph-ingestion/components/ReviewQueue.tsx`,
  `src/features/review-scheduler/components/DueQueue.tsx`,
  `src/features/review-scheduler/components/StudySession.tsx`,
  `src/features/exam-planner/components/ExamPlanner.tsx` — status-color
  tokens (Task 5).
- `tests/e2e/smoke.spec.ts` — updated heading assertion.
- `tests/visual/review-queue.spec.ts-snapshots/*` — re-baselined
  (Task 6).
- `brain/design-context/page-map.md`, `brain/design-context/
  tech-constraints.md`, `README.md`, `brain/design-context/
  brand-identity.md`, `brain/decisions/architecture-log.md` — doc
  updates (Task 7).

---

## Task 1: Orca ground/text/border tokens

Retints the parts of the token system with exactly one meaning
everywhere (backgrounds, text, borders) — safe to do first since nothing
here is semantically overloaded like `--clay` is.

**Files:**
- Modify: `src/app/globals.css:1-99`

**Interfaces:**
- Produces: `--black`, `--prussian-blue`, `--alice-blue`, `--periwinkle`,
  `--wisteria-blue`, `--parchment` (raw brand tokens, `#RRGGBB`, no alpha
  suffix — matches `brand-identity.md`'s note that hex-without-alpha is
  already opaque). `--bg`, `--surface`, `--surface-hover`, `--border`,
  `--border-strong`, `--text-primary`, `--text-secondary`,
  `--text-tertiary` keep their existing names (every consumer in the app
  already uses these names) but new values.

- [ ] **Step 1: Replace the `:root` block's ground/text/border section**

In `src/app/globals.css`, replace lines 37–51 (the `/* Ground */` through
`/* Text */` block) with:

```css
:root {
  /* Orca brand — raw tokens, verbatim from brain/design-context/brand-identity.md */
  --black: #000000;
  --prussian-blue: #151d3a;
  --alice-blue: #e1ecfa;
  --periwinkle: #afb5f2;
  --wisteria-blue: #839bec;
  --parchment: #fcf7f4;

  /* Ground */
  --bg: var(--parchment);
  --surface: #ffffff;
  --surface-hover: var(--alice-blue);

  /* Borders — periwinkle-tinted instead of flat gray, ties chrome to brand */
  --border: color-mix(in srgb, var(--periwinkle) 35%, transparent);
  --border-strong: color-mix(in srgb, var(--periwinkle) 55%, transparent);

  /* Text — black-based, hierarchy via opacity so hue stays consistent with the logo */
  --text-primary: var(--black);
  --text-secondary: rgb(0 0 0 / 0.65);
  --text-tertiary: rgb(0 0 0 / 0.42);
```

Leave everything from `/* ── Blushed Brick */` (old line 52) onward
untouched for now — those tokens are handled in Tasks 5–6.

- [ ] **Step 2: Verify the build and typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors (this is a pure CSS value change, no TS
surface touched).

- [ ] **Step 3: Manual visual check**

Run: `npm run dev`, open `http://localhost:3000` (Today dashboard) and
`http://localhost:3000/sign-in`. Confirm: page background is now a warm
off-white (parchment) instead of the old cool gray, borders have a faint
blue-violet tint, body text is still clearly legible black. Nothing
should look broken — only retinted.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style: retarget ground/text/border tokens to the Orca palette"
```

---

## Task 2: `BrandLogo` component + name rollout

**Files:**
- Create: `src/components/brand-logo.tsx`
- Modify: `src/app/layout.tsx:15-18`
- Modify: `src/app/(auth)/sign-in/page.tsx` (its logo block, ~lines
  25–32)
- Modify: `src/app/(auth)/sign-up/page.tsx` (its logo block, ~lines
  25–32)
- Modify: `src/app/(app)/courses/[courseId]/page.tsx` (the "Luminary
  will extract concepts" copy, line 43)
- Modify: `src/features/courses/components/TodayDashboard.tsx` (the
  "Welcome to Luminary." heading, line 21)
- Modify: `tests/e2e/smoke.spec.ts:5`

**Interfaces:**
- Produces: `BrandLogo(): JSX.Element` — renders the Orca wordmark. No
  props — nothing in this plan needs a variant, so none is added
  (YAGNI; add one later if a real future consumer needs it).

- [ ] **Step 1: Create `src/components/brand-logo.tsx`**

```tsx
/**
 * Placeholder wordmark only -- brand-identity.md's own recorded gap:
 * only a logo screenshot exists, not a real SVG/PNG icon asset. This
 * renders text, not an attempt to redraw the real icon from memory.
 * Swap in a real <img>/<svg> here once a real asset file lands; every
 * consumer (AppShell, sign-in, sign-up) goes through this one component.
 */
export function BrandLogo() {
  return <span style={s.wordmark}>Orca</span>;
}

const s: Record<string, React.CSSProperties> = {
  wordmark: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--text-primary)",
  },
};
```

- [ ] **Step 2: Update root metadata**

In `src/app/layout.tsx`, replace lines 15–18:

```ts
export const metadata: Metadata = {
  title: "Orca",
  description: "Orca — an AI-native learning platform.",
};
```

- [ ] **Step 3: Wire `BrandLogo` into sign-in and sign-up**

In both `src/app/(auth)/sign-in/page.tsx` and
`src/app/(auth)/sign-up/page.tsx`, find the block rendering the old
inline logo (a `<span>` mark plus `<span style={s.logoWord}>Luminary
</span>`) and replace the whole logo block with:

```tsx
import { BrandLogo } from "@/components/brand-logo.tsx";
// ...
<BrandLogo />
```

Remove the now-unused `s.logoMark`/`s.logoWord` style entries and the
`◆` mark markup from each file if present.

- [ ] **Step 4: Replace remaining literal "Luminary" text**

In `src/app/(app)/courses/[courseId]/page.tsx:43`, change "Luminary
will extract concepts..." to "Orca will extract concepts...".

In `src/features/courses/components/TodayDashboard.tsx:21`, change
`<h1 style={s.greetingHeading}>Welcome to Luminary.</h1>` to
`<h1 style={s.greetingHeading}>Welcome to Orca.</h1>`.

- [ ] **Step 5: Update the e2e assertion**

In `tests/e2e/smoke.spec.ts:5`, change:

```ts
await expect(page.getByRole("heading", { name: "Welcome to Luminary." })).toBeVisible();
```

to:

```ts
await expect(page.getByRole("heading", { name: "Welcome to Orca." })).toBeVisible();
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck` — expect PASS.
Run: `npx playwright test tests/e2e/smoke.spec.ts` — expect PASS.
Run: `grep -rn "Luminary" src tests` — expect zero results (confirms no
stray reference left; `app-shell.tsx` and `globals.css`'s own
"Luminary" mentions are handled in Tasks 3 and 6 respectively — if this
grep still shows those two files, that's expected at this point, not a
failure).

- [ ] **Step 7: Commit**

```bash
git add src/components/brand-logo.tsx src/app/layout.tsx \
  src/app/\(auth\)/sign-in/page.tsx src/app/\(auth\)/sign-up/page.tsx \
  src/app/\(app\)/courses/\[courseId\]/page.tsx \
  src/features/courses/components/TodayDashboard.tsx \
  tests/e2e/smoke.spec.ts
git commit -m "feat: add shared BrandLogo, rename product to Orca across UI copy"
```

---

## Task 3: `AppShell` — sidebar to bottom nav bar

**Files:**
- Modify: `src/components/app-shell.tsx` (full rewrite of layout/styles,
  logic in `NAV_MAIN`/active-link detection unchanged)
- Modify: `src/app/(app)/layout.tsx` (adds `BrandLogo` to the header row)
- Modify: `src/app/globals.css` (`--sidebar-w`/`--sidebar-w-collapsed` →
  `--bottom-nav-h`)

**Interfaces:**
- Consumes: `BrandLogo()` from Task 2 (rendered in `(app)/layout.tsx`,
  not inside `app-shell.tsx` itself — the wordmark moves to the top
  header, the bottom bar stays icon-only).
- Produces: `AppShell`'s external contract (`{ children }` prop, the two
  `NAV_MAIN` routes) is unchanged — only its internal layout/CSS. No
  other file imports anything new from `app-shell.tsx`.

- [ ] **Step 1: Replace the layout token**

In `src/app/globals.css`, replace the `/* Layout */` block (current
lines 83–89):

```css
  /* Layout */
  --bottom-nav-h: 56px;
  --right-w: 280px;
```

(`--right-w` is used elsewhere and stays; `--sidebar-w`/
`--sidebar-w-collapsed` are fully replaced — grep confirms no other
consumer after this task, checked in Step 4.)

- [ ] **Step 2: Rewrite `src/components/app-shell.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconToday, IconCourses } from "@/components/icons.tsx";

/**
 * Course-agnostic top-level nav only (Today, Courses), now a bottom
 * icon bar per the Orca wireframe (docs/superpowers/specs/
 * 2026-09-27-orca-redesign-design.md, Phase 1) instead of the previous
 * left sidebar. The wordmark itself lives in the top header
 * (src/app/(app)/layout.tsx) instead of here -- the wireframe's bottom
 * bar is icon-only, matching a standard mobile-style tab bar.
 *
 * Account/Settings (present in an earlier mockup's sidebar) are still
 * omitted: no real routes exist for either today, same known gap as
 * before this reshape.
 */
const NAV_MAIN = [
  { href: "/", label: "Today", icon: <IconToday />, exact: true },
  { href: "/courses", label: "Courses", icon: <IconCourses />, exact: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={s.shell}>
      <div style={s.outlet}>{children}</div>

      <nav style={s.nav}>
        {NAV_MAIN.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ ...s.navItem, ...(isActive ? s.navItemActive : {}) }}
            >
              <span style={s.navIcon}>{item.icon}</span>
              <span style={s.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  outlet: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  nav: {
    display: "flex",
    flexShrink: 0,
    height: "var(--bottom-nav-h)",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
  },
  navItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    color: "var(--text-tertiary)",
    fontSize: 11,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    textDecoration: "none",
    letterSpacing: "-0.005em",
    transition: "color 0.1s",
  },
  navItemActive: {
    color: "var(--accent)",
  },
  navIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    lineHeight: 1,
  },
};
```

Note: `navItemActive` references `--accent`, which does not exist yet —
defined in Task 5. This is intentional and safe: an undefined CSS custom
property falls back to the browser's initial value (here, effectively
no color override applied cleanly, or `unset`), which is a harmless,
temporarily-unstyled active state, not a build/type error — CSS custom
properties are not typechecked. Step 4 below confirms nothing else
breaks; the color itself will look correct once Task 5 lands.

- [ ] **Step 3: Add `BrandLogo` to the top header**

In `src/app/(app)/layout.tsx`, import and render it inside the existing
header `<div>`, before `<SiteHeader />`:

```tsx
import { AppShell } from "@/components/app-shell.tsx";
import { BrandLogo } from "@/components/brand-logo.tsx";
import { SiteHeader } from "@/features/auth/site-header.tsx";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          fontSize: 13,
        }}
      >
        <BrandLogo />
        <SiteHeader />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AppShell>{children}</AppShell>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify no leftover references**

Run: `grep -rn "sidebar-w\|useMobileBreakpoint" src/components/app-shell.tsx`
Expected: zero results (the mobile-collapse behavior that motivated
`useMobileBreakpoint` in `AppShell` was specifically about a *sidebar*
running out of horizontal room — a bottom bar with 2 items doesn't have
that problem, so this hook is no longer needed *in this file*; leave
`src/lib/use-mobile-breakpoint.ts` itself untouched, since
`concept-atlas` still uses it).

Run: `npm run typecheck` — expect PASS.
Run: `npx playwright test tests/e2e/smoke.spec.ts` — expect PASS
(smoke test doesn't assert on nav position, only page content).

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`. Confirm: Today and Courses pages now show content
filling the full height with a 2-item icon bar pinned to the bottom;
the top header shows "Orca" on the left and sign-in/out on the right;
resizing the window narrow (mobile width) still shows a usable bottom
bar (it was never the thing that needed collapsing — only the sidebar
was).

- [ ] **Step 6: Commit**

```bash
git add src/components/app-shell.tsx src/app/\(app\)/layout.tsx src/app/globals.css
git commit -m "feat: replace AppShell's left sidebar with a bottom icon nav bar"
```

---

## Task 4: Shell chrome — `CourseShell` + `SiteHeader` primary color

**Files:**
- Modify: `src/components/course-shell.tsx` (lines ~110–147:
  `subNavItem`/`subNavItemActive` and the `--clay-transparent`/`--clay`
  references)
- Modify: `src/features/auth/site-header.tsx` (line ~92:
  `authLinkPrimary`'s `color: "var(--clay)"`)

**Interfaces:**
- Consumes: `--accent`/`--accent-transparent` (defined in Task 5 — see
  note below on sequencing).

This task is written to land *after* Task 5 defines `--accent*` in
`globals.css`, even though it's listed here for file-grouping clarity.
**Execute Task 5 before Task 4** if running tasks out of plan order;
if running in plan order, skip ahead and do Task 5 first, then return
here. (Reordered explicitly so the "shell chrome" file-grouping stays
readable as one unit above, without forcing an artificial split of
`globals.css` edits across two tasks.)

- [ ] **Step 1: `course-shell.tsx` active-tab color**

Replace:
```tsx
    borderBottom: "2px solid var(--clay-transparent)",
```
with:
```tsx
    borderBottom: "2px solid var(--accent-transparent)",
```

Replace:
```tsx
    color: "var(--clay)",
    borderBottom: "2px solid var(--clay)",
```
with:
```tsx
    color: "var(--accent)",
    borderBottom: "2px solid var(--accent)",
```

(The long comment above `subNavItemActive` explaining the
shorthand-vs-longhand bug stays — it's still exactly as true for
`--accent`/`--accent-transparent` as it was for `--clay`/
`--clay-transparent`; do not delete it.)

- [ ] **Step 2: `site-header.tsx` primary link color**

Replace:
```ts
  authLinkPrimary: {
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    color: "var(--clay)",
    textDecoration: "none",
  },
```
with:
```ts
  authLinkPrimary: {
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    color: "var(--accent)",
    textDecoration: "none",
  },
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck` — expect PASS.
Run: `npx playwright test tests/e2e/smoke.spec.ts` — expect PASS.
Run: `grep -rn "var(--clay" src/components/course-shell.tsx src/features/auth/site-header.tsx`
Expected: zero results.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, open a course detail page. Confirm the active
sub-nav tab (e.g. "Material") shows the new wisteria-blue underline/
text color instead of the old red, and the underline still correctly
disappears when navigating to an inactive tab (the exact bug the
existing code comment warns about — re-verify it's still fixed, not
just re-colored).

- [ ] **Step 5: Commit**

```bash
git add src/components/course-shell.tsx src/features/auth/site-header.tsx
git commit -m "style: retarget shell chrome active/primary color to --accent"
```

---

## Task 5: Accent + status-color tokens

Defines the split this whole plan's architecture is built on:
`--accent*` (brand primary) independent from `--status-danger*`
(functional, was conflated with brand primary under the old `--clay`
name).

**Files:**
- Modify: `src/app/globals.css` (replaces the `/* ── Blushed Brick */`
  through `/* ── Urgency */` block, current lines 52–82)

**Interfaces:**
- Produces: `--accent`, `--accent-hover`, `--accent-fg`, `--accent-muted`,
  `--accent-border`, `--accent-transparent` (wisteria-blue-based).
  `--accent-secondary`, `--accent-secondary-hover`,
  `--accent-secondary-fg`, `--accent-secondary-muted`,
  `--accent-secondary-border` (periwinkle-based). `--status-success`,
  `--status-success-fg`, `--status-success-muted`,
  `--status-success-border`. `--status-danger`, `--status-danger-fg`,
  `--status-danger-muted`, `--status-danger-border`. `--status-warning`.
  The old `--clay*`/`--denim*`/`--teal*`/`--urgent-*` names are **not**
  defined here — Task 6 confirms and removes every remaining reference.

- [ ] **Step 1: Replace the accent/status block**

Replace lines 52–82 of `src/app/globals.css` (from `/* ── Blushed
Brick (primary + critical urgency) */` through the end of the
`/* ── Urgency */` block) with:

```css
  /* ── Accent (brand primary — buttons, active nav, primary links) */
  --accent: var(--wisteria-blue);
  --accent-hover: color-mix(in srgb, var(--wisteria-blue) 80%, var(--prussian-blue) 20%);
  --accent-fg: #ffffff;
  --accent-muted: var(--alice-blue);
  --accent-border: color-mix(in srgb, var(--wisteria-blue) 30%, transparent);
  /* Same RGB channels as --wisteria-blue, alpha 0 -- see the identical
     --clay-transparent comment this replaces (course-shell.tsx's active-
     tab underline needs a same-hue fade, not a fade through gray/black). */
  --accent-transparent: rgb(131 155 236 / 0);

  /* ── Accent secondary (AI voice / informational, lighter than --accent) */
  --accent-secondary: var(--periwinkle);
  --accent-secondary-hover: color-mix(in srgb, var(--periwinkle) 80%, var(--prussian-blue) 20%);
  --accent-secondary-fg: var(--black);
  --accent-secondary-muted: var(--alice-blue);
  --accent-secondary-border: color-mix(in srgb, var(--periwinkle) 35%, transparent);

  /* ── Status colors (functional, deliberately NOT brand-tinted --
     correct/incorrect/warning stay their conventional hues regardless
     of brand palette, same reasoning a fire-alarm stays red no matter
     what color the building is painted). Values unchanged from the
     app's pre-Orca colors -- only the names/grouping changed, so every
     correct/incorrect/urgency indicator in the app looks exactly as it
     did before this rebrand. */
  --status-success: #2b9257;
  --status-success-fg: #ffffff;
  --status-success-muted: #e2f4eb;
  --status-success-border: rgba(43, 146, 87, 0.22);

  --status-danger: #c94f53;
  --status-danger-fg: #ffffff;
  --status-danger-muted: #fceaea;
  --status-danger-border: rgba(201, 79, 83, 0.22);

  --status-warning: #a0622e;
```

- [ ] **Step 2: Update the file's own header comment**

Replace the `LUMINARY — Brand & Design Tokens` comment block at the top
of the file (lines 1–35) with:

```css
/* ═══════════════════════════════════════════
   ORCA — Brand & Design Tokens
   ═══════════════════════════════════════════

   Name & logo: brain/design-context/brand-identity.md (placeholder
   text-only wordmark for now -- no real logo asset file yet).

   Brand palette (verbatim from brand-identity.md)
   ────────────────────────────────────────────────
   Black          #000000   Primary text, logo wordmark
   Prussian Blue  #151d3a   Darkest brand hue besides black -- hover/
                             mix target for accent variants
   Alice Blue     #e1ecfa   Light cool background / hover surface /
                             muted accent fill
   Periwinkle     #afb5f2   Accent secondary -- AI voice, informational
   Wisteria Blue  #839bec   Accent primary -- buttons, active nav, links
   Parchment      #fcf7f4   Page ground

   Status colors (functional, not brand-tinted -- see --status-* below)
   ──────────────────────────────────────────────────────────────────
   Success   #2b9257   Correct answers, mastered concepts
   Danger    #c94f53   Incorrect answers, errors, critical exam urgency
   Warning   #a0622e   "Soon" exam urgency

   Usage rules
   ───────────
   • --accent   → all primary interactive: buttons, active nav, primary
     links, focus rings
   • --accent-secondary → AI-generated summaries, informational badges
   • --status-* → correctness/urgency feedback only, never a generic
     "brand color" substitute -- keeps correct/incorrect legible
     regardless of what the brand palette itself does later

   Fonts are loaded via next/font/google in src/app/layout.tsx
   (--font-geist-sans / --font-geist-mono) — --font-sans/--font-mono
   below just alias those, no separate font loading here.
   ═══════════════════════════════════════════ */
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck` — expect PASS (CSS-only change).
Run: `npm run dev`, confirm the app still loads without console errors
on Today/Courses/sign-in (some elements will still reference the
now-removed `--clay`/`--denim`/`--teal` names until Tasks 4/6 finish —
those fall back harmlessly to unstyled/inherited color, not a crash;
this is expected and temporary, resolved by the end of Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: split brand-primary and status colors into --accent*/--status-* tokens"
```

---

## Task 6: Migrate remaining status-color consumers + delete old tokens

**Files:**
- Modify: `src/features/review-scheduler/components/StudySession.tsx`
  (lines ~194–202: correct/incorrect verdict colors)
- Modify: `src/features/course-graph-ingestion/components/ReviewQueue.tsx`
  (its `--teal`/`--clay`/`--denim` usages — grep to enumerate exact
  lines before editing, per Step 1)
- Modify: `src/features/review-scheduler/components/DueQueue.tsx`
  (same)
- Modify: `src/features/exam-planner/components/ExamPlanner.tsx`
  (its critical/soon/comfortable urgency colors — critical→
  `--status-danger`, soon→`--status-warning`, comfortable→
  `--status-success`, per `globals.css`'s own pre-existing urgency
  mapping comment)
- Modify: `src/app/globals.css` (delete Task-1-era leftovers if any
  remain; confirm no `--clay`/`--denim`/`--teal`/`--urgent-*` names
  still defined)

**Interfaces:**
- Consumes: `--accent`, `--accent-secondary`, `--status-success`,
  `--status-danger`, `--status-warning` and their `-fg`/`-muted`/
  `-border`/`-hover` variants from Task 5.

- [ ] **Step 1: Enumerate every remaining old-token reference**

Run:
```bash
grep -rn "var(--clay\|var(--denim\|var(--teal\|var(--urgent" src
```

For each hit, classify by meaning using this mapping (do not guess
case-by-case beyond this table — it covers every semantic use these
tokens had in the app):

| Old token | New token |
|---|---|
| `--clay`/`--clay-hover`/`--clay-fg`/`--clay-muted`/`--clay-border`/`--clay-transparent` used for a **wrong-answer/error/incorrect** indicator | `--status-danger` (+ matching suffix) |
| `--clay*` used for a **primary action/button/active state** | `--accent` (+ matching suffix) |
| `--denim*` | `--accent-secondary` (+ matching suffix) |
| `--teal*` | `--status-success` (+ matching suffix) |
| `--urgent-red` | `--status-danger` |
| `--urgent-amber` | `--status-warning` |

- [ ] **Step 2: Apply the mapping file by file**

Edit each of `StudySession.tsx`, `ReviewQueue.tsx`, `DueQueue.tsx`,
`ExamPlanner.tsx` — every `var(--clay...)`/`var(--denim...)`/
`var(--teal...)`/`var(--urgent...)` becomes its Step-1-mapped
replacement. In `StudySession.tsx:194-202` specifically:

```tsx
background: passed ? "var(--status-success-muted)" : "var(--status-danger-muted)",
border: `1px solid ${passed ? "var(--status-success-border)" : "var(--status-danger-border)"}`,
...
<span style={{ ...s.verdictIcon, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
...
<span style={{ ...s.verdictText, color: passed ? "var(--status-success)" : "var(--status-danger)" }}>
```

- [ ] **Step 3: Delete the old token names from `globals.css`**

Run: `grep -n "\-\-clay\|\-\-denim\|\-\-teal\|\-\-urgent" src/app/globals.css`
Expected: zero results already, since Task 5 replaced that whole block
— this step is a confirmation, not new deletion work. If anything
shows up, it means Task 5 was applied incompletely; fix `globals.css`
directly before proceeding.

- [ ] **Step 4: Full-repo confirmation**

Run: `grep -rn "var(--clay\|var(--denim\|var(--teal\|var(--urgent" src`
Expected: zero results, repo-wide.

- [ ] **Step 5: Run the full regression suite**

Run: `npm run typecheck` — expect PASS.
Run: `npm run test:unit` — expect PASS (none of this logic touches
domain code, this run confirms no accidental breakage).
Run: `npx playwright test tests/e2e/` — expect PASS.

- [ ] **Step 6: Re-baseline visual regression**

Run: `npx playwright test tests/visual/ --update-snapshots`

This regenerates every checked-in screenshot, including
`tests/visual/concept-atlas.spec.ts-snapshots/*` even though the Atlas
feature itself is untouched — expected collateral, since Atlas pages
render through the same global `globals.css` tokens (borders/text/
background) that Task 1 retargeted. Open a few of the regenerated PNGs
and manually confirm they show the *new Orca colors applied correctly*,
not a broken/blank render — an automated re-baseline can silently bless
a real rendering bug if nobody looks at the actual images.

Run: `npx playwright test tests/visual/` again (without
`--update-snapshots`) — expect PASS against the newly-committed
baselines.

- [ ] **Step 7: Manual visual check**

Run: `npm run dev`. Answer one Study-session question correctly and one
incorrectly — confirm green/red verdict colors are unchanged from
before this rebrand (this is the one place where "unchanged" is the
correct outcome, not "retinted"). Open Exam Planner with a real exam
config and confirm critical/soon/comfortable urgency badges still read
clearly as red/amber/green.

- [ ] **Step 8: Commit**

```bash
git add src/features/review-scheduler/components/StudySession.tsx \
  src/features/course-graph-ingestion/components/ReviewQueue.tsx \
  src/features/review-scheduler/components/DueQueue.tsx \
  src/features/exam-planner/components/ExamPlanner.tsx \
  src/app/globals.css tests/visual/
git commit -m "style: migrate remaining status colors off deprecated --clay/--denim/--teal tokens"
```

---

## Task 7: Documentation

**Files:**
- Modify: `brain/design-context/page-map.md` (fix pre-existing drift:
  the "/" route is `(app)/page.tsx`, i.e. the Today dashboard — there
  is no separate static Landing page anymore, unrelated to this rebrand
  but found while working in this area)
- Modify: `brain/design-context/tech-constraints.md` (the "zero design
  token system" claim is now false)
- Modify: `README.md` (rebrand note: applied, not pending)
- Modify: `brain/design-context/brand-identity.md` (status line)
- Modify: `brain/decisions/architecture-log.md` (new entry)

- [ ] **Step 1: Fix `page-map.md`'s stale Landing section**

Replace:
```markdown
## `/` — Landing (`src/app/page.tsx`)
Static. `<h1>AI-Native Learning Platform</h1>` + one line of body text.
No nav, no CTA button yet. Real placeholder for a real landing page.
This `<h1>` is the eventual rename target once the approved "Orca"
rebrand (`brand-identity.md`) is actually implemented — not done yet.
```
with:
```markdown
## `/` — Today dashboard (`src/app/(app)/page.tsx`)
There is no separate static landing page — `/` resolves directly to
`TodayDashboard` (`getTodayOverview` + `<TodayDashboard>`), the same
page reached after sign-in. This entry was stale before this rebrand
(described a `src/app/page.tsx` that doesn't exist) — corrected while
touching this area for the Orca rebrand, not itself a rebrand change.
Heading now reads "Welcome to Orca." per `brand-identity.md`.
```

- [ ] **Step 2: Update `tech-constraints.md`**

Replace the bullet added in the brand-identity pass:
```markdown
  - `brand-identity.md` (approved 2026-09-27, not yet implemented) now
    gives this gap a real target: a 6-color palette (black plus five
    named brand colors) to build CSS custom properties from, once a
    token system is actually built. It's a color palette only, not a
    component library or layout primitives — those gaps are unchanged.
```
with:
```markdown
  - As of the Orca rebrand (2026-09-27), this is no longer a gap: `src/
    app/globals.css` implements a real Orca-based token system (6 raw
    brand tokens + semantic ground/text/border/accent/status tokens).
    Still no shared component library or layout primitives (no
    `<Button>`, no `<Card>`) — only the color-token half of "zero design
    token system" has been addressed, not component reuse.
```

- [ ] **Step 3: Update `README.md`**

Replace the "Rebrand note" paragraph added in the brand-identity pass
with:
```markdown
**Rebrand (2026-09-27)**: the product is now **Orca** — name, palette,
and app shell applied across every page (`brain/design-context/
brand-identity.md`, Phase 1 of `docs/superpowers/specs/
2026-09-27-orca-redesign-design.md`). The logo is still a text-only
placeholder wordmark pending a real asset file. Phases 2–9 of the
redesign (Concepts screen, Home dashboard islands, quick-review flow,
material upload, review configuration, calendar, onboarding, deep
review) are scoped but not yet built.
```

- [ ] **Step 4: Update `brand-identity.md`'s status line**

Change the top status line from:
```markdown
**Status: approved 2026-09-27, pending implementation.** ...
```
to:
```markdown
**Status: approved 2026-09-27; name/palette/app-shell applied
2026-09-27 (Phase 1 of `docs/superpowers/specs/
2026-09-27-orca-redesign-design.md`).** The logo remains a text-only
placeholder — no real SVG/PNG asset exists yet (see "Logo" below).
```

- [ ] **Step 5: Log the architecture-log entry**

Append to `brain/decisions/architecture-log.md`, after the
2026-09-27 "Orca redesign" entry:

```markdown
## 2026-09-27 -- Orca rebrand Phase 1 (app shell + palette) shipped

Applied the approved Orca brand (`brand-identity.md`) across every
existing page: `globals.css`'s token system (still the same one the
app has had since its "Luminary" placeholder brand, just retargeted --
not rebuilt) now derives every ground/text/border/accent color from
Orca's 6 canonical tokens. The old `--clay` token was overloaded --
both "primary brand action" and "error/incorrect" depending on the
file -- so it was split into `--accent` (brand) and `--status-danger`
(functional, kept its original red regardless of brand palette, same
reasoning `--status-success` stays green). `AppShell`'s left sidebar
became a bottom icon bar per the wireframe; its logo moved into the
top header instead, since the wireframe's bottom bar is icon-only.

Logo is a text-only placeholder (`BrandLogo`, `src/components/
brand-logo.tsx`) -- only a screenshot of the real logo exists, no
SVG/PNG asset, per `brand-identity.md`'s own recorded gap. Swapping in
a real asset later touches exactly one file.

Full visual regression suite re-baselined, including
`concept-atlas.spec.ts`'s snapshots even though the Atlas feature
itself is untouched code-wise -- expected collateral from a shared
global token change, each new screenshot manually confirmed correct
before committing (an automated re-baseline alone can't catch a broken
render, only a diff from the old one).

Phases 2-9 of the redesign remain scoped-not-built per `docs/
superpowers/specs/2026-09-27-orca-redesign-design.md`.
```

- [ ] **Step 6: Commit**

```bash
git add brain/design-context/page-map.md brain/design-context/tech-constraints.md \
  README.md brain/design-context/brand-identity.md brain/decisions/architecture-log.md
git commit -m "docs: record Orca rebrand Phase 1 as shipped"
```

---

## Self-Review

**Spec coverage**: every Phase-1 scope item from `docs/superpowers/
specs/2026-09-27-orca-redesign-design.md` is covered — brand
palette applied (Tasks 1, 5, 6), logo (Task 2, explicitly placeholder
per the recorded gap), bottom nav bar (Task 3), no backend/schema
touch (confirmed — no task modifies `supabase/` or any `src/features/
*/actions.ts`).

**Placeholder scan**: no TBD/TODO left in any step; the one deliberate
placeholder (`BrandLogo`'s text-only wordmark) is explicit, justified,
and labeled in both code comment and doc updates, not a silent stand-in.

**Type consistency**: `BrandLogo()` (Task 2, no props) is called
identically at all three sites that render it (sign-in, sign-up, and
`(app)/layout.tsx`'s header) — no site passes props, no drift between
its definition and any call site.
