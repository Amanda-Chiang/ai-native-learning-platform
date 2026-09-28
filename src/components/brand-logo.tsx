/**
 * Placeholder wordmark only -- brand-identity.md's own recorded gap:
 * only a logo screenshot exists, not a real SVG/PNG icon asset. This
 * renders text, not an attempt to redraw the real icon from memory.
 * Swap in a real <img>/<svg> here once a real asset file lands; every
 * consumer (AppShell, sign-in, sign-up) goes through this one component.
 */
export function BrandLogo() {
  return <span style={s.wordmark}>Orca</span>;
}

const s: Record<string, React.CSSProperties> = {
  wordmark: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--text-primary)",
  },
};
