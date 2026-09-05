"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconToday, IconCourses } from "@/components/icons.tsx";

/**
 * Course-agnostic top-level nav only (Today, Courses). The mockup this
 * was adapted from also had top-level "Concept Atlas"/"Exam prep" links
 * hardcoded to one course id -- those only make sense inside a course
 * context, so they live in CourseShell's per-course tab bar instead
 * (src/components/course-shell.tsx), not here.
 *
 * Account/Settings (present in the mockup's sidebar) are omitted: no
 * real routes exist for either today. Left as a known gap rather than
 * linking to a 404 or building placeholder pages out of scope for a
 * styling pass.
 */
const NAV_MAIN = [
  { href: "/", label: "Today", icon: <IconToday />, exact: true },
  { href: "/courses", label: "Courses", icon: <IconCourses />, exact: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={s.shell}>
      <nav style={s.nav}>
        <div style={s.logo}>
          <span style={s.logoMark}>◆</span>
          <span style={s.logoWord}>Luminary</span>
        </div>

        <div style={s.navGroup}>
          {NAV_MAIN.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ ...s.navItem, ...(isActive ? s.navItemActive : {}) }}>
                <span style={s.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div style={s.outlet}>{children}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: {
    display: "grid",
    gridTemplateColumns: "var(--sidebar-w) 1fr",
    height: "100%",
    overflow: "hidden",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    height: "100%",
    padding: "20px 12px",
    borderRight: "1px solid var(--border)",
    background: "var(--surface)",
    overflowY: "auto",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 10px 20px",
  },
  logoMark: {
    fontSize: 13,
    color: "var(--clay)",
    lineHeight: 1,
  },
  logoWord: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: "var(--text-primary)",
  },
  navGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "7px 10px",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    fontSize: 13.5,
    fontFamily: "var(--font-sans)",
    fontWeight: 450,
    textDecoration: "none",
    letterSpacing: "-0.01em",
    transition: "background 0.1s, color 0.1s",
  },
  navItemActive: {
    background: "var(--clay-muted)",
    color: "var(--clay)",
    fontWeight: 500,
  },
  navIcon: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    opacity: 0.75,
  },
  outlet: {
    height: "100%",
    overflow: "hidden",
  },
};
