import type { CSSProperties } from "react";
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
    <header style={s.header}>
      {user ? (
        <form action={signOut} style={s.userForm}>
          <span style={s.email}>{user.email}</span>
          <button type="submit" style={s.signOut}>
            Sign out
          </button>
        </form>
      ) : (
        <nav style={s.nav}>
          <Link href="/sign-in" style={s.authLink}>
            Sign in
          </Link>
          <Link href="/sign-up" style={s.authLinkPrimary}>
            Sign up
          </Link>
        </nav>
      )}
    </header>
  );
}

const s: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
  },
  userForm: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  email: {
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    color: "var(--text-secondary)",
    letterSpacing: "-0.01em",
  },
  signOut: {
    fontSize: 12.5,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    color: "var(--text-tertiary)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "4px 8px",
    cursor: "pointer",
    letterSpacing: "-0.01em",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  authLink: {
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    color: "var(--text-secondary)",
    textDecoration: "none",
  },
  authLinkPrimary: {
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    color: "var(--clay)",
    textDecoration: "none",
  },
};
