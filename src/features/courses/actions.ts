"use server";

import { createClient } from "@/lib/supabase/server.ts";
import { ISLAND_SHAPES } from "@/features/courses/island-shapes.ts";

/**
 * Server action contracts: specs/002-account-course-artifact-foundation/contracts/server-actions.md
 */

export type Course = { id: string; name: string; createdAt: string };

export async function createCourse(
  name: string,
): Promise<{ course: Course } | { error: string }> {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { error: "Course name cannot be empty." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a course." };
  }

  // owner_id comes from the authenticated session, never from client
  // input -- RLS also enforces this, but setting it explicitly here
  // keeps the insert's intent unambiguous.
  const { data, error } = await supabase
    .from("courses")
    // Assigned once, from the library size as it stands today, and
    // never recomputed -- see island-shapes.ts's append-only note and
    // migration 0016. Math.random is fine here: this is a cosmetic
    // starting shape, not an identifier anything depends on.
    .insert({
      owner_id: user.id,
      name: trimmedName,
      island_shape_index: Math.floor(Math.random() * ISLAND_SHAPES.length),
    })
    .select("id, name, created_at")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create course." };
  }

  return { course: { id: data.id, name: data.name, createdAt: data.created_at } };
}

export async function getCourse(courseId: string): Promise<Course | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courses")
    .select("id, name, created_at")
    .eq("id", courseId)
    .single();

  if (error || !data) {
    return null;
  }

  return { id: data.id, name: data.name, createdAt: data.created_at };
}

export async function listCourses(): Promise<Course[]> {
  const supabase = await createClient();

  // No owner_id filter here by design -- RLS is the only filter, so
  // accepting one as a parameter would be a way to accidentally bypass
  // the isolation guarantee (contracts/server-actions.md).
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

export type CourseWithIsland = Course & { islandShapeIndex: number };

export type CoursesResult =
  | { ok: true; courses: CourseWithIsland[] }
  | { ok: false; reason: string };

/**
 * `listCourses`, but able to say that it failed.
 *
 * `listCourses` returns [] on error, which every existing caller
 * already depends on and which is a separate, deliberately-deferred
 * decision (architecture-log, 2026-09-28). On the Home dashboard that
 * behavior would be actively wrong: an empty list renders "no courses
 * yet -- add a class", so a student with twelve courses would be told
 * they have none. This sibling surfaces the error instead, and carries
 * the island index Home needs. `listCourses` itself is untouched.
 */
export async function listCoursesResult(): Promise<CoursesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courses")
    .select("id, name, created_at, island_shape_index")
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, reason: error.message };
  }
  if (!data) {
    return { ok: false, reason: "The course list came back empty with no error." };
  }

  return {
    ok: true,
    courses: data.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      islandShapeIndex: row.island_shape_index,
    })),
  };
}
