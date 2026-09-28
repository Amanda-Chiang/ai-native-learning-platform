/**
 * Deterministic date formatting for anything rendered in a component
 * that is server-rendered and then hydrated.
 *
 * Two real bugs motivated this (architecture-log.md, 2026-09-28), and
 * both are fixed by the same two choices -- a pinned locale and a pinned
 * time zone:
 *
 * 1. **Off-by-one day.** `exam_configs.exam_date` is a Postgres `date`,
 *    which reaches the client as "2026-10-18". `new Date("2026-10-18")`
 *    is UTC midnight, so `.toLocaleDateString()` in any negative-offset
 *    zone renders the PREVIOUS day -- a student in New York saw an
 *    Oct 18 exam as "10/17/2026", including in the delete-confirmation
 *    dialog. Formatting in UTC renders the calendar day that was
 *    actually stored.
 * 2. **Hydration mismatch.** The server formats with the server's locale
 *    and zone, the browser with the user's. React reports the resulting
 *    text difference as a hydration mismatch and explicitly "won't patch
 *    it up" -- the markup silently keeps whichever value lost.
 *
 * The tradeoff, stated plainly: dates render in `en-US` in UTC for every
 * viewer, so a user outside UTC sees a timestamp's UTC calendar day
 * rather than their own local day. That is a deliberate trade of
 * localization for determinism. Honoring a viewer's real locale requires
 * formatting after mount (client-only, post-hydration) -- worth doing if
 * the product ever needs true localization, but it is strictly more
 * machinery than the current UI needs, and the day-shifting bug above
 * makes naive local formatting worse than wrong-by-locale.
 */

const FALLBACK = "Unknown date";

/** Stable across hosts: never reads the ambient locale or `TZ`. */
const SHORT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const LONG = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

function toDate(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "10/18/2026". Returns an explicit "Unknown date" for an unparseable
 * value rather than "Invalid Date" or a silently substituted today --
 * a missing date must look missing (CLAUDE.md's no-silent-placeholders
 * rule).
 */
export function formatCalendarDate(value: string | Date): string {
  const d = toDate(value);
  return d ? SHORT.format(d) : FALLBACK;
}

/** "Sun, Oct 18". Same guarantees as {@link formatCalendarDate}. */
export function formatCalendarDateLong(value: string | Date): string {
  const d = toDate(value);
  return d ? LONG.format(d) : FALLBACK;
}
