import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev project configuration -- tells the Trigger.dev CLI where
 * task files live (`dirs`) and which project to talk to (`project`).
 *
 * Live project created 2026-09-02, closing the gap
 * specs/002-account-course-artifact-foundation's Assumptions section
 * originally documented (built completely against the documented
 * interface, verified once credentials exist). Requires
 * `npx trigger.dev@latest dev` running locally (reading
 * TRIGGER_SECRET_KEY from .env.local) for task runs to actually
 * process.
 */
export default defineConfig({
  project: "proj_pywxjftdhajrdxxysogs",
  dirs: ["./trigger"],
  // ingest-artifact only does deterministic validation (no AI calls,
  // per spec FR-010), so 60s is generous headroom, not a tight budget.
  maxDuration: 60,
});
