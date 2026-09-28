export type NearestExam = {
  courseId: string;
  courseName: string;
  examConfigId: string;
  examDate: string;
  daysLeft: number;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function daysUntil(examDate: string, now: Date): number {
  return Math.ceil((new Date(examDate).getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Future exams only, soonest first -- a past exam date is over, not
 * "upcoming". This is the one place the filter-and-sort rule lives;
 * `pickNearestExam` and the Home dashboard's exam rail both defer to
 * it instead of each keeping their own copy.
 */
export function sortUpcomingExams(exams: NearestExam[]): NearestExam[] {
  return exams.filter((e) => e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * Picks the soonest *future* exam -- a past exam date is over, not
 * "nearest". Pure so the ordering rule (and the exclusion of past
 * dates) is unit-testable without a real Supabase call.
 */
export function pickNearestExam(exams: NearestExam[]): NearestExam | null {
  return sortUpcomingExams(exams)[0] ?? null;
}
