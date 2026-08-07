import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

// マイグレーションSQLの静的検証。実行ディレクトリに依存しないよう、
// パスは本ファイルの位置（import.meta.url）から解決する。
const repoRoot = new URL("../../", import.meta.url);

describe("database migrations", () => {
  it("defines every table and view and keeps admin helpers out of the schema", async () => {
    // TC-INFRA-013
    const migrationFiles = [
      "supabase/migrations/0001_common_functions.sql",
      "supabase/migrations/0002_profiles.sql",
      "supabase/migrations/0003_teams.sql",
      "supabase/migrations/0004_team_members.sql",
      "supabase/migrations/0005_team_invites.sql",
      "supabase/migrations/0006_matching_queue.sql",
      "supabase/migrations/0007_matches.sql",
      "supabase/migrations/0008_rating_history.sql",
      "supabase/migrations/0009_system_settings.sql",
      "supabase/migrations/0010_audit_logs.sql",
      "supabase/migrations/0011_views.sql",
      "supabase/migrations/0012_triggers.sql",
      "supabase/migrations/0013_rls.sql",
      "supabase/migrations/0014_seed.sql",
    ];

    const contents = [];
    for (const file of migrationFiles) {
      const content = await Deno.readTextFile(new URL(file, repoRoot));
      contents.push(content);
    }

    const allContent = contents.join("\n");

    // Check that all 9 tables are defined
    const expectedTables = [
      "profiles",
      "teams",
      "team_members",
      "team_invites",
      "matching_queue",
      "matches",
      "rating_history",
      "system_settings",
      "audit_logs",
    ];

    for (const table of expectedTables) {
      assertStringIncludes(
        allContent,
        `CREATE TABLE ${table} (`,
        `Table '${table}' should be defined`,
      );
    }

    // Check that all 4 views are defined
    const expectedViews = [
      "team_ranking_view",
      "team_detail_view",
      "match_list_view",
      "match_detail_view",
    ];

    for (const view of expectedViews) {
      assertStringIncludes(
        allContent,
        `CREATE VIEW ${view} AS`,
        `View '${view}' should be defined`,
      );
    }

    // Check that migration files are numbered sequentially (4-digit zero-padded)
    const sortedFiles = [...migrationFiles].sort();
    for (let i = 0; i < sortedFiles.length; i++) {
      const expectedIndex = String(i + 1).padStart(2, "0");
      const expectedFileName = `supabase/migrations/00${expectedIndex}_`;
      assertStringIncludes(
        sortedFiles[i],
        expectedFileName,
        `Migration file ${i + 1} should be named correctly`,
      );
    }

    // Check that admin functions are NOT defined (ADR-020)
    const forbiddenFunctions = [
      "auth_is_admin",
      "is_admin",
      "check_admin_role",
    ];

    for (const func of forbiddenFunctions) {
      assertEquals(
        allContent.toLowerCase().includes(func),
        false,
        `Function '${func}' should not be defined`,
      );
    }
  });
});
