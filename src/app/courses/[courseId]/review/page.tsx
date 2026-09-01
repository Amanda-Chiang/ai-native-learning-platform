import { readFile } from "node:fs/promises";
import path from "node:path";
import { getReviewQueue, type ReviewQueueItem } from "@/features/course-graph-ingestion/actions.ts";
import { ReviewQueue } from "@/features/course-graph-ingestion/components/ReviewQueue.tsx";

/**
 * Same explicit "demo" fixture special case as
 * src/app/courses/[courseId]/atlas/page.tsx, for the same reason:
 * tests/visual/review-queue.spec.ts needs a queue populated without a
 * live OpenAI extraction run or hand-seeded Supabase rows behind a real
 * auth session. Every other courseId goes through the real
 * getReviewQueue.
 */
async function loadDemoReviewQueue(): Promise<ReviewQueueItem[]> {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/review-queue-demo.json");
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as ReviewQueueItem[];
}

export default async function CourseReviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const items = courseId === "demo" ? await loadDemoReviewQueue() : await getReviewQueue(courseId);

  return (
    <main>
      <h1>Review Queue</h1>
      <ReviewQueue items={items} />
    </main>
  );
}
