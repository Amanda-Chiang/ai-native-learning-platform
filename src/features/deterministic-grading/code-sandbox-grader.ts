import { Sandbox, TimeoutError } from "@e2b/code-interpreter";
import type { CodeGradingResult, CodeTestOutcome } from "./grading-evidence.ts";

/**
 * Real sandboxed code execution (research.md "Why E2B is a justified
 * new dependency"). Deliberately has no unit test of its own (tasks.md
 * Notes) -- mocking the one thing E2B was added for would test nothing
 * real; correctness is proven live (quickstart.md Group B).
 */

export type CodeGradingInput = {
  code: string;
  language: "javascript" | "python";
  tests: { name: string; assertion: string }[];
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function wrapAssertion(code: string, assertion: string, language: "javascript" | "python"): string {
  if (language === "python") {
    return `${code}\n\nassert (${assertion})\n`;
  }
  return `${code}\n\nif (!(${assertion})) { throw new Error("Assertion failed: ${assertion.replace(/"/g, '\\"')}"); }\n`;
}

export async function gradeCode(input: CodeGradingInput): Promise<CodeGradingResult> {
  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.create({ timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  } catch (err) {
    return { outcome: "did_not_complete", reason: "sandbox_error", detail: err instanceof Error ? err.message : String(err) };
  }

  try {
    const tests: CodeTestOutcome[] = [];

    for (const test of input.tests) {
      const snippet = wrapAssertion(input.code, test.assertion, input.language);
      const execution = await sandbox.runCode(snippet, {
        language: input.language,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });

      if (execution.error) {
        tests.push({
          name: test.name,
          passed: false,
          output: `${execution.error.name}: ${execution.error.value}`,
        });
      } else {
        tests.push({
          name: test.name,
          passed: true,
          output: [...execution.logs.stdout, ...execution.logs.stderr].join("\n"),
        });
      }
    }

    return { outcome: "graded", allPassed: tests.every((t) => t.passed), tests };
  } catch (err) {
    if (err instanceof TimeoutError) {
      return { outcome: "did_not_complete", reason: "timeout", detail: err.message };
    }
    return { outcome: "did_not_complete", reason: "sandbox_error", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    await sandbox.kill().catch(() => {
      // Best-effort cleanup -- a failure to kill the sandbox doesn't
      // change the real grading result already determined above.
    });
  }
}
