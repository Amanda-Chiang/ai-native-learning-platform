import { getCourse } from "@/features/courses/actions.ts";
import { CourseShell } from "@/components/course-shell.tsx";

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourse(courseId);

  return <CourseShell courseName={course?.name ?? courseId}>{children}</CourseShell>;
}
