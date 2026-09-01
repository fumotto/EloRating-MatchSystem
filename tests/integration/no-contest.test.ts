// 反対申告と不成立の申請（ADR-032 ⑧⑩ / ADR-034 ②③）。
//
// ★本ファイルの中心は「反対申告があるうちは自動承認しない」ことの検証である。
//   条件に `counter_claim_team_id IS NULL` を含めない実装では、矛盾する2つの主張が
//   あるにもかかわらず先に申告した側で確定し、**早く嘘をついた側が勝つ。**
import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import * as report from "../../supabase/functions/report-match/index.ts";
import * as request from "../../supabase/functions/request-no-contest/index.ts";
import * as respond from "../../supabase/functions/respond-no-contest/index.ts";
import * as auto from "../../supabase/functions/auto-resolve-matches/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};
const SERVICE_ROLE_KEY = "test-service-role-key";
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);

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

const base = (over: QueryStub[] = []): QueryStub[] => [
  ...over,
  ["SELECT updates_locked", [{ updates_locked: false }]],
  ["FROM matches WHERE id = $1", [matchRow()]],
  ["SELECT team_id FROM team_members", [{ team_id: "team-a" }]],
  ["FROM team_members WHERE profile_id = $1 AND team_id = $2", [{ id: "member-1" }]],
  ["FROM system_settings LIMIT 1", [{
    max_no_contest_requests: 2,
    mutual_no_contest_daily_limit: 3,
    avoidance_days: 30,
    max_avoidance_entries: 5,
    queue_cooldown_minutes: 30,
  }]],
  ["SELECT COUNT(*)::int AS count FROM matches", [{ count: 1 }]],
  ["UPDATE matches", [{ version: 2, no_contest_request_count: 1 }]],
];

const call = (
  mod: { handler: (r: Request) => Promise<Response> },
  body: unknown,
) =>
  mod.handler(
    new Request(URL_FN, { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify(body) }),
  );

// deno-lint-ignore no-explicit-any
const withDb = async (mod: any, stubs: QueryStub[], fn: (db: ReturnType<typeof createMockDb>) => Promise<void>) => {
  const db = createMockDb(stubs);
  mod.setDbPool(db.pool as never);
  if (mod.setJwtVerifier) mod.setJwtVerifier(verifier);
  mod.setBroadcaster(() => Promise.resolve());
  try {
    await fn(db);
  } finally {
    mod.resetDbPool();
    if (mod.resetJwtVerifier) mod.resetJwtVerifier();
    mod.resetBroadcaster();
  }
};

