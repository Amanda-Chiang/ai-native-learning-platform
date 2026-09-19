"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import type { ReactNode } from "react";
import { IconChevronRight, IconMaterial, IconAtlas, IconReview, IconTutor, IconExam } from "@/components/icons.tsx";

// No "Study" tab here by design -- /courses/[courseId]/study is a real
// route (StudySession's UI), but it's reached only via the Review
// page's "Start review" button, never as its own top-level nav entry.
// Giving it a second, always-visible nav path duplicated the same
// destination for no reason (found live, direct product request).
const SUB_NAV = [
  { path: "", label: "Material", icon: <IconMaterial /> },
  { path: "atlas", label: "Atlas", icon: <IconAtlas /> },
  { path: "review", label: "Review", icon: <IconReview /> },
  { path: "tutor", label: "Tutor", icon: <IconTutor /> },
  { path: "exam-plan", label: "Exam plan", icon: <IconExam /> },
];

export function CourseShell({ courseName, children }: { courseName: string; children: ReactNode }) {
  const pathname = usePathname();
  const { courseId } = useParams<{ courseId: string }>();
  const base = `/courses/${courseId}`;

  return (
    <div style={s.shell}>
      <div style={s.header}>
        <div style={s.breadcrumb}>
          <Link href="/courses" style={s.breadcrumbLink}>
            Courses
          </Link>
          <span style={s.breadcrumbSep}>
            <IconChevronRight />
          </span>
          <span style={s.breadcrumbCurrent}>{courseName}</span>
        </div>

        <nav style={s.subNav}>
          {SUB_NAV.map((item) => {
            const href = item.path ? `${base}/${item.path}` : base;
            const isActive = pathname === href;
            return (
              <Link key={item.path} href={href} style={{ ...s.subNavItem, ...(isActive ? s.subNavItemActive : {}) }}>
                <span style={s.subNavIcon}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div style={s.content}>{children}</div>
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
  header: {
    flexShrink: 0,
    padding: "16px 28px 0",
    background: "var(--surface)",
    borderBottom: "1px solid var(--border)",
  },
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 14,
  },
  breadcrumbLink: {
    fontSize: 12.5,
    color: "var(--text-tertiary)",
    letterSpacing: "-0.005em",
  },
  breadcrumbSep: {
    color: "var(--text-tertiary)",
    display: "flex",
    alignItems: "center",
    opacity: 0.5,
  },
  breadcrumbCurrent: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    letterSpacing: "-0.005em",
    fontWeight: 500,
  },
  subNav: {
    display: "flex",
    gap: 0,
  },
  subNavItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    fontWeight: 450,
    color: "var(--text-secondary)",
    borderBottom: "2px solid var(--clay-transparent)",
    letterSpacing: "-0.005em",
    transition: "color 0.1s, border-color 0.1s",
    marginBottom: -1,
  },
  subNavItemActive: {
    color: "var(--clay)",
    // Shorthand, matching subNavItem's own `borderBottom` -- not the
    // longhand `borderBottomColor`. Mixing a shorthand base value with a
    // longhand override here was the real bug (found live, not just
    // suspected): React's inline-style diffing sets/clears style keys
    // individually, and skips re-setting a key whose value is unchanged
    // between renders. Going active -> inactive drops the `borderBottomColor`
    // key entirely (it's absent from the inactive style object) while
    // `borderBottom`'s string value is literally unchanged (same base
    // shorthand both times), so React never re-applies it -- the browser
    // is left with border-bottom-width/style still 2px/solid from the
    // active render, but border-bottom-color reset to its CSS initial
    // value (`currentColor`, i.e. the tab's own text color) instead of
    // back to the shorthand's transparent value. That's the literal
    // stray "underline" on a tab that isn't active. Using the shorthand
    // here too means every render always re-sets the one `borderBottom`
    // key atomically, so there's nothing for that diff gap to hit.
    borderBottom: "2px solid var(--clay)",
    fontWeight: 500,
  },
  subNavIcon: {
    display: "flex",
    alignItems: "center",
    opacity: 0.7,
  },
  content: {
    flex: 1,
    overflow: "hidden",
  },
};
