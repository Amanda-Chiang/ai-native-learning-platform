import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Playwright's default testMatch also matches "*.test.ts" -- this
  // project's own convention already separates node:test unit specs
  // (tests/unit/**/*.test.ts) from Playwright specs (tests/e2e|visual/
  // **/*.spec.ts), but without this, Playwright still tried to load
  // every unit test file too, failing on node:test's own syntax
  // (import.meta, etc.) it doesn't support.
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  // tutor-agent's own suite provisions its test user/course and captures
  // a real signed-in session once (tests/e2e/global-setup.ts) rather than
  // signing in per test -- the first authenticated Playwright coverage
  // in this project.
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Scoped to this one feature's tool-calling loop only (research.md
    // "No streaming"/plan.md's Testing section) -- gated by an explicit
    // env var so it's never mistakeable for a real model response;
    // visual/unit suites never call sendTutorMessage so this has no
    // effect on them.
    env: { TUTOR_AGENT_USE_TEST_DOUBLE: "true" },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "**/tutor-agent.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: "**/tutor-agent.spec.ts",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "tutor-agent-e2e",
      testMatch: "**/tutor-agent.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./tests/e2e/.tutor-agent-storage-state.json",
      },
    },
  ],
});
