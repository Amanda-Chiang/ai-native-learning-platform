"use server";

import { listCourses } from "@/features/courses/actions.ts";
import { getExamConfig } from "@/features/exam-planner/actions.ts";
import { getDailyReviewSession } from "@/features/review-scheduler/actions.ts";
import type { DailySessionResult } from "@/features/review-scheduler/daily-session.ts";

export type NearestExam = {
  courseId: string;
  courseName: string;
  examDate: string;
  daysLeft: number;
};

export type TodayOverview = {
  nearestExam: NearestExam | null;
  /** Nearest exam first, up to 3 -- same sorted list nearestExam is
   * drawn from, already fully computed, so surfacing more of it for a
   * sidebar is free (no extra query). */
  upcomingExams: NearestExam[];
  dailySession: DailySessionResult | null;
  hasCourses: boolean;
};

function daysUntil(examDate: string, now: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((new Date(examDate).getTime() - now.getTime()) / msPerDay);
}

/**
 * Aggregates across every course the signed-in user has, since no
 * single course-scoped action does this today (getExamConfig/
 * getDailyReviewSession both take one courseId at a time). Picks the
 * course with the nearest *future* exam date -- a course with a past
 * exam date is not "nearest", it's over. Returns null (not a
 * fabricated default) when no course has any exam configured.
 */
export async function getTodayOverview(): Promise<TodayOverview> {
  const now = new Date();
  const courses = await listCourses();

  const configuredExams = (
    await Promise.all(
      courses.map(async (course) => {
        const { config } = await getExamConfig(course.id);
        if (!config) return null;
        const daysLeft = daysUntil(config.examDate, now);
        if (daysLeft < 0) return null;
        return { courseId: course.id, courseName: course.name, examDate: config.examDate, daysLeft };
      }),
    )
  ).filter((exam): exam is NearestExam => exam !== null);

  configuredExams.sort((a, b) => a.daysLeft - b.daysLeft);
  const nearestExam = configuredExams[0] ?? null;

  const dailySession = nearestExam ? await getDailyReviewSession(nearestExam.courseId) : null;

  return {
    nearestExam,
    upcomingExams: configuredExams.slice(0, 3),
    dailySession,
    hasCourses: courses.length > 0,
  };
}
