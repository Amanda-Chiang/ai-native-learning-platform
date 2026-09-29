"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconToday, IconCourses, IconTutor } from "@/components/icons.tsx";

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
  { href: "/chat", label: "Chat", icon: <IconTutor />, exact: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The quick-review flow (Orca Phase 4) takes the whole screen on a
  // phone, where the question needs the room. Desktop keeps the nav.
  // CSS, not a JS breakpoint hook, so nothing re-renders on resize --
  // same pattern as ConceptDetailPanel's side-panel/bottom-sheet
  // switch and DueQueue's CONNECT_PANEL_MEDIA_QUERY.
  const isQuickReview = /^\/courses\/[^/]+\/study$/.test(pathname);

  return (
    <div style={s.shell}>
      <style>{`@media (max-width: 768px) { .app-shell-nav-hidden { display: none; } }`}</style>
      <div style={s.outlet}>{children}</div>

      <nav className={isQuickReview ? "app-shell-nav-hidden" : undefined} style={s.nav}>
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
