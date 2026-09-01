"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server.ts";

/**
 * Server action contracts: specs/002-account-course-artifact-foundation/contracts/server-actions.md
 */

export async function signUp(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/courses");
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message regardless of failure reason -- never reveal
    // whether the email exists (contracts/server-actions.md).
    return { error: "Invalid email or password." };
  }

  redirect("/courses");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
