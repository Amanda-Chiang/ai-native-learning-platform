"use server";

import { createClient } from "@/lib/supabase/server.ts";

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
    .insert({ owner_id: user.id, name: trimmedName })
    .select("id, name, created_at")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create course." };
  }

  return { course: { id: data.id, name: data.name, createdAt: data.created_at } };
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
