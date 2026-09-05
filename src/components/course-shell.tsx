"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import type { ReactNode } from "react";
import { IconChevronRight, IconMaterial, IconAtlas, IconReview, IconTutor, IconStudy, IconExam } from "@/components/icons.tsx";

const SUB_NAV = [
  { path: "", label: "Material", icon: <IconMaterial /> },
  { path: "atlas", label: "Atlas", icon: <IconAtlas /> },
  { path: "review", label: "Review", icon: <IconReview /> },
  { path: "tutor", label: "Tutor", icon: <IconTutor /> },
  { path: "study", label: "Study", icon: <IconStudy /> },
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
    borderBottom: "2px solid transparent",
    letterSpacing: "-0.005em",
    transition: "color 0.1s, border-color 0.1s",
    marginBottom: -1,
  },
  subNavItemActive: {
    color: "var(--clay)",
    borderBottomColor: "var(--clay)",
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
