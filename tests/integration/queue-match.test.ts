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
} from "../../supabase/functions/queue-match/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const leaderVerifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-1" },
  });

// 既定は「LEADER・BANなし・進行中の試合なし・未登録・必須人数を満たす・相手なし」。
const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["SELECT role FROM team_members", [{ role: "LEADER" }]],
  ["SELECT is_banned FROM teams", [{ is_banned: false }]],
  ["FROM matches", []],
  ["SELECT team_id FROM matching_queue", []],
  // 必須人数は team_max_members と等しい（09 4.1）。既定は定員ちょうど。
  ["SELECT team_max_members FROM system_settings", [{ team_max_members: 3 }]],
  ["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 3 }]],
  ["INSERT INTO matching_queue", [{ queued_at: new Date("2026-08-08T10:00:00Z") }]],
  ["FROM matching_queue q", []],
  ["SELECT match_rating_range, report_timeout_minutes", [
    { match_rating_range: 400, report_timeout_minutes: 60 },
  ]],
];

const post = (body: unknown) =>
  handler(
    new Request(URL_FN, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(body),
    }),
  );

const recordBroadcasts = () => {
  const sent: { channel: string; event: string; payload: unknown }[] = [];
  setBroadcaster((channel, event, payload) => {
    sent.push({ channel, event, payload });
    return Promise.resolve();
  });
  return sent;
};

describe("queue-match", () => {
  it("enqueues the team", async () => {
    // TC-QUEUE-001
    setJwtVerifier(leaderVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.queuedAt, "2026-08-08T10:00:00.000Z");
      if (!db.find("INSERT INTO matching_queue")) {
        throw new Error("matching_queue への INSERT が発行されていない");
      }
      assertEquals(db.committed(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("keeps the team queued when no opponent is found", async () => {
    // TC-QUEUE-002 / TC-QUEUE-003
    setJwtVerifier(leaderVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 200);

      const data = await res.json();
      // 相手が見つからないのはエラーではない（09 12章・Part4 6章）。
      assertEquals(data.result, "OK");
      assertEquals(data.data.matched, false);
      assertEquals(data.data.matchId, undefined);
      assertEquals(sent.length, 0);
      // 待機は継続する。キューから消してはならない。
      assertEquals(db.find("DELETE FROM matching_queue"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("matches synchronously on queue entry", async () => {
    // TC-QUEUE-041 / TC-QUEUE-033 相手が既に待機している場合は登録と同時に成立する
    setJwtVerifier(leaderVerifier);
    const sent = recordBroadcasts();

    // 自チームがキューから消えていること＝成立したこと。
    // 登録前の重複チェックも成立後の在籍チェックも同じ「空」を返せばよい。
    const db = createMockDb([
      ["FROM matching_queue q", [
        { team_id: "team-1", rating: 1500, queued_at: "2026-08-08T10:00:00Z" },
        { team_id: "team-2", rating: 1520, queued_at: "2026-08-08T09:59:00Z" },
      ]],
      ["INSERT INTO matches", [{ id: "match-1" }]],
      ...okStubs(),
    ]);

    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.matched, true);
      assertEquals(data.data.matchId, "match-1");
      // MATCH_CREATED はコミット後に送る。
      assertEquals(sent, [{
        channel: "match",
        event: "MATCH_CREATED",
        payload: { matchId: "match-1" },
      }]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects a duplicate queue entry", async () => {
    // TC-QUEUE-004
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(
      okStubs([["SELECT team_id FROM matching_queue", [{ team_id: "team-1" }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "QUEUE-001");
      assertEquals(db.find("INSERT INTO matching_queue"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects queueing when the team is short of the required size", async () => {
    // 必須人数は team_max_members と等しい（09 4.1）。定員3に対し2名。
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(
      okStubs([["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 2 }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "QUEUE-005");
      // 待機列へ入れてはならない。
      assertEquals(db.find("INSERT INTO matching_queue"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("allows queueing when the team is exactly at the required size", async () => {
    // 境界値。定員ちょうどは通す（09 4.1）。
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(
      okStubs([
        ["SELECT team_max_members FROM system_settings", [{ team_max_members: 5 }]],
        ["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 5 }]],
      ]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 200);
      assertEquals(db.find("INSERT INTO matching_queue") !== undefined, true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects queueing by a non-leader", async () => {
    // TC-QUEUE-005
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT role FROM team_members", [{ role: "MEMBER" }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "TEAM-005");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects queueing for a banned team", async () => {
    // TC-QUEUE-006
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT is_banned FROM teams", [{ is_banned: true }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-006");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects queueing while a match is in progress", async () => {
    // TC-QUEUE-007
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["FROM matches", [{ id: "match-1" }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "QUEUE-002");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("allows queueing after the previous match was drawn", async () => {
    // TC-QUEUE-008
    setJwtVerifier(leaderVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      assertEquals((await post({ teamId: "team-1" })).status, 200);
      // 終端状態を進行中に数えると、一度試合をしたチームが二度と待機できない。
      assertStringIncludes(db.find("FROM matches")!.sql, "NOT IN ('COMPLETED', 'DRAWN')");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects queueing for an unknown team", async () => {
    // TC-QUEUE-009
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT is_banned FROM teams", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-x" });
      assertEquals(res.status, 404);
      assertEquals((await res.json()).error.code, "TEAM-001");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects an unauthenticated call", async () => {
    setJwtVerifier(() => Promise.resolve(null));
    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });
});
