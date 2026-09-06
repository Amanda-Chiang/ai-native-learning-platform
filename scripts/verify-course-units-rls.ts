#!/usr/bin/env node
/**
 * Live RLS verification for the review writes this branch added on
 * `course_units` (final-review I9).
 *
 * Why a live script and not a `node --test` unit test: RLS is enforced by
 * Postgres against a real JWT. Nothing runnable without a live Supabase
 * project can make this claim -- and asserting it against a fake client
 * would be exactly the kind of test that "passes" while the real policy
 * denies the write. There is no RLS test harness in this repo yet (a
 * pre-existing project-wide gap); this is deliberately the minimal
 * first one, scoped to the one table whose write pattern changed.
 *
 * What makes this worth having: a Supabase `.update()` blocked by RLS
 * returns `error: null` with ZERO rows affected. `confirmCandidate` would
 * return `{ error: null }`, the review queue would remove the card, and
 * the unit would stay 'proposed' forever with the user believing they
 * confirmed it. So every check below asserts on the ROW's actual value
 * after the write, never on the absence of an error.
 *
 * Usage: node --experimental-strip-types scripts/verify-course-units-rls.ts
 *   (Node 24 native TS, same convention as scripts/score-extraction.ts;
 *   reads .env.local for NEXT_PUBLIC_SUPABASE_URL, the anon key and
 *   SUPABASE_SERVICE_ROLE_KEY)
 *
 * Exits non-zero on the first failed expectation. Cleans up the throwaway
 * user/course/unit it creates, including on failure.
 */
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types.ts";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  // Already loaded (e.g. real env vars set directly) -- fine.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "verify-course-units-rls: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must all be set.",
  );
}

const admin = createClient<Database>(url, serviceKey);
const PASSWORD = "course-units-rls-check-1234";

const failures: string[] = [];
function check(description: string, ok: boolean) {
  if (ok) {
    console.log(`  ok   ${description}`);
  } else {
    console.log(`  FAIL ${description}`);
    failures.push(description);
  }
}

async function createUser(label: string) {
  const email = `course-units-rls-${label}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`could not create ${label} user: ${error?.message}`);

  const session = createClient<Database>(url!, anonKey!);
  const { error: signInError } = await session.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`could not sign in ${label} user: ${signInError.message}`);

  return { id: data.user.id, session };
}

async function readUnit(unitId: string) {
  const { data, error } = await admin.from("course_units").select("title, status").eq("id", unitId).single();
  if (error || !data) throw new Error(`could not read back unit ${unitId}: ${error?.message}`);
  return data;
}

const owner = await createUser("owner");
const stranger = await createUser("stranger");
let courseId: string | null = null;

try {
  const { data: course, error: courseError } = await admin
    .from("courses")
    .insert({ owner_id: owner.id, name: "course_units RLS check" })
    .select("id")
    .single();
  if (courseError || !course) throw new Error(`could not create course: ${courseError?.message}`);
  courseId = course.id;

  async function proposedUnit(title: string): Promise<string> {
    // Inserted the way the extraction task's service-role client does.
    const { data, error } = await admin
      .from("course_units")
      .insert({
        course_id: course!.id,
        owner_id: owner.id,
        title,
        status: "proposed",
        extraction_run_id: null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`could not insert proposed unit: ${error?.message}`);
    return data.id;
  }

  console.log("course_units_update_own (0003) vs. this branch's reviewer writes:");

  // 1. confirmCandidate("unit", id)
  const toConfirm = await proposedUnit("RLS check: confirm");
  await owner.session.from("course_units").update({ status: "confirmed" }).eq("id", toConfirm);
  check("owner's own session can flip a proposed unit to confirmed", (await readUnit(toConfirm)).status === "confirmed");

  // 2. editCandidate("unit", id, { title })
  const toEdit = await proposedUnit("RLS check: before edit");
  await owner.session.from("course_units").update({ title: "RLS check: after edit" }).eq("id", toEdit);
  check("owner's own session can rename a proposed unit", (await readUnit(toEdit)).title === "RLS check: after edit");

  // 3. rejectCandidate("unit", id)
  const toReject = await proposedUnit("RLS check: reject");
  await owner.session.from("course_units").update({ status: "archived" }).eq("id", toReject);
  check("owner's own session can archive a proposed unit", (await readUnit(toReject)).status === "archived");

  // 4. The policy is not permissive to everyone: a signed-in non-owner
  //    must not be able to confirm someone else's unit.
  const someoneElses = await proposedUnit("RLS check: not yours");
  await stranger.session.from("course_units").update({ status: "confirmed" }).eq("id", someoneElses);
  check(
    "a different signed-in user CANNOT confirm another owner's unit",
    (await readUnit(someoneElses)).status === "proposed",
  );

  // 5. The read side the review queue depends on.
  const { data: visible } = await owner.session.from("course_units").select("id").eq("course_id", course.id);
  check("owner's own session can read its proposed units (review queue)", (visible ?? []).length === 4);
  const { data: notVisible } = await stranger.session.from("course_units").select("id").eq("course_id", course.id);
  check("a different signed-in user reads none of them", (notVisible ?? []).length === 0);
} finally {
  if (courseId) await admin.from("courses").delete().eq("id", courseId);
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(stranger.id);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} RLS expectation(s) failed.`);
  process.exit(1);
}
console.log("\nAll course_units RLS expectations hold.");
