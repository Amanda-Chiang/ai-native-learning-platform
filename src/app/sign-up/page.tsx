"use client";

import { useState } from "react";
import Link from "next/link";
import { signUp } from "@/features/auth/actions.ts";

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await signUp(email, password);

    // signUp() redirects on success, so reaching here means it failed.
    if (result?.error) {
      setError(result.error);
    }
    setPending(false);
  }

  return (
    <main>
      <h1>Create an account</h1>
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
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Sign up"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p>
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
