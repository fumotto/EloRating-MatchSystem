// E2E（10_TestSpecification_Part10_E2E.md / 11_Deployment.md 11.3）。
//
// Supabase Local と Edge Functions は事前に起動しておく必要がある。
//   supabase start
//   supabase functions serve --env-file .env
// 本番環境に対してE2Eを実行してはならない（11.3）。
import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "./tests/e2e",
  // サブアカウント対策を検証環境で切る（ADR-036 ⑤）。Seed の既定値は本番と同じであり、
  // 差はここで付ける。詳細は tests/e2e/global-setup.ts を参照。
  globalSetup: "./tests/e2e/global-setup.ts",
  // 状態を共有するシナリオがあるため直列で流す。並列にするとキューや所属が干渉する。
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // 失敗時のレポートを CI の成果物として残すため、常に html を出す。
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "bun run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
