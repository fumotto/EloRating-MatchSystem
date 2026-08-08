import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler,
  setDbPool,
  resetDbPool,
  setBroadcaster,
  resetBroadcaster,
} from "../../supabase/functions/matchmaker/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";

// matchmaker は Service Role で呼ばれる内部処理である（04 11.1）。
const SERVICE_ROLE_KEY = "test-service-role-key";
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);

const serviceHeaders = { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` };

const twoTeams = [
  { team_id: "team-a", rating: 1500, queued_at: "2026-08-08T10:00:00Z" },
  { team_id: "team-b", rating: 1520, queued_at: "2026-08-08T10:01:00Z" },
];

const okStubs = (queue = twoTeams, overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["FROM matching_queue q", queue],
  ["SELECT match_rating_range, report_timeout_minutes", [
    { match_rating_range: 400, report_timeout_minutes: 60 },
  ]],
  ["INSERT INTO matches", [{ id: "match-1" }]],
];

const run = (headers: HeadersInit = serviceHeaders) =>
  handler(new Request(URL_FN, { method: "POST", headers }));

const recordBroadcasts = () => {
  const sent: { channel: string; event: string; payload: unknown }[] = [];
  setBroadcaster((channel, event, payload) => {
    sent.push({ channel, event, payload });
    return Promise.resolve();
  });
  return sent;
};

describe("matchmaker", () => {
  it("creates the match in the PLAYING state", async () => {
    // TC-QUEUE-028
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.matchedCount, 1);
      assertEquals(data.data.matchIds, ["match-1"]);

      const insert = db.find("INSERT INTO matches")!;
      // MATCHED・IN_PROGRESS は存在しない（ADR-008）。
      assertStringIncludes(insert.sql, "'PLAYING'");
      assertEquals(/MATCHED|IN_PROGRESS/.test(insert.sql), false);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("sets the report deadline from system settings", async () => {
    // TC-QUEUE-030 / TC-QUEUE-031
    // ★report_deadline_at が無いと auto-resolve-matches が対象を判定できない（09 14章）。
    recordBroadcasts();
    const db = createMockDb(okStubs(twoTeams, [
      ["SELECT match_rating_range, report_timeout_minutes", [
        { match_rating_range: 400, report_timeout_minutes: 90 },
      ]],
    ]));
    setDbPool(db.pool as never);

    try {
      await run();
      const insert = db.find("INSERT INTO matches")!;
      assertStringIncludes(insert.sql, "report_deadline_at");
      assertStringIncludes(insert.sql, "minutes')::interval");
      assertEquals(insert.params[2], "90");
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("removes both teams from the queue", async () => {
    // TC-QUEUE-032
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      const del = db.find("DELETE FROM matching_queue")!;
      assertEquals(del.params, [["team-a", "team-b"]]);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("publishes MATCH_CREATED", async () => {
    // TC-QUEUE-033
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      assertEquals(sent, [{
        channel: "match",
        event: "MATCH_CREATED",
        payload: { matchId: "match-1" },
      }]);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("records match creation in the audit log", async () => {
    // TC-QUEUE-034
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'MATCH_CREATED'");
      // target_type は NOT NULL かつ CHECK 制約付きである。
      assertStringIncludes(audit.sql, "'MATCH'");
      assertEquals(audit.params[0], "match-1");
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("does not write any team status column", async () => {
    // TC-QUEUE-035 teams に状態列は存在しない（09 8.2）。
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      assertEquals(db.find("UPDATE teams"), undefined);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("serialises concurrent matchmaker runs", async () => {
    // TC-QUEUE-038 / TC-QUEUE-037
    // ★advisory lock が無いと、同期実行とCron実行が同じチームを別の試合へ割り当てうる。
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      const lock = db.find("pg_advisory_xact_lock");
      if (!lock) throw new Error("advisory lock が取得されていない");

      // ロックは待機チームの取得より前でなければ意味がない。
      assertEquals(
        db.executed.indexOf(lock) < db.executed.indexOf(db.find("FROM matching_queue q")!),
        true,
      );
      // 行ロックも併用する（09 7.1）。
      assertStringIncludes(db.find("FROM matching_queue q")!.sql, "FOR UPDATE OF q SKIP LOCKED");
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("excludes banned teams and teams that already have a match", async () => {
    // TC-QUEUE-023 / TC-QUEUE-024
    // 絞り込みはSQL側で行う。ここでは条件がクエリに含まれることを検証する。
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await run();
      const select = db.find("FROM matching_queue q")!;
      assertStringIncludes(select.sql, "t.is_banned = FALSE");
      assertStringIncludes(select.sql, "NOT IN ('COMPLETED', 'DRAWN')");
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("picks up leftover pairs on the scheduled run", async () => {
    // TC-QUEUE-042 同期実行で取りこぼした組をCron実行で回収する
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals((await res.json()).data.matchedCount, 1);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("leaves one team queued when the count is odd", async () => {
    // TC-QUEUE-026 3チームなら1組だけ成立する
    recordBroadcasts();
    const db = createMockDb(okStubs([
      ...twoTeams,
      { team_id: "team-c", rating: 1540, queued_at: "2026-08-08T10:02:00Z" },
    ]));
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals((await res.json()).data.matchedCount, 1);
      assertEquals(db.findAll("INSERT INTO matches").length, 1);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("keeps the queue intact when match creation fails", async () => {
    // TC-QUEUE-039
    recordBroadcasts();
    const db = createMockDb(okStubs(), { throwOn: "INSERT INTO matches" });
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals(res.status, 500);
      assertEquals((await res.json()).error.code, "SYSTEM-001");
      assertEquals(db.rolledBack(), true);
      assertEquals(db.committed(), false);
      assertEquals(db.find("DELETE FROM matching_queue"), undefined);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("keeps the match when the realtime notification fails", async () => {
    // Part4 5.1 送信失敗ではロールバックしない（06_ErrorCode.md 14章）。
    setBroadcaster(() => Promise.reject(new Error("realtime down")));
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await run();
      assertEquals(res.status, 200);
      assertEquals(db.committed(), true);
    } finally {
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects a call without the service role key", async () => {
    // 内部処理専用である。利用者のトークンでは実行できない。
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

  it("rejects a call with no authorization header", async () => {
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await run({});
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "AUTH-004");
    } finally {
      resetDbPool();
    }
  });
});
