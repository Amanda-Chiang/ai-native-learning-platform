import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request, per
 * @supabase/ssr's documented App Router pattern. Required for
 * src/lib/supabase/server.ts's session reads to stay valid across
 * Server Component requests, which can't write cookies themselves.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // No live Supabase project exists yet in this environment
  // (specs/002-account-course-artifact-foundation Assumptions). Without
  // this check, every single route -- including ones with nothing to do
  // with auth -- would crash the whole dev server, since
  // createServerClient throws immediately on an empty URL/key. Skip
  // session refresh entirely when unconfigured; there is no session to
  // refresh without a project anyway.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching auth.getUser() is what actually triggers a token refresh
  // when the current session is expired -- without this call the cookie
  // rewriting above never happens.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
