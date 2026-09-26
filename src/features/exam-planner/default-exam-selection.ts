import type { ExamConfigView } from "./actions.ts";

/**
 * Picks which exam the Exam Plan page shows by default when no
 * `?exam=<id>` was requested: the nearest upcoming exam if any exist,
 * else the most recent past one, else null (no exams configured at
 * all). "Passed" uses the exact same boundary getExamPlan itself uses
 * (`examDate.getTime() <= now.getTime()`) so this pick and
 * getExamPlan's own "exam_date_passed" check can never disagree --
 * e.g. this never defaults to an exam that getExamPlan would
 * immediately report as already passed.
 */
export function pickDefaultExamConfig(configs: ExamConfigView[], now: Date): ExamConfigView | null {
  const upcoming = configs
    .filter((c) => new Date(c.examDate).getTime() > now.getTime())
    .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  if (upcoming.length > 0) return upcoming[0];

  const past = configs
    .filter((c) => new Date(c.examDate).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  return past[0] ?? null;
}
