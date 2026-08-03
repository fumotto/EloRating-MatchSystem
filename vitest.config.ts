import { defineConfig } from "vitest/config";

// テストは tests/ 配下に置く（00_DirectoryStructure.md）。
// Edge Functions は Deno 前提だが、現時点では純粋なロジックを Vitest で検証する範囲に留める。
export default defineConfig({
    test: {
        include: ["tests/**/*.{test,spec}.ts"],
        environment: "node",
    },
});
