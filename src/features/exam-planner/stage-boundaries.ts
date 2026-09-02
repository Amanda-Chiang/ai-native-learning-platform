export type ExamStageName = "diagnostic" | "interleaving" | "timed-mixed" | "final-weakness";

export type ExamStage = { name: ExamStageName; startDate: Date; endDate: Date };

/** Tunable percentages of real remaining days (research.md "Stage
 * share"), not fixed durations. Always sums to 1. */
export const DEFAULT_STAGE_SHARES: Record<ExamStageName, number> = {
  diagnostic: 0.3,
  interleaving: 0.3,
  "timed-mixed": 0.25,
  "final-weakness": 0.15,
};

const STAGE_ORDER: ExamStageName[] = ["diagnostic", "interleaving", "timed-mixed", "final-weakness"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Splits the days between `now` and `examDate` into the four stages,
 * proportional to DEFAULT_STAGE_SHARES, rounded to whole days.
 * final-weakness always gets at least one day, taken from whichever
 * earlier stage would otherwise leave it at zero -- a plan must still
 * be usable when the exam is very close (FR-006), never invent days
 * that don't exist (SC-005). Throws if examDate is not strictly after
 * now (FR-010 -- the caller surfaces that as an honest "this exam has
 * already passed" message, not swallowed here).
 */
export function computeExamStages(examDate: Date, now: Date): ExamStage[] {
  const totalDays = Math.ceil((examDate.getTime() - now.getTime()) / MS_PER_DAY);
  if (totalDays <= 0) {
    throw new Error("examDate must be strictly after now.");
  }

  const dayCounts: Record<ExamStageName, number> = {
    diagnostic: 0,
    interleaving: 0,
    "timed-mixed": 0,
    "final-weakness": 0,
  };

  let allocated = 0;
  for (const name of STAGE_ORDER) {
    const days = Math.round(totalDays * DEFAULT_STAGE_SHARES[name]);
    dayCounts[name] = days;
    allocated += days;
  }

  // Rounding can over- or under-allocate by a day or two -- reconcile
  // against the final stage, which is also where FR-006's "at least
  // one day" guarantee is enforced, so both corrections land in the
  // same place rather than two separate special cases.
  dayCounts["final-weakness"] += totalDays - allocated;
  if (dayCounts["final-weakness"] < 1) {
    const shortfall = 1 - dayCounts["final-weakness"];
    dayCounts["final-weakness"] = 1;
    // Pull the shortfall from the largest earlier stage first, so no
    // stage goes negative.
    const earlierStages: ExamStageName[] = ["diagnostic", "interleaving", "timed-mixed"];
    let remaining = shortfall;
    for (const name of [...earlierStages].sort((a, b) => dayCounts[b] - dayCounts[a])) {
      if (remaining <= 0) break;
      const take = Math.min(dayCounts[name], remaining);
      dayCounts[name] -= take;
      remaining -= take;
    }
  }

  const stages: ExamStage[] = [];
  let cursor = new Date(now);
  for (const name of STAGE_ORDER) {
    const days = dayCounts[name];
    const startDate = new Date(cursor);
    const endDate = new Date(cursor.getTime() + days * MS_PER_DAY);
    if (days > 0) {
      stages.push({ name, startDate, endDate });
    }
    cursor = endDate;
  }

  return stages;
}

/** null only if `now` is outside every stage -- shouldn't happen given
 * computeExamStages' own construction (stages are contiguous from
 * `now` to `examDate`), but never assumed. */
export function currentStage(stages: ExamStage[], now: Date): ExamStage | null {
  return stages.find((s) => now.getTime() >= s.startDate.getTime() && now.getTime() < s.endDate.getTime()) ?? null;
}
