import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types.ts";

/**
 * Server-side Supabase client for Server Components and Server Actions,
 * reading the session from Next.js cookies (research.md's "Auth
 * integration" decision). Still RLS-scoped by the anon key -- this is
 * not the service-role client (see trigger/ingest-artifact.ts for that).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies can't be
            // written directly -- safe to ignore because
            // src/middleware.ts refreshes the session on every request.
          }
        },
      },
    },
  );
}
