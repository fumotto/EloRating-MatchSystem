// 投了（ADR-032 ① / 10_TestSpecification Part5 3.4）。
//
// ★これが基本の経路である。承認を要さず即座に確定し、クールダウンを課さない。
import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler,
  setDbPool,
  resetDbPool,
  setJwtVerifier,
  resetJwtVerifier,
  setBroadcaster,
  resetBroadcaster,
} from "../../supabase/functions/concede-match/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const verifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-1" },
  });

const matchRow = (over: Record<string, unknown> = {}) => ({
  id: "match-1",
  team_a_id: "team-a",
  team_b_id: "team-b",
  winner_team_id: null,
  status: "PLAYING",
  version: 1,
  counter_claim_team_id: null,
  no_contest_requested_by_team_id: null,
  no_contest_request_count: 0,
  report_extension_count: 0,
  ...over,
});

const okStubs = (over: QueryStub[] = []): QueryStub[] => [
  ...over,
  ["FROM matches WHERE id = $1", [matchRow()]],
  ["SELECT team_id FROM team_members", [{ team_id: "team-b" }]],
  ["SELECT updates_locked", [{ updates_locked: false }]],
  ["SELECT rating_k FROM system_settings", [{ rating_k: 32 }]],
  ["SELECT id, rating FROM teams", [
    { id: "team-a", rating: 1500 },
    { id: "team-b", rating: 1500 },
  ]],
  ["UPDATE matches", [{ completed_at: new Date("2026-08-08T11:00:00Z") }]],
];

const post = (body: unknown) =>
  handler(new Request(URL_FN, { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify(body) }));

const withDb = async (stubs: QueryStub[], fn: (db: ReturnType<typeof createMockDb>) => Promise<void>) => {
  const db = createMockDb(stubs);
  setDbPool(db.pool as never);
  setJwtVerifier(verifier);
  setBroadcaster(() => Promise.resolve());
  try {
    await fn(db);
  } finally {
    resetDbPool();
    resetJwtVerifier();
    resetBroadcaster();
  }
};

describe("concede-match", () => {
  it("completes the match immediately on concession", async () => {
    // TC-MATCH-034 / TC-MATCH-035
    await withDb(okStubs(), async (db) => {
      const res = await post({ matchId: "match-1", version: 1 });
      assertEquals(res.status, 200);

      const update = db.findAll("UPDATE matches").find((q) => q.sql.includes("'COMPLETED'"))!;
      // ★PLAYING からも確定する。従来の承認は WINNER_REPORTED 限定だった。
      assertEquals(update.params.includes("PLAYING"), false); // status は配列で渡す
      assertStringIncludes(update.sql, "status = ANY($6)");
      assertEquals(db.committed(), true);
    });
  });

  it("sets the opponent as the winner", async () => {
    // TC-MATCH-036 自チームは敗者。勝者はもう一方として一意に定まる
    await withDb(okStubs(), async (db) => {
      await post({ matchId: "match-1", version: 1 });
      const update = db.findAll("UPDATE matches").find((q) => q.sql.includes("'COMPLETED'"))!;
      assertEquals(update.params.includes("team-a"), true);
    });
  });

  it("does not apply a cooldown after conceding", async () => {
    // TC-MATCH-038 ★投了は最短で次のキューへ入れる道である（ADR-032 ④）
    await withDb(okStubs(), async (db) => {
      await post({ matchId: "match-1", version: 1 });
      assertEquals(db.findAll("queue_cooldown_until").length, 0);
    });
  });

  it("updates both ratings on concession", async () => {
    // TC-MATCH-037
    await withDb(okStubs(), async (db) => {
      await post({ matchId: "match-1", version: 1 });
      assertEquals(db.findAll("INSERT INTO rating_history").length, 2);
      assertEquals(db.findAll("UPDATE teams SET rating").length, 2);
    });
  });

  it("treats a concession as an approval", async () => {
    // TC-MATCH-040 WINNER_REPORTED（相手が申告）からの投了
    const stubs = okStubs([
      ["FROM matches WHERE id = $1", [
        matchRow({ status: "WINNER_REPORTED", winner_team_id: "team-a" }),
      ]],
    ]);
    await withDb(stubs, async (db) => {
      const res = await post({ matchId: "match-1", version: 1 });
      assertEquals(res.status, 200);
      assertEquals(db.committed(), true);
    });
  });

  it("rejects conceding a win the team itself reported", async () => {
    // TC-MATCH-041 ★撤回と投了の混同を防ぐ。撤回の手段は用意しない
    const stubs = okStubs([
      ["FROM matches WHERE id = $1", [
        matchRow({ status: "WINNER_REPORTED", winner_team_id: "team-b" }),
      ]],
    ]);
    await withDb(stubs, async (db) => {
      const res = await post({ matchId: "match-1", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-009");
      assertEquals(db.rolledBack(), true);
    });
  });

  it("rejects a concession from an unrelated team", async () => {
    // TC-MATCH-042
    const stubs = okStubs([["SELECT team_id FROM team_members", []]]);
    await withDb(stubs, async (db) => {
      const res = await post({ matchId: "match-1", version: 1 });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "MATCH-005");
    });
  });

  it("rejects a concession on a completed match", async () => {
    // TC-MATCH-043
    const stubs = okStubs([
      ["FROM matches WHERE id = $1", [matchRow({ status: "COMPLETED" })]],
    ]);
    await withDb(stubs, async () => {
      const res = await post({ matchId: "match-1", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-002");
    });
  });

  it("records the concession in the audit log", async () => {
    // TC-MATCH-044
    await withDb(okStubs(), async (db) => {
      await post({ matchId: "match-1", version: 1 });
      const logs = db.findAll("INSERT INTO audit_logs");
      assertEquals(logs.some((q) => q.params.includes("MATCH_CONCEDED")), true);
    });
  });

  it("rejects a request without a matchId", async () => {
    await withDb(okStubs(), async () => {
      const res = await post({ version: 1 });
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "VALIDATION-001");
    });
  });
});
