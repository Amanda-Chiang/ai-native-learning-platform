import OpenAI from "openai";

/**
 * Thin OpenAI client factory, same shape as src/lib/supabase/{client,server}.ts.
 *
 * Deliberately does NOT construct the client at module load time (an
 * `OpenAI` constructor with no key would throw, and this module is
 * imported from trigger/extract-course-graph.ts, a shared entrypoint
 * that must tolerate a missing OPENAI_API_KEY per Phase 1's "every
 * shared entrypoint must tolerate missing credentials" rule --
 * brain/decisions/architecture-log.md). Callers check
 * isOpenAiConfigured() explicitly before calling getOpenAiClient(),
 * per research.md's missing-key decision (a distinct, visible failure
 * status -- never a silent no-op).
 */
export function isOpenAiConfigured(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0;
}

export function getOpenAiClient(): OpenAI {
  if (!isOpenAiConfigured()) {
    throw new Error("OPENAI_API_KEY is not configured -- call isOpenAiConfigured() first.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
