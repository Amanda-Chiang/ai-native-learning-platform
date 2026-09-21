import { createClient } from "@/lib/supabase/server.ts";
import { getDueQueue } from "@/features/review-scheduler/due-queue.ts";
import { getConnectSession } from "@/features/review-scheduler/actions.ts";
import { DueQueue } from "@/features/review-scheduler/components/DueQueue.tsx";

/**
 * ConnectSessionResult (connect-session.ts) is a pure function's output
 * over bare ids by design -- its own unit tests assert on ids, and
 * threading a name lookup through it would couple a tested pure
 * function to a live Supabase call. Names are resolved here instead,
 * at the presentation edge, same approach today.ts already used for
 * Home's own session preview (conceptNames, not embedding names into
 * review-scheduler's domain types).
 */
async function resolveConnectConceptNames(courseId: string, connect: Awaited<ReturnType<typeof getConnectSession>>) {
  const ids = new Set<string>();
  for (const c of connect.newConcepts) ids.add(c.conceptId);
  for (const c of connect.weakConnections) {
    ids.add(c.sourceConceptId);
    ids.add(c.targetConceptId);
  }
  for (const c of connect.lowConnectivityConcepts) ids.add(c.conceptId);
  for (const c of connect.confusedPairs) {
    ids.add(c.conceptAId);
    ids.add(c.conceptBId);
  }

  if (ids.size === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase
    .from("course_concepts")
    .select("id, canonical_name")
    .eq("course_id", courseId)
    .in("id", Array.from(ids));

  return Object.fromEntries((data ?? []).map((row) => [row.id, row.canonical_name]));
}

export default async function CourseReviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const [items, connect] = await Promise.all([getDueQueue(courseId), getConnectSession(courseId)]);
  const conceptNames = await resolveConnectConceptNames(courseId, connect);

  return <DueQueue courseId={courseId} items={items} connect={connect} conceptNames={conceptNames} />;
}
