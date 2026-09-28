import { IconPlay } from "@/components/icons.tsx";

/**
 * A play control for a flow that genuinely does not exist yet (Deep
 * review is Phase 9; the Quick review quiz flow is Phase 4).
 *
 * It is deliberately a real, visibly-disabled button carrying its own
 * reason rather than either (a) a button wired to some other flow as a
 * stand-in or (b) a silently inert control. Both alternatives were
 * considered and rejected: this project's no-silent-placeholders rule
 * says an unavailable thing must look unavailable, and a button that
 * quietly does nothing is indistinguishable from one that is broken.
 *
 * `title` gives the reason on hover; `aria-label` folds it into the
 * accessible name so a screen-reader user gets the same explanation a
 * sighted user does, rather than hearing an unexplained "dimmed button".
 */
export function PendingActionButton({ reason }: { reason: string }) {
  return (
    <button type="button" disabled aria-label={reason} title={reason} style={s.button}>
      <IconPlay />
    </button>
  );
}

const s: Record<string, React.CSSProperties> = {
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-tertiary)",
    cursor: "not-allowed",
  },
};
