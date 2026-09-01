import { createClient } from "@supabase/supabase-js";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const FIXTURE_PATH = path.join(process.cwd(), "tests/e2e/.tutor-agent-fixture.json");
const STORAGE_STATE_PATH = path.join(process.cwd(), "tests/e2e/.tutor-agent-storage-state.json");

export default async function globalTeardown() {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env.local"));
  } catch {
    // Already loaded -- fine.
  }
  try {
    const raw = await readFile(FIXTURE_PATH, "utf-8");
    const fixture = JSON.parse(raw) as { userId: string; courseId: string };

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await admin.from("courses").delete().eq("id", fixture.courseId);
    await admin.auth.admin.deleteUser(fixture.userId);
  } catch {
    // Fixture file missing means setup never completed far enough to
    // create anything -- nothing to clean up.
  } finally {
    await rm(FIXTURE_PATH, { force: true });
    await rm(STORAGE_STATE_PATH, { force: true });
  }
}
