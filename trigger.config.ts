import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev project configuration -- tells the Trigger.dev CLI where
 * task files live (`dirs`) and which project to talk to (`project`).
 *
 * No live Trigger.dev account exists yet (specs/002-account-course-artifact-foundation
 * Assumptions). `project` below is a placeholder -- replace it with the
 * real project ref from the Trigger.dev dashboard once a project is
 * created, per quickstart.md Group B1. The CLI will fail to connect
 * until this is a real value; that's expected and matches this feature's
 * documented scope (built completely against the documented interface,
 * verified once credentials exist).
 */
export default defineConfig({
  project: "REPLACE_WITH_REAL_TRIGGER_DEV_PROJECT_REF",
  dirs: ["./trigger"],
  // ingest-artifact only does deterministic validation (no AI calls,
  // per spec FR-010), so 60s is generous headroom, not a tight budget.
  maxDuration: 60,
});
