import { getDueQueue } from "@/features/review-scheduler/due-queue.ts";
import { getConnectSession } from "@/features/review-scheduler/actions.ts";
import { DueQueue } from "@/features/review-scheduler/components/DueQueue.tsx";

export default async function CourseReviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const [items, connect] = await Promise.all([getDueQueue(courseId), getConnectSession(courseId)]);

  return <DueQueue courseId={courseId} items={items} connect={connect} />;
}
