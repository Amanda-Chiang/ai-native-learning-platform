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

  // Never fall back to the raw courseId (a UUID) as a displayed "name" --
  // that's a silent placeholder indistinguishable from a real course name.
  // "demo" is the one non-UUID courseId this route accepts (the fixture
  // route several sibling pages special-case); anything else that fails
  // to load is an honest "couldn't find it" state, not a fake name.
  const courseName = courseId === "demo" ? "Demo course" : (course?.name ?? "Unknown course");

  return <CourseShell courseName={courseName}>{children}</CourseShell>;
}
