"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "@/features/auth/actions.ts";

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await signIn(email, password);

    // signIn() redirects on success, so reaching here means it failed.
    if (result?.error) {
      setError(result.error);
    }
    setPending(false);
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form action={handleSubmit}>
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p>
        Need an account? <Link href="/sign-up">Sign up</Link>
      </p>
    </main>
  );
}
