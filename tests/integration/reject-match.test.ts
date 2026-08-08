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
} from "../../supabase/functions/reject-match/index.ts";
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
  reject_count: 0,
};

// 既定は max_reject_count=2 のため、初回の拒否は PLAYING へ戻る。
const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["FROM matches WHERE id = $1", [reportedMatch]],
  ["FROM team_members WHERE profile_id = $1 AND team_id = $2", [{ id: "member-2" }]],
  ["SELECT max_reject_count, report_timeout_minutes", [
    { max_reject_count: 2, report_timeout_minutes: 60 },
  ]],
  ["UPDATE matches", [{
    report_deadline_at: new Date("2026-08-08T11:00:00Z"),
    reject_count: 1,
  }]],
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

describe("reject-match", () => {
  it("returns the match to PLAYING on rejection", async () => {
    // TC-MATCH-034 / TC-MATCH-038
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.status, "PLAYING");
      assertEquals(data.data.rejectCount, 1);
      assertEquals(db.committed(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("clears the report fields on rejection", async () => {
    // TC-MATCH-035 chk_matches_playing により、残したままだと制約違反になる。
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      const update = db.find("UPDATE matches")!;
      assertStringIncludes(update.sql, "winner_team_id = NULL");
      assertStringIncludes(update.sql, "reported_by_profile_id = NULL");
      assertStringIncludes(update.sql, "reported_at = NULL");
      assertStringIncludes(update.sql, "approve_deadline_at = NULL");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("extends the report deadline on rejection", async () => {
    // TC-MATCH-036 / TC-MATCH-037
    // ★再設定しないと、当初の申告期限を過ぎている試合が PLAYING へ戻った直後に
    //   自動解決バッチでドロー解散させられる（04 10.5）。
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals((await res.json()).data.reportDeadlineAt, "2026-08-08T11:00:00.000Z");

      const update = db.find("UPDATE matches")!;
      assertStringIncludes(update.sql, "report_deadline_at = NOW() + ($2 || ' minutes')::interval");
      // 期限は設定値から取る。
      assertEquals(update.params[1], "60");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("does not update ratings on rejection", async () => {
    // TC-RATING-031
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      assertEquals(db.find("UPDATE teams"), undefined);
      assertEquals(db.find("INSERT INTO rating_history"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("draws the match when the reject limit is reached", async () => {
    // TC-MATCH-040 / TC-MATCH-041
    // 上限に「達した」場合に解散する。max=2 の2回目（reject_count 1 → 2）で DRAWN。
    setJwtVerifier(loserMemberVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs([
      ["FROM matches WHERE id = $1", [{ ...reportedMatch, reject_count: 1 }]],
      ["UPDATE matches", [{ reject_count: 2 }]],
    ]));
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 200);

      const data = await res.json();
      // 解散は業務エラーではない（04 10.5）。
      assertEquals(data.result, "OK");
      assertEquals(data.data.status, "DRAWN");
      assertEquals(data.data.rejectCount, 2);
      assertEquals(data.data.reportDeadlineAt, undefined);

      const update = db.find("UPDATE matches")!;
      assertStringIncludes(update.sql, "status = 'DRAWN'");
      // DRAWN で勝者が残っていると chk_matches_drawn に違反する。
      assertStringIncludes(update.sql, "winner_team_id = NULL");
      assertStringIncludes(update.sql, "completed_at = NOW()");

      // レートは動かさない（08 3章）。
      assertEquals(db.find("UPDATE teams"), undefined);
      assertEquals(db.find("INSERT INTO rating_history"), undefined);

      assertEquals(sent, [{ channel: "match", event: "MATCH_DRAWN" }]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("publishes the rejection event", async () => {
    // TC-MATCH-045
    setJwtVerifier(loserMemberVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      assertEquals(sent, [{ channel: "match", event: "MATCH_REJECTED" }]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("records the rejection in the audit log", async () => {
    // TC-MATCH-046
    setJwtVerifier(loserMemberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'MATCH_REJECTED'");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects a rejection from the winning team", async () => {
    // TC-MATCH-042
    setJwtVerifier(loserMemberVerifier);
    const db = createMockDb(
      okStubs([["FROM team_members WHERE profile_id = $1 AND team_id = $2", []]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "MATCH-005");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a rejection before the winner is reported", async () => {
    // TC-MATCH-043
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

  it("rejects a rejection on a drawn match", async () => {
    // TC-MATCH-044
    setJwtVerifier(loserMemberVerifier);
    const db = createMockDb(
      okStubs([["FROM matches WHERE id = $1", [{ ...reportedMatch, status: "DRAWN" }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-002");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a stale version", async () => {
    setJwtVerifier(loserMemberVerifier);
    const db = createMockDb(okStubs([["UPDATE matches", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ matchId: "match-1", version: 1 });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-008");
    } finally {
      resetJwtVerifier();
      resetDbPool();
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
