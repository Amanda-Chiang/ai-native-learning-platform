import { getHomeOverview } from "@/features/courses/home-overview.ts";
import { IslandHome } from "@/features/courses/components/IslandHome.tsx";

export default async function Home() {
  return <IslandHome overview={await getHomeOverview()} />;
}
