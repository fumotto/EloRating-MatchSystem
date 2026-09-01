// 管理者による対戦カードの作成（ADR-035 ⑤ / ADR-039）。
//
// ★本Functionは待機列を経由しない試合の生成経路である。ADR-035 ④ が要求するとおり、
//   判定を自前で持つ。ここで固定するのは「何に拘束されないか」と「何には従うか」の境界である。
import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler as createMatch,
  setDbPool,
  resetDbPool,
  setJwtVerifier,
  resetJwtVerifier,
  setBroadcaster,
  resetBroadcaster,
} from "../../supabase/functions/admin-create-match/index.ts";
import type { JwtVerifier } from "../../supabase/functions/_shared/auth.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const adminVerifier: JwtVerifier = () =>
  Promise.resolve({
    sub: "admin-1",
    app_metadata: { provider: "discord", role: "admin" },
    user_metadata: { provider_id: "discord-admin" },
  });

const userVerifier: JwtVerifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord" },
    user_metadata: { provider_id: "discord-user-1" },
  });

const post = (body: unknown = { teamAId: "team-a", teamBId: "team-b" }) =>
  new Request(URL_FN, { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify(body) });

const settings = (overrides: Record<string, unknown> = {}) => ({
  report_timeout_minutes: 60,
  matchmaking_paused: false,
  maintenance_paused: false,
  updates_locked: false,
  ...overrides,
});

const teams = (overrides: Record<string, unknown>[] = [{}, {}]) => [
  { id: "team-a", is_banned: false, member_count: 3, ...overrides[0] },
  { id: "team-b", is_banned: false, member_count: 3, ...overrides[1] },
];

const okStubs = (
  settingsRow = settings(),
  teamRows = teams(),
  overrides: QueryStub[] = [],
): QueryStub[] => [
  ...overrides,
  ["SELECT report_timeout_minutes", [settingsRow]],
  ["FROM teams t", teamRows],
  ["INSERT INTO matches", [{ id: "match-1", report_deadline_at: "2026-08-28T10:00:00Z" }]],
];

const run = (stubs: QueryStub[], verifier: JwtVerifier = adminVerifier, body?: unknown) => {
  setJwtVerifier(verifier);
  setBroadcaster(() => Promise.resolve());
  const db = createMockDb(stubs);
  setDbPool(db.pool as never);
  return { db, res: createMatch(post(body)) };
};

const cleanup = () => {
  resetDbPool();
  resetJwtVerifier();
  resetBroadcaster();
};

