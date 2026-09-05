import { getTodayOverview } from "@/features/courses/today.ts";
import { TodayDashboard } from "@/features/courses/components/TodayDashboard.tsx";

export default async function Home() {
  const overview = await getTodayOverview();

  return <TodayDashboard overview={overview} />;
}
