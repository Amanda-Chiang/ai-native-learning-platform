import { getDueQueue } from "@/features/review-scheduler/due-queue.ts";
import { DueQueue } from "@/features/review-scheduler/components/DueQueue.tsx";

export default async function CourseReviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const items = await getDueQueue(courseId);

  return <DueQueue courseId={courseId} items={items} />;
}
