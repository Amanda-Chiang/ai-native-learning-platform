import Link from "next/link";
import { createClient } from "@/lib/supabase/server.ts";
import { signOut } from "@/features/auth/actions.ts";

/**
 * Server Component: reads the current session and shows sign-out when
 * signed in, or sign-in/sign-up links when not (T012).
 */
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
