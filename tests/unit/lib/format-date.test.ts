import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { formatCalendarDate, formatCalendarDateLong } from "../../../src/lib/format-date.ts";

/**
 * Two separate guarantees are under test here, both of which were real
 * bugs before this module existed (see brain/decisions/architecture-log.md,
 * 2026-09-28):
 *
 * 1. A Postgres `date` ("2026-10-18") parses as UTC midnight, so
 *    formatting it in a negative-offset local zone renders the PREVIOUS
 *    day -- a student in New York saw an Oct 18 exam as Oct 17.
 * 2. Locale/zone-dependent formatting differs between the server render
 *    and the client hydration, which React reports as a hydration
 *    mismatch and refuses to patch up.
 */

test("formatCalendarDate renders the stored calendar day, not a zone-shifted one", () => {
  assert.equal(formatCalendarDate("2026-10-18"), "10/18/2026");
  assert.equal(formatCalendarDate("2026-01-01"), "1/1/2026");
  assert.equal(formatCalendarDate("2026-12-31"), "12/31/2026");
});

test("formatCalendarDateLong renders the stored calendar day", () => {
  assert.equal(formatCalendarDateLong("2026-10-18"), "Sun, Oct 18");
});

test("a Date instant formats as its UTC calendar day", () => {
  assert.equal(formatCalendarDate(new Date("2026-10-18T00:00:00.000Z")), "10/18/2026");
  assert.equal(formatCalendarDate("2026-10-18T23:30:00.000Z"), "10/18/2026");
});

test("output is identical across host time zones (the off-by-one regression guard)", () => {
  const script = `
    const { formatCalendarDate, formatCalendarDateLong } = await import("${process.cwd()}/src/lib/format-date.ts");
    process.stdout.write(formatCalendarDate("2026-10-18") + "|" + formatCalendarDateLong("2026-10-18"));
  `;
  const run = (tz: string) =>
    execFileSync(process.execPath, ["--input-type=module", "--experimental-strip-types", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

  const utc = run("UTC");
  assert.equal(utc, "10/18/2026|Sun, Oct 18");
  for (const tz of ["America/New_York", "Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Niue"]) {
    assert.equal(run(tz), utc, `${tz} disagreed with UTC`);
  }
});

test("an invalid or empty date is visibly invalid, never a plausible stand-in", () => {
  assert.equal(formatCalendarDate(""), "Unknown date");
  assert.equal(formatCalendarDate("not-a-date"), "Unknown date");
});
