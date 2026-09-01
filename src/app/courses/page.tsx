import Link from "next/link";
import { createCourse, listCourses } from "@/features/courses/actions.ts";

async function handleCreateCourse(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "");
  await createCourse(name);
}

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

      <form action={handleCreateCourse}>
        <label>
          Course name
          <input type="text" name="name" required placeholder="e.g. Data Structures & Algorithms" />
        </label>
        <button type="submit">Create course</button>
      </form>
    </main>
  );
}
