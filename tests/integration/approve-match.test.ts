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
} from "../../supabase/functions/approve-match/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const loserMemberVerifier = () =>
  Promise.resolve({
    sub: "profile-2",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-2" },
  });

const reportedMatch = {
  team_a_id: "team-a",
  team_b_id: "team-b",
  winner_team_id: "team-a",
  status: "WINNER_REPORTED",
};

// 両チーム1500・K=32 → 勝者1516 / 敗者1484（Part2 2章の固定値）。
const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["FROM matches WHERE id = $1", [reportedMatch]],
  ["FROM team_members WHERE profile_id = $1 AND team_id = $2", [{ id: "member-2" }]],
  ["SELECT rating_k FROM system_settings", [{ rating_k: 32 }]],
  ["SELECT id, rating FROM teams", [
    { id: "team-a", rating: 1500 },
    { id: "team-b", rating: 1500 },
  ]],
  ["UPDATE matches", [{ completed_at: new Date("2026-08-08T10:20:00Z") }]],
];

const post = (body: unknown) =>
  handler(
    new Request(URL_FN, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(body),
    }),
  );

const validBody = { matchId: "match-1", version: 2 };

const recordBroadcasts = () => {
  const sent: { channel: string; event: string }[] = [];
  setBroadcaster((channel, event) => {
    sent.push({ channel, event });
    return Promise.resolve();
  });
  return sent;
};

describe("approve-match", () => {
  it("approves the match result", async () => {
    // TC-MATCH-020 / TC-MATCH-022
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.completedAt, "2026-08-08T10:20:00.000Z");
      assertEquals(data.data.winnerTeamId, "team-a");

      const update = db.find("UPDATE matches")!;
      assertStringIncludes(update.sql, "status = 'COMPLETED'");
      assertStringIncludes(update.sql, "completed_at = NOW()");
      assertStringIncludes(update.sql, "approved_at = NOW()");
      assertStringIncludes(update.sql, "approved_by_profile_id = $1");
      assertEquals(db.committed(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("lets any member of the losing team approve", async () => {
    // TC-MATCH-021 LEADER限定ではない（ADR-009）。
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      assertEquals((await post(validBody)).status, 200);
      const check = db.find("FROM team_members WHERE profile_id = $1 AND team_id = $2")!;
      assertEquals(/LEADER/.test(check.sql), false);
      // 照合先は敗者チームである。勝者が承認できてはならない。
      assertEquals(check.params, ["profile-2", "team-b"]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("marks a manual approval as not auto-approved", async () => {
    // TC-MATCH-023
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      const update = db.find("UPDATE matches")!;
      assertEquals(update.params[0], "profile-2");
      assertEquals(update.params[1], false);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("updates both team ratings", async () => {
    // TC-MATCH-024 期待値は Part2 2章の固定値（1500 vs 1500・K=32 → +16 / -16）。
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      const data = await res.json();

      assertEquals(data.data.ratings, [
        { teamId: "team-a", beforeRating: 1500, afterRating: 1516, ratingChange: 16 },
        { teamId: "team-b", beforeRating: 1500, afterRating: 1484, ratingChange: -16 },
      ]);

      const updates = db.findAll("UPDATE teams SET rating");
      assertEquals(updates.length, 2);
      assertEquals(updates[0].params, [1516, "team-a"]);
      assertEquals(updates[1].params, [1484, "team-b"]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("creates two rating history rows", async () => {
    // TC-MATCH-025 / TC-RATING-021・026
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      const history = db.findAll("INSERT INTO rating_history");
      assertEquals(history.length, 2);

      // [match_id, team_id, before, after, change, k_value, result, completed_at]
      assertEquals(history[0].params.slice(1, 7), ["team-a", 1500, 1516, 16, 32, "WIN"]);
      assertEquals(history[1].params.slice(1, 7), ["team-b", 1500, 1484, -16, 32, "LOSE"]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("reads the K factor from system settings", async () => {
    // TC-RATING-026 / TC-RATING-028 K=64 なら +32 / -32 になる
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs([["SELECT rating_k FROM system_settings", [{ rating_k: 64 }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      const data = await res.json();
      assertEquals(data.data.ratings[0].afterRating, 1532);

      // 適用したK値を履歴へ保存する（08 7.2）。
      assertEquals(db.findAll("INSERT INTO rating_history")[0].params[5], 64);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects an approval from the winning team", async () => {
    // TC-MATCH-026
    setJwtVerifier(loserMemberVerifier);
    const db = createMockDb(
      okStubs([["FROM team_members WHERE profile_id = $1 AND team_id = $2", []]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "MATCH-005");
      assertEquals(db.find("UPDATE teams"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects an approval before the winner is reported", async () => {
    // TC-MATCH-028
    setJwtVerifier(loserMemberVerifier);
    const db = createMockDb(okStubs([["FROM matches WHERE id = $1", [{
      ...reportedMatch,
      status: "PLAYING",
      winner_team_id: null,
    }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-004");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a second approval without touching ratings", async () => {
    // TC-MATCH-029
    setJwtVerifier(loserMemberVerifier);
    const db = createMockDb(
      okStubs([["FROM matches WHERE id = $1", [{ ...reportedMatch, status: "COMPLETED" }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-002");
      // 二重承認でレートが二度動いてはならない。
      assertEquals(db.find("UPDATE teams"), undefined);
      assertEquals(db.find("INSERT INTO rating_history"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a stale version", async () => {
    // TC-MATCH-030 / TC-MATCH-031
    setJwtVerifier(loserMemberVerifier);
    const db = createMockDb(okStubs([["UPDATE matches", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ matchId: "match-1", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-008");

      // 楽観ロックが外れると同時承認の双方が成功し、レートが二重に動く。
      const update = db.find("UPDATE matches")!;
      assertStringIncludes(
        update.sql,
        "WHERE id = $3 AND version = $4 AND status = ANY($6)",
      );
      assertEquals(db.rolledBack(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("publishes MATCH_COMPLETED and RANKING_UPDATED", async () => {
    // TC-MATCH-032
    setJwtVerifier(loserMemberVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      assertEquals(sent, [
        { channel: "match", event: "MATCH_COMPLETED" },
        { channel: "ranking", event: "RANKING_UPDATED" },
      ]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("records the approval in the audit log", async () => {
    // TC-MATCH-033
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      const audit = db.find("INSERT INTO audit_logs")!;
      assertEquals(audit.params[1], "MATCH_APPROVED");
      assertEquals(audit.params[0], "profile-2");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rolls back every write when one step fails", async () => {
    // TC-RATING-034
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs(), { throwOn: "UPDATE teams SET rating" });
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 500);
      assertEquals(db.rolledBack(), true);
      assertEquals(db.committed(), false);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("locks both team rows before reading their ratings", async () => {
    // 行ロックが無いと、同時に確定した別の試合と読み書きが交錯して after_rating を失う。
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      const select = db.find("SELECT id, rating FROM teams")!;
      assertStringIncludes(select.sql, "ORDER BY id FOR UPDATE");
      assertEquals(
        db.executed.indexOf(select) < db.executed.indexOf(db.find("UPDATE teams SET rating")!),
        true,
      );
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects an unauthenticated call", async () => {
    setJwtVerifier(() => Promise.resolve(null));
    try {
      const res = await post(validBody);
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });
});
