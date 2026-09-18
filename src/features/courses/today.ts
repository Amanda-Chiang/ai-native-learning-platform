"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { listCourses } from "@/features/courses/actions.ts";
import { getExamConfig } from "@/features/exam-planner/actions.ts";
import { getDailyReviewSession } from "@/features/review-scheduler/actions.ts";
import type { DailySessionResult } from "@/features/review-scheduler/daily-session.ts";
import { daysUntil, pickNearestExam, type NearestExam } from "@/features/courses/today-selection.ts";

export type { NearestExam };

export type TodayOverview = {
  nearestExam: NearestExam | null;
  /** Nearest exam first, up to 3 -- same sorted list nearestExam is
   * drawn from, already fully computed, so surfacing more of it for a
   * sidebar is free (no extra query). */
  upcomingExams: NearestExam[];
  dailySession: DailySessionResult | null;
  /** conceptId -> canonical name, for every concept in dailySession's
   * items -- the Home preview shows which concepts are covered, never
   * a session item's own questionText (that's the actual question, and
   * showing it on Home would let a student read the answer-bearing
   * question before attempting it in the real Study flow). Keyed by id
   * rather than joined onto SessionItem directly so
   * review-scheduler's own DailySessionResult type stays exactly what
   * the scheduler itself produces -- this is a Home-page-only lookup. */
  conceptNames: Record<string, string>;
  hasCourses: boolean;
};

/**
 * Aggregates across every course the signed-in user has, since no
 * single course-scoped action does this today (getExamConfig/
 * getDailyReviewSession both take one courseId at a time). Picks the
 * course with the nearest *future* exam date via pickNearestExam
 * (today-selection.ts, unit-tested there) -- a course with a past exam
 * date is not "nearest", it's over. Returns null (not a fabricated
 * default) when no course has any exam configured.
 */
export async function getTodayOverview(): Promise<TodayOverview> {
  const now = new Date();
  const courses = await listCourses();

  const configuredExams = (
    await Promise.all(
      courses.map(async (course) => {
        const { config } = await getExamConfig(course.id);
        if (!config) return null;
        return { courseId: course.id, courseName: course.name, examDate: config.examDate, daysLeft: daysUntil(config.examDate, now) };
      }),
    )
  ).filter((exam): exam is NearestExam => exam !== null);

  const nearestExam = pickNearestExam(configuredExams);
  const upcomingExams = configuredExams.filter((e) => e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3);

  const dailySession = nearestExam ? await getDailyReviewSession(nearestExam.courseId) : null;

  const items = dailySession && "items" in dailySession ? dailySession.items : [];
  const conceptIds = Array.from(new Set(items.map((item) => item.conceptId)));
  let conceptNames: Record<string, string> = {};
  if (conceptIds.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase.from("course_concepts").select("id, canonical_name").in("id", conceptIds);
    conceptNames = Object.fromEntries((data ?? []).map((row) => [row.id, row.canonical_name]));
  }

  return {
    nearestExam,
    upcomingExams,
    dailySession,
    conceptNames,
    hasCourses: courses.length > 0,
  };
}
