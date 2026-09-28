import { readFile } from "node:fs/promises";
import path from "node:path";
import { getHomeOverview } from "@/features/courses/home-overview.ts";
import { IslandHome } from "@/features/courses/components/IslandHome.tsx";
import type { HomeOverview } from "@/features/courses/home-summary.ts";

/**
 * Loads the checked-in demo fixture as the HomeOverview -- the same
 * `courseId === "demo"` special-case pattern concept-atlas-renderer's
 * and course-graph-ingestion's visual suites already use
 * (src/app/(app)/courses/[courseId]/atlas/page.tsx and .../material/
 * page.tsx), adapted for a route with no courseId segment: Home lives
 * at "/", so the switch is a `?demo=1` search param instead. Every
 * value in the fixture (daysUntilDue, dueNowCount, label, exam
 * daysLeft) is pre-computed and checked in rather than derived from
 * "now" at render time, so tests/visual/home.spec.ts's baselines never
 * drift with the calendar date the suite happens to run on.
 */
async function loadDemoHomeOverview(): Promise<HomeOverview> {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/home-demo.json");
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as HomeOverview;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const overview = demo === "1" ? await loadDemoHomeOverview() : await getHomeOverview();

  return <IslandHome overview={overview} />;
}
