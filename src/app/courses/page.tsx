import Link from "next/link";
import { createCourse, listCourses } from "@/features/courses/actions.ts";
import { CreateCourseForm } from "@/features/courses/components/CreateCourseForm.tsx";

export default async function CoursesPage() {
  const courses = await listCourses();

  return (
    <main>
      <h1>Your courses</h1>

      {courses.length === 0 ? (
        <p>You haven&apos;t created a course yet.</p>
      ) : (
        <ul>
          {courses.map((course) => (
            <li key={course.id}>
              <Link href={`/courses/${course.id}`}>{course.name}</Link>
            </li>
          ))}
        </ul>
      )}

      <CreateCourseForm createCourse={createCourse} />
    </main>
  );
}
