"use server";

import { createClient } from "@/lib/supabase/server.ts";
import type { LayoutPreference } from "@/features/concept-atlas/layout-preference.ts";

/**
 * Server action contracts: specs/003-concept-atlas-renderer/contracts/layout-actions.md
 */

export async function getLayoutPreference(courseId: string): Promise<LayoutPreference[]> {
  const supabase = await createClient();

  // No owner_id filter here by design, same pattern as Phase 1's
  // listCourses/listArtifacts -- RLS is the only filter.
  const { data, error } = await supabase
    .from("graph_layouts")
    .select("entity_id, entity_type, collapsed, x, y")
    .eq("course_id", courseId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    entityId: row.entity_id,
    entityType: row.entity_type,
    collapsed: row.collapsed,
    x: row.x,
    y: row.y,
  }));
}

export async function saveLayoutPreference(
  courseId: string,
  entries: LayoutPreference[],
): Promise<{ error: string | null }> {
  if (entries.length === 0) {
    return { error: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to save layout preferences." };
  }

  const rows = entries.map((entry) => ({
    owner_id: user.id,
    course_id: courseId,
    entity_id: entry.entityId,
    entity_type: entry.entityType,
    collapsed: entry.collapsed,
    x: entry.x,
    y: entry.y,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("graph_layouts")
    .upsert(rows, { onConflict: "owner_id,course_id,entity_id" });

  return { error: error?.message ?? null };
}
