import Link from "next/link";
import { createClient } from "@/lib/supabase/server.ts";
import { signOut } from "@/features/auth/actions.ts";

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Server Component: reads the current session and shows sign-out when
 * signed in, or sign-in/sign-up links when not (T012).
 *
 * This renders in the root layout, so it wraps every page in the app --
 * including ones with nothing to do with auth. Without a live Supabase
 * project configured yet, it must degrade to the signed-out view rather
 * than crash every single page render (same reasoning as the check in
 * src/middleware.ts).
 */
export async function SiteHeader() {
  const isSupabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const user = isSupabaseConfigured ? await getCurrentUser() : null;

  return (
    <header>
      <Link href="/">AI-Native Learning Platform</Link>
      {user ? (
        <form action={signOut}>
          <span>{user.email}</span>
          <button type="submit">Sign out</button>
        </form>
      ) : (
        <nav>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Sign up</Link>
        </nav>
      )}
    </header>
  );
}
