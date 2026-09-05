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
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <span style={s.logoMark}>◆</span>
          <span style={s.logoWord}>Luminary</span>
        </div>

        <div style={s.heading}>
          <h1 style={s.title}>Sign in</h1>
          <p style={s.subtitle}>Welcome back. Continue where you left off.</p>
        </div>

        <form action={handleSubmit} style={s.form}>
          {error && (
            <p style={s.error} role="alert">
              {error}
            </p>
          )}

          <div style={s.field}>
            <label style={s.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              style={s.input}
              placeholder="you@university.edu"
            />
          </div>

          <div style={s.field}>
            <label style={s.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              style={s.input}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={pending} style={{ ...s.submit, opacity: pending ? 0.7 : 1 }}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={s.footer}>
          {"Don't have an account? "}
          <Link href="/sign-up" style={s.link}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 },
  card: { width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 28 },
  logo: { display: "flex", alignItems: "center", gap: 8 },
  logoMark: { fontSize: 14, color: "var(--clay)", lineHeight: 1 },
  logoWord: { fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)" },
  heading: { display: "flex", flexDirection: "column", gap: 4 },
  title: { margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--text-primary)" },
  subtitle: { margin: 0, fontSize: 14, color: "var(--text-secondary)", letterSpacing: "-0.005em" },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)", letterSpacing: "0.01em" },
  input: {
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    outline: "none",
  },
  error: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    background: "var(--clay-muted)",
    border: "1px solid var(--clay-border)",
    fontSize: 13,
    color: "var(--clay)",
  },
  submit: {
    padding: 11,
    background: "var(--clay)",
    color: "var(--clay-fg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    letterSpacing: "-0.01em",
    marginTop: 4,
  },
  footer: { margin: 0, fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" },
  link: { color: "var(--clay)", fontWeight: 500 },
};
