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
} from "../../supabase/functions/report-match/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const memberVerifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-1" },
  });

const playingMatch = {
  team_a_id: "team-a",
  team_b_id: "team-b",
  status: "PLAYING",
  version: 1,
};

const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["FROM matches WHERE id = $1", [playingMatch]],
  ["FROM team_members WHERE profile_id = $1 AND team_id = $2", [{ id: "member-1" }]],
  ["UPDATE matches", [{
    approve_deadline_at: new Date("2026-08-08T10:10:00Z"),
    version: 2,
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

const validBody = { matchId: "match-1", winnerTeamId: "team-a", version: 1 };

const recordBroadcasts = () => {
  const sent: { channel: string; event: string }[] = [];
  setBroadcaster((channel, event) => {
    sent.push({ channel, event });
    return Promise.resolve();
  });
  return sent;
};

describe("report-match", () => {
  it("reports the winner", async () => {
    // TC-MATCH-006 / TC-MATCH-008 / TC-MATCH-009
    setJwtVerifier(memberVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.status, "WINNER_REPORTED");
      assertEquals(data.data.approveDeadlineAt, "2026-08-08T10:10:00.000Z");
      assertEquals(data.data.version, 2);

      const update = db.find("UPDATE matches")!;
      assertStringIncludes(update.sql, "reported_by_profile_id = $2");
      assertStringIncludes(update.sql, "reported_at = NOW()");
      // 承認期限は設定値から算出する。
      assertStringIncludes(update.sql, "approve_timeout_minutes");

      assertEquals(sent, [{ channel: "match", event: "WINNER_REPORTED" }]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("lets any member of the winning team report", async () => {
    // TC-MATCH-007 LEADER限定ではない（ADR-009）。
    setJwtVerifier(memberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      assertEquals((await post(validBody)).status, 200);
      // 役割で絞っていないこと。role = 'LEADER' を条件に入れると MEMBER が申告できない。
      const check = db.find("FROM team_members WHERE profile_id = $1 AND team_id = $2")!;
      assertEquals(/LEADER/.test(check.sql), false);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("does not update ratings on report", async () => {
    // TC-MATCH-018 申告ではレートを更新しない（08 3章）。
    setJwtVerifier(memberVerifier);
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

  it("records the report in the audit log", async () => {
    setJwtVerifier(memberVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post(validBody);
      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'MATCH_REPORTED'");
      assertStringIncludes(audit.sql, "'MATCH'");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects a report from the losing team", async () => {
    // TC-MATCH-010 敗者側は winnerTeamId のメンバーではない
    setJwtVerifier(memberVerifier);
    const db = createMockDb(
      okStubs([["FROM team_members WHERE profile_id = $1 AND team_id = $2", []]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "MATCH-005");
      assertEquals(db.find("UPDATE matches"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a report from an unrelated team", async () => {
    // TC-MATCH-011
    setJwtVerifier(memberVerifier);
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

  it("rejects a winner that is not part of the match", async () => {
    // TC-MATCH-012
    setJwtVerifier(memberVerifier);
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ ...validBody, winnerTeamId: "team-x" });
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "MATCH-006");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a second report", async () => {
    // TC-MATCH-013 / TC-MATCH-017
    setJwtVerifier(memberVerifier);
    const db = createMockDb(
      okStubs([["FROM matches WHERE id = $1", [{ ...playingMatch, status: "WINNER_REPORTED" }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-003");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a report on a completed match", async () => {
    // TC-MATCH-014
    setJwtVerifier(memberVerifier);
    const db = createMockDb(
      okStubs([["FROM matches WHERE id = $1", [{ ...playingMatch, status: "COMPLETED" }]]]),
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

  it("rejects a report on a drawn match", async () => {
    // TC-MATCH-015
    setJwtVerifier(memberVerifier);
    const db = createMockDb(
      okStubs([["FROM matches WHERE id = $1", [{ ...playingMatch, status: "DRAWN" }]]]),
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

  it("returns not found for an unknown match", async () => {
    // TC-MATCH-016
    setJwtVerifier(memberVerifier);
    const db = createMockDb(okStubs([["FROM matches WHERE id = $1", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 404);
      assertEquals((await res.json()).error.code, "MATCH-001");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("accepts only the first report within the same team", async () => {
    // TC-MATCH-017 楽観ロック。更新できた行数が0なら競合である。
    setJwtVerifier(memberVerifier);
    const db = createMockDb(okStubs([["UPDATE matches", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post(validBody);
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "MATCH-008");

      // ★WHERE に version と状態を含めないと、2人目の申告も成功してしまう。
      const update = db.find("UPDATE matches")!;
      assertStringIncludes(update.sql, "WHERE id = $3 AND version = $4 AND status = 'PLAYING'");
      assertStringIncludes(update.sql, "version = version + 1");
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

  it("rejects a request without a version", async () => {
    // 更新系は必ず version を送る（Part5 2章）。
    setJwtVerifier(memberVerifier);
    try {
      const res = await post({ matchId: "match-1", winnerTeamId: "team-a" });
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });
});
