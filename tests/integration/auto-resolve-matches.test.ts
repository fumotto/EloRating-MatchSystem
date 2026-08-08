import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler,
  setDbPool,
  resetDbPool,
  setBroadcaster,
  resetBroadcaster,
} from "../../supabase/functions/auto-resolve-matches/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const SERVICE_ROLE_KEY = "test-service-role-key";
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
const serviceHeaders = { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` };

const drawnTarget = {
  id: "match-drawn",
  team_a_id: "team-a",
  team_b_id: "team-b",
  winner_team_id: null,
  version: 1,
};

const approveTarget = {
  id: "match-approve",
  team_a_id: "team-a",
  team_b_id: "team-b",
  winner_team_id: "team-a",
  version: 2,
};

// 既定は「報告期限切れ1件・承認期限切れ1件」。
const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["WHERE status = 'PLAYING' AND report_deadline_at < NOW()", [drawnTarget]],
  ["WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW()", [approveTarget]],
  ["UPDATE matches", [{ id: "match-drawn", completed_at: new Date("2026-08-08T11:00:00Z") }]],
  ["SELECT rating_k FROM system_settings", [{ rating_k: 32 }]],
  ["SELECT id, rating FROM teams", [
    { id: "team-a", rating: 1500 },
    { id: "team-b", rating: 1500 },
  ]],
];

const run = (headers: HeadersInit = serviceHeaders) =>
  handler(new Request(URL_FN, { method: "POST", headers }));

const recordBroadcasts = () => {
  const sent: { channel: string; event: string }[] = [];
  setBroadcaster((channel, event) => {
    sent.push({ channel, event });
    return Promise.resolve();
  });
  return sent;
};

describe("auto-resolve-matches", () => {
  it("draws a match when the report deadline passes", async () => {
    // TC-MATCH-047 / TC-MATCH-048 / TC-MATCH-049
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.drawnCount, 1);

      const update = db.findAll("UPDATE matches").find((q) => q.sql.includes("'DRAWN'"))!;
      assertStringIncludes(update.sql, "winner_team_id = NULL");
      assertStringIncludes(update.sql, "completed_at = NOW()");
      // 期限を WHERE にも残す。抽出から更新までの間に拒否で期限が延びた試合を巻き込まない。
      assertStringIncludes(update.sql, "report_deadline_at < NOW()");
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("does not change ratings on a drawn match", async () => {
    // TC-MATCH-050 / TC-MATCH-051 / TC-RATING-030
    recordBroadcasts();
    const db = createMockDb(
      okStubs([["WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW()", []]]),
    );
    setDbPool(db.pool as never);

    try {
      await run();
      assertEquals(db.find("UPDATE teams"), undefined);
      assertEquals(db.find("INSERT INTO rating_history"), undefined);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("leaves matches within the deadline untouched", async () => {
    // TC-MATCH-052 抽出条件に合致しなければ何もしない
    recordBroadcasts();
    const db = createMockDb(okStubs([
      ["WHERE status = 'PLAYING' AND report_deadline_at < NOW()", []],
      ["WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW()", []],
    ]));
    setDbPool(db.pool as never);

    try {
      const res = await run();
      const data = await res.json();
      assertEquals(data.data.drawnCount, 0);
      assertEquals(data.data.autoApprovedCount, 0);
      assertEquals(db.find("UPDATE matches"), undefined);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("auto-approves when the approval deadline passes", async () => {
    // TC-MATCH-053 / TC-MATCH-054 / TC-MATCH-055
    recordBroadcasts();
    const db = createMockDb(
      okStubs([["WHERE status = 'PLAYING' AND report_deadline_at < NOW()", []]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals((await res.json()).data.autoApprovedCount, 1);

      const update = db.findAll("UPDATE matches").find((q) => q.sql.includes("'COMPLETED'"))!;
      // 自動承認では承認者を NULL のまま、auto_approved を TRUE にする。
      assertEquals(update.params[0], null);
      assertEquals(update.params[1], true);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("updates ratings on auto-approval", async () => {
    // TC-MATCH-056 / TC-MATCH-057 / TC-RATING-029
    recordBroadcasts();
    const db = createMockDb(
      okStubs([["WHERE status = 'PLAYING' AND report_deadline_at < NOW()", []]]),
    );
    setDbPool(db.pool as never);

    try {
      await run();
      const history = db.findAll("INSERT INTO rating_history");
      assertEquals(history.length, 2);
      // 手動承認と同じ計算式・同じ共通処理を通る（08 10.1）。
      assertEquals(history[0].params.slice(1, 7), ["team-a", 1500, 1516, 16, 32, "WIN"]);
      assertEquals(history[1].params.slice(1, 7), ["team-b", 1500, 1484, -16, 32, "LOSE"]);
      assertEquals(db.findAll("UPDATE teams SET rating").length, 2);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("records the auto resolution in the audit log", async () => {
    // TC-MATCH-060
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      const actions = db.findAll("INSERT INTO audit_logs");
      assertEquals(actions.some((q) => q.sql.includes("'MATCH_DRAWN'")), true);
      // 自動承認は MATCH_APPROVED ではなく MATCH_AUTO_APPROVED である（03 10.9）。
      assertEquals(actions.some((q) => q.params.includes("MATCH_AUTO_APPROVED")), true);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("publishes the auto resolution event", async () => {
    // TC-MATCH-061
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      assertEquals(sent, [
        { channel: "match", event: "MATCH_DRAWN" },
        { channel: "match", event: "MATCH_COMPLETED" },
        { channel: "ranking", event: "RANKING_UPDATED" },
      ]);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("keeps processing other matches when one fails", async () => {
    // TC-MATCH-058 各試合を個別のトランザクションで処理する（04 11.2）。
    recordBroadcasts();
    // ドロー側の UPDATE を失敗させても、自動承認側は完了する。
    const db = createMockDb(okStubs(), { throwOn: "status = 'DRAWN'" });
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.drawnCount, 0);
      assertEquals(data.data.autoApprovedCount, 1);
      // 失敗した試合だけがロールバックされ、成功した試合はコミットされている。
      assertEquals(db.rolledBack(), true);
      assertEquals(db.committed(), true);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("serialises concurrent auto-resolve runs", async () => {
    // TC-MATCH-059
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      const locks = db.findAll("pg_advisory_xact_lock");
      // 試合ごとにロックを取る。多重起動しても同じ試合を二重処理しない。
      assertEquals(locks.length, 2);
      assertStringIncludes(locks[0].sql, "hashtext('auto-resolve')");
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects a call without the service role key", async () => {
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await run({ "Authorization": "Bearer user-token" });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "AUTH-004");
      assertEquals(db.executed.length, 0);
    } finally {
      resetDbPool();
    }
  });
});
