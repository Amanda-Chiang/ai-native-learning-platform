export type NearestExam = {
  courseId: string;
  courseName: string;
  examDate: string;
  daysLeft: number;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function daysUntil(examDate: string, now: Date): number {
  return Math.ceil((new Date(examDate).getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Picks the soonest *future* exam -- a past exam date is over, not
 * "nearest". Pure so the ordering rule (and the exclusion of past
 * dates) is unit-testable without a real Supabase call.
 */
export function pickNearestExam(exams: NearestExam[]): NearestExam | null {
  const future = exams.filter((e) => e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft);
  return future[0] ?? null;
}
