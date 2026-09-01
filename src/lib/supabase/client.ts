import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types.ts";

/**
 * Browser Supabase client, scoped by the anon key. Safe to expose to the
 * client because Postgres row-level security -- not this key -- enforces
 * per-user data isolation (research.md).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
