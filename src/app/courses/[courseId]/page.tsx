import Link from "next/link";
import { listArtifacts } from "@/features/artifacts/actions.ts";
import { ArtifactBoard } from "@/features/artifacts/artifact-board.tsx";

/**
 * Found live: this page had no links to any other feature (atlas,
 * tutor, review queue, study, exam plan) -- each was reachable only by
 * typing its URL directly. Added a plain nav here so a real course
 * owner can actually get from "uploaded material" to the rest of the
 * product.
 */
export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const artifacts = await listArtifacts(courseId);

  return (
    <main>
      <h1>Course material</h1>
      <nav>
        <Link href={`/courses/${courseId}/atlas`}>Concept atlas</Link>{" | "}
        <Link href={`/courses/${courseId}/review`}>Review queue</Link>{" | "}
        <Link href={`/courses/${courseId}/tutor`}>Tutor</Link>{" | "}
        <Link href={`/courses/${courseId}/study`}>Study</Link>{" | "}
        <Link href={`/courses/${courseId}/exam-plan`}>Exam plan</Link>
      </nav>
      <ArtifactBoard courseId={courseId} initialArtifacts={artifacts} />
    </main>
  );
}
