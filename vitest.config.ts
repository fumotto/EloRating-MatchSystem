import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// テストは tests/ 配下に置く（00_DirectoryStructure.md）。
// Vitest が見るのは tests/unit/ と src/ のコンポーネントテストのみ。
// tests/integration/ は Deno Test の担当であり、jsr: / https: の import を含むため
// Vitest からは解決できない（10_TestSpecification.md 3章）。
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./tests/unit/setup.ts"],
  },
});