describe("admin-create-match", () => {
  it("creates a PLAYING match for the two named teams", async () => {
    // TC-MATCH-090
    const { db, res } = run(okStubs());
    try {
      const response = await res;
      assertEquals(response.status, 200);

      const data = (await response.json()).data;
      assertEquals(data.matchId, "match-1");
      assertEquals(data.teamAId, "team-a");
      assertEquals(data.teamBId, "team-b");

      const insert = db.find("INSERT INTO matches")!;
      // MATCHED・IN_PROGRESS は存在しない（ADR-008）。
      assertStringIncludes(insert.sql, "'PLAYING'");
      assertEquals(insert.params[0], "team-a");
      assertEquals(insert.params[1], "team-b");
    } finally {
      cleanup();
    }
  });

  it("always sets a report deadline from the settings", async () => {
    // TC-MATCH-091
    // ★無いと auto-resolve-matches が対象を判定できない（09 14章）。
    //   用意した試合も通常の確定フローに従う（ADR-035 ⑤）。
    const { db, res } = run(okStubs(settings({ report_timeout_minutes: 90 })));
    try {
      await res;
      const insert = db.find("INSERT INTO matches")!;
      assertStringIncludes(insert.sql, "report_deadline_at");
      assertStringIncludes(insert.sql, "minutes')::interval");
      assertEquals(insert.params[2], "90");
    } finally {
      cleanup();
    }
  });

  it("never consults the fairness mechanisms of automatic matchmaking", async () => {
    // TC-MATCH-092
    // ★ADR-035 ⑤ の中心である。大会では実力差のあるカードも、回線相性のあるペアも組む。
    //   再マッチ抑止・クールダウン・許容レート差のいずれも見てはならない。
    const { db, res } = run(okStubs());
    try {
      await res;
      for (const query of db.executed) {
        assertEquals(/match_avoidance/.test(query.sql), false);
        assertEquals(/queue_cooldown_until/.test(query.sql), false);
        assertEquals(/match_rating_range/.test(query.sql), false);
      }
    } finally {
      cleanup();
    }
  });

  it("never rejects a team that already has a match in progress", async () => {
    // TC-MATCH-093
    // ★1チームへの複数割り当てが本機能の目的である（ADR-035 ⑤）。
    //   待機列への入り口の規則（QUEUE-002）はここには効かない。
    const { db, res } = run(okStubs());
    try {
      assertEquals((await res).status, 200);
      // 進行中の試合を数える問い合わせ自体を行わない。
      assertEquals(db.find("status NOT IN ('COMPLETED', 'DRAWN')"), undefined);
    } finally {
      cleanup();
    }
  });

  it("records the preparation separately from an automatic match", async () => {
    // TC-MATCH-094
    // ★MATCH_CREATED と分ける（ADR-039 ⑦）。同じ action にすると、
    //   後から「誰が用意した試合か」を数えられない。
    const { db, res } = run(okStubs());
    try {
      await res;
      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'MATCH_PREPARED'");
      assertEquals(audit.params[0], "admin-1");
    } finally {
      cleanup();
    }
  });

  it("publishes MATCH_CREATED so both teams refetch", async () => {
    // TC-MATCH-095
    setJwtVerifier(adminVerifier);
    const sent: { channel: string; event: string }[] = [];
    setBroadcaster((channel, event) => {
      sent.push({ channel, event });
      return Promise.resolve();
    });
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);
    try {
      await createMatch(post());
      assertEquals(sent, [{ channel: "match", event: "MATCH_CREATED" }]);
    } finally {
      cleanup();
    }
  });

  // ---- 従うもの（ADR-039 ③④）----

  it("refuses to prepare a match while the season change is in progress", async () => {
    // TC-MATCH-096
    // ★確定処理に巻き込まれ、用意した直後に SEASON_END で打ち切られる（ADR-038 ①）。
    const { db, res } = run(okStubs(settings({ updates_locked: true })));
    try {
      const response = await res;
      assertEquals(response.status, 409);
      assertEquals((await response.json()).error.code, "SEASON-001");
      assertEquals(db.find("INSERT INTO matches"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      cleanup();
    }
  });

  it("refuses to prepare a match while matchmaking is paused for the season", async () => {
    // TC-MATCH-097
    // ★猶予中に作ると、進行中の試合が尽きるのを待つ猶予がいつまでも終わらない。
    const { db, res } = run(okStubs(settings({ matchmaking_paused: true })));
    try {
      const response = await res;
      assertEquals(response.status, 409);
      assertEquals((await response.json()).error.code, "SEASON-002");
      assertEquals(db.find("INSERT INTO matches"), undefined);
    } finally {
      cleanup();
    }
  });

  it("refuses to prepare a match during maintenance", async () => {
    // TC-MATCH-098
    // ★ADR-034 ⑥ の手順（停止 → 無効化）と矛盾する。
    const { db, res } = run(okStubs(settings({ maintenance_paused: true })));
    try {
      const response = await res;
      assertEquals(response.status, 409);
      assertEquals((await response.json()).error.code, "QUEUE-007");
      assertEquals(db.find("INSERT INTO matches"), undefined);
    } finally {
      cleanup();
    }
  });

  it("refuses a banned team", async () => {
    // TC-MATCH-099
    const { db, res } = run(okStubs(settings(), teams([{}, { is_banned: true }])));
    try {
      const response = await res;
      assertEquals(response.status, 409);
      assertEquals((await response.json()).error.code, "TEAM-006");
      assertEquals(db.find("INSERT INTO matches"), undefined);
    } finally {
      cleanup();
    }
  });

  it("refuses a team with no members", async () => {
    // TC-MATCH-100
    // ★誰も申告・投了・承認できない。報告期限まで相手を拘束して引き分けに終わる。
    //   最後の1人が抜けてもチームは残る仕様である（04 9.5）。
    const { db, res } = run(okStubs(settings(), teams([{ member_count: 0 }, {}])));
    try {
      const response = await res;
      assertEquals(response.status, 409);
      assertEquals((await response.json()).error.code, "TEAM-011");
      assertEquals(db.find("INSERT INTO matches"), undefined);
    } finally {
      cleanup();
    }
  });

  it("allows an uneven roster", async () => {
    // TC-MATCH-101
    // ★必須人数は要求しない（ADR-039 ④）。あれは待機列への入り口の条件であり、
    //   管理者による用意は待機列を経由しない。不揃いは画面が知らせる。
    const { res } = run(okStubs(settings(), teams([{ member_count: 3 }, { member_count: 1 }])));
    try {
      assertEquals((await res).status, 200);
    } finally {
      cleanup();
    }
  });

  it("refuses when one of the teams does not exist", async () => {
    // TC-MATCH-102
    const { res } = run(okStubs(settings(), [teams()[0]]));
    try {
      const response = await res;
      assertEquals(response.status, 404);
      assertEquals((await response.json()).error.code, "TEAM-001");
    } finally {
      cleanup();
    }
  });

  it("refuses to pair a team with itself", async () => {
    // TC-MATCH-103 DBの chk_matches_teams_different より前に弾く。
    // ここで通すと原因が VALIDATION-001 ではなく SYSTEM-001 になる。
    const { db, res } = run(okStubs(), adminVerifier, { teamAId: "team-a", teamBId: "team-a" });
    try {
      const response = await res;
      assertEquals(response.status, 400);
      assertEquals((await response.json()).error.code, "VALIDATION-001");
      assertEquals(db.executed.length, 0);
    } finally {
      cleanup();
    }
  });

  it("rejects a missing team id", async () => {
    // TC-MATCH-104
    const { res } = run(okStubs(), adminVerifier, { teamAId: "team-a" });
    try {
      const response = await res;
      assertEquals(response.status, 400);
      assertEquals((await response.json()).error.code, "VALIDATION-001");
    } finally {
      cleanup();
    }
  });

  it("rejects a non-administrator", async () => {
    // TC-MATCH-105
    const { db, res } = run(okStubs(), userVerifier);
    try {
      const response = await res;
      assertEquals(response.status, 403);
      assertEquals((await response.json()).error.code, "ADMIN-001");
      assertEquals(db.executed.length, 0);
    } finally {
      cleanup();
    }
  });
});