describe("counter claim", () => {
  it("records a counter claim from the opponent", async () => {
    // TC-MATCH-034-01
    const stubs = base([
      ["FROM matches WHERE id = $1", [
        matchRow({ status: "WINNER_REPORTED", winner_team_id: "team-a" }),
      ]],
    ]);
    await withDb(report, stubs, async (db) => {
      const res = await call(report, { matchId: "match-1", winnerTeamId: "team-b", version: 1 });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.counterClaim, true);

      const update = db.findAll("UPDATE matches").find((q) =>
        q.sql.includes("counter_claim_team_id = $1")
      )!;
      assertStringIncludes(update.sql, "counter_claimed_at = NOW()");
    });
  });

  it("does not extend the approval deadline on a counter claim", async () => {
    // TC-MATCH-034-02 ★延長できると、反対申告が期限を引き延ばす道具になる
    const stubs = base([
      ["FROM matches WHERE id = $1", [
        matchRow({ status: "WINNER_REPORTED", winner_team_id: "team-a" }),
      ]],
    ]);
    await withDb(report, stubs, async (db) => {
      await call(report, { matchId: "match-1", winnerTeamId: "team-b", version: 1 });
      const update = db.findAll("UPDATE matches").find((q) =>
        q.sql.includes("counter_claim_team_id = $1")
      )!;
      assertEquals(update.sql.includes("approve_deadline_at"), false);
    });
  });

  it("rejects a duplicate report from the reporting team", async () => {
    // TC-MATCH-034-09
    const stubs = base([
      ["FROM matches WHERE id = $1", [
        matchRow({ status: "WINNER_REPORTED", winner_team_id: "team-a" }),
      ]],
    ]);
    await withDb(report, stubs, async () => {
      const res = await call(report, { matchId: "match-1", winnerTeamId: "team-a", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-003");
    });
  });

  it("rejects a second counter claim", async () => {
    // TC-MATCH-034-10
    const stubs = base([
      ["FROM matches WHERE id = $1", [
        matchRow({
          status: "WINNER_REPORTED",
          winner_team_id: "team-a",
          counter_claim_team_id: "team-b",
        }),
      ]],
    ]);
    await withDb(report, stubs, async () => {
      const res = await call(report, { matchId: "match-1", winnerTeamId: "team-b", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-003");
    });
  });
});

describe("auto-resolve suppresses contested matches", () => {
  it("selects auto-approval targets only when no counter claim stands", async () => {
    // TC-MATCH-034-03 ★最重要。抽出条件そのものを検証する
    const db = createMockDb([
      ["counter_claim_team_id IS NOT NULL", []],
      ["WHERE status = 'PLAYING'", []],
      ["WHERE status = 'WINNER_REPORTED'", []],
    ]);
    auto.setDbPool(db.pool as never);
    auto.setBroadcaster(() => Promise.resolve());
    try {
      await auto.handler(
        new Request(URL_FN, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
        }),
      );
      const approveQuery = db.findAll("approve_deadline_at < NOW()")
        .find((q) => q.sql.includes("counter_claim_team_id IS NULL"))!;
      assertStringIncludes(approveQuery.sql, "counter_claim_team_id IS NULL");

      const conflictQuery = db.findAll("approve_deadline_at < NOW()")
        .find((q) => q.sql.includes("counter_claim_team_id IS NOT NULL"))!;
      assertStringIncludes(conflictQuery.sql, "counter_claim_team_id IS NOT NULL");
    } finally {
      auto.resetDbPool();
      auto.resetBroadcaster();
    }
  });

  it("requires both timers to mature before a no-show settles", async () => {
    // TC-MATCH-034-47 / -48 ★2つの条件は AND である。
    //   どちらか一方では、対戦直後の申請が相手の短い離席で成立してしまう
    const db = createMockDb([["WHERE", []]]);
    auto.setDbPool(db.pool as never);
    auto.setBroadcaster(() => Promise.resolve());
    try {
      await auto.handler(
        new Request(URL_FN, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
        }),
      );
      const noShow = db.findAll("no_contest_requested_at IS NOT NULL")[0];
      assertStringIncludes(noShow.sql, "no_show_minutes");
      assertStringIncludes(noShow.sql, "no_show_response_minutes");
      // 片方だけでは成立しない。両方が AND で結ばれていること。
      assertEquals(noShow.sql.includes("OR"), false);
    } finally {
      auto.resetDbPool();
      auto.resetBroadcaster();
    }
  });
});

describe("request-no-contest", () => {
  it("accepts a no-contest request right after matchmaking", async () => {
    // TC-MATCH-034-40 ★申請に時間の制限は無い
    await withDb(request, base(), async (db) => {
      const res = await call(request, {
        matchId: "match-1",
        reasonCode: "CONNECTION",
        version: 1,
      });
      assertEquals(res.status, 200);
      const update = db.findAll("UPDATE matches")[0];
      assertEquals(update.sql.includes("no_show_minutes"), false);
    });
  });

  it("rejects a no-contest request after a winner is reported", async () => {
    // TC-MATCH-034-53 ★WINNER_REPORTED から認めると取り消しの交渉になる
    const stubs = base([
      ["FROM matches WHERE id = $1", [
        matchRow({ status: "WINNER_REPORTED", winner_team_id: "team-a" }),
      ]],
    ]);
    await withDb(request, stubs, async () => {
      const res = await call(request, {
        matchId: "match-1",
        reasonCode: "CONNECTION",
        version: 1,
      });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-003");
    });
  });

  it("rejects a request while one is pending", async () => {
    // TC-MATCH-034-52
    const stubs = base([
      ["FROM matches WHERE id = $1", [
        matchRow({ no_contest_requested_by_team_id: "team-b" }),
      ]],
    ]);
    await withDb(request, stubs, async () => {
      const res = await call(request, { matchId: "match-1", reasonCode: "OTHER", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-011");
    });
  });

  it("rejects a request beyond the limit", async () => {
    // TC-MATCH-034-51
    const stubs = base([
      ["FROM matches WHERE id = $1", [matchRow({ no_contest_request_count: 2 })]],
    ]);
    await withDb(request, stubs, async () => {
      const res = await call(request, { matchId: "match-1", reasonCode: "OTHER", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-012");
    });
  });

  it("rejects an unknown reason code", async () => {
    await withDb(request, base(), async () => {
      const res = await call(request, { matchId: "match-1", reasonCode: "NOPE", version: 1 });
      assertEquals(res.status, 400);
    });
  });
});

describe("respond-no-contest", () => {
  // ★スタブは前方から部分一致で採用されるため、より具体的なものを先に置く。
  //   `FROM matches WHERE id = $1` は理由区分の取得SQLにも含まれてしまう。
  const pending = (over: Record<string, unknown> = {}) =>
    base([
      ["SELECT no_contest_reason_code FROM matches", [{ no_contest_reason_code: "CONNECTION" }]],
      ["FROM matches WHERE id = $1", [
        matchRow({ no_contest_requested_by_team_id: "team-b", ...over }),
      ]],
      ["UPDATE matches", [{ version: 2 }]],
    ]);

  it("settles a mutual no-contest immediately", async () => {
    // TC-MATCH-034-41
    await withDb(respond, pending(), async (db) => {
      const res = await call(respond, { matchId: "match-1", response: "ACCEPT", version: 1 });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.data.status, "DRAWN");
      assertEquals(body.data.noContestReason, "MUTUAL");
      const update = db.findAll("UPDATE matches").find((q) => q.sql.includes("'MUTUAL'"))!;
      assertStringIncludes(update.sql, "winner_team_id = NULL");
    });
  });

  it("registers avoidance for a connection no-contest", async () => {
    // TC-MATCH-034-55 ★承諾ブランチのみ。team_low < team_high で正規化する
    await withDb(respond, pending(), async (db) => {
      await call(respond, { matchId: "match-1", response: "ACCEPT", version: 1 });
      const insert = db.find("INSERT INTO match_avoidance")!;
      assertEquals(insert.params[0], "team-a");
      assertEquals(insert.params[1], "team-b");
    });
  });

  it("does not register avoidance for other reasons", async () => {
    const stubs = pending();
    stubs.unshift(["SELECT no_contest_reason_code FROM matches", [{
      no_contest_reason_code: "OTHER",
    }]]);
    await withDb(respond, stubs, async (db) => {
      await call(respond, { matchId: "match-1", response: "ACCEPT", version: 1 });
      assertEquals(db.find("INSERT INTO match_avoidance"), undefined);
    });
  });

  it("clears the request when the opponent continues", async () => {
    // TC-MATCH-034-44 / -45 ★報告期限を変えない
    await withDb(respond, pending(), async (db) => {
      const res = await call(respond, { matchId: "match-1", response: "CONTINUE", version: 1 });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.status, "PLAYING");
      const update = db.findAll("UPDATE matches")[0];
      assertEquals(update.sql.includes("report_deadline_at"), false);
    });
  });

  it("rejects a response from the requesting team", async () => {
    // TC-MATCH-034-54 ★自分ひとりでは不成立にできない
    await withDb(respond, pending({ no_contest_requested_by_team_id: "team-a" }), async () => {
      const res = await call(respond, { matchId: "match-1", response: "ACCEPT", version: 1 });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "MATCH-005");
    });
  });

  it("rejects a response when nothing is pending", async () => {
    await withDb(respond, base(), async () => {
      const res = await call(respond, { matchId: "match-1", response: "ACCEPT", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-011");
    });
  });
});
