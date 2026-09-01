import { listArtifacts } from "@/features/artifacts/actions.ts";
import { ArtifactBoard } from "@/features/artifacts/artifact-board.tsx";

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
      <ArtifactBoard courseId={courseId} initialArtifacts={artifacts} />
    </main>
  );
}
