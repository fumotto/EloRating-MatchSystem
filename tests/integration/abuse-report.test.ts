// 通報（ADR-033 / 10_TestSpecification Part7 3.3.1）。
//
// ★通報は勝敗フローから完全に独立している。試合の状態にもレートにも影響しない。
// ★最重要は「通報元チームを JWT から導出すること」である。入力から受け取ると
//   通報元チーム数（ADR-033 ④ の m）を偽装でき、判断材料が壊れる。
import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals } from "jsr:@std/assert";
import * as create from "../../supabase/functions/create-abuse-report/index.ts";
import * as withdraw from "../../supabase/functions/withdraw-abuse-report/index.ts";
import * as resolve from "../../supabase/functions/admin-resolve-abuse-report/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const userVerifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-1" },
  });

const adminVerifier = () =>
  Promise.resolve({
    sub: "admin-1",
    app_metadata: { provider: "discord", role: "admin" },
    user_metadata: { provider_id: "discord-admin" },
  });

const DETAIL = "相手が勝っていないのに勝利を申告しました";

const createStubs = (over: QueryStub[] = []): QueryStub[] => [
  ...over,
  ["SELECT team_id FROM team_members WHERE profile_id = $1", [{ team_id: "team-a" }]],
  ["SELECT id FROM teams WHERE id = $1", [{ id: "team-b" }]],
  ["SELECT id FROM matches WHERE id = $1", [{ id: "match-1" }]],
  ["SELECT id FROM abuse_reports", []],
  ["INSERT INTO abuse_reports", [{
    id: "report-1",
    created_at: new Date("2026-08-27T00:00:00Z"),
  }]],
];

// deno-lint-ignore no-explicit-any
const withDb = async (mod: any, stubs: QueryStub[], verifier: unknown, fn: (db: ReturnType<typeof createMockDb>) => Promise<void>) => {
  const db = createMockDb(stubs);
  mod.setDbPool(db.pool as never);
  mod.setJwtVerifier(verifier);
  if (mod.setBroadcaster) mod.setBroadcaster(() => Promise.resolve());
  try {
    await fn(db);
  } finally {
    mod.resetDbPool();
    mod.resetJwtVerifier();
    if (mod.resetBroadcaster) mod.resetBroadcaster();
  }
};

// deno-lint-ignore no-explicit-any
const call = (mod: any, body: unknown) =>
  mod.handler(
    new Request(URL_FN, { method: "POST", headers: AUTH_HEADERS, body: JSON.stringify(body) }),
  );

describe("create-abuse-report", () => {
  it("creates an abuse report", async () => {
    // TC-ADMIN-201
    await withDb(create, createStubs(), userVerifier, async (db) => {
      const res = await call(create, {
        targetTeamId: "team-b",
        reasonCode: "FALSE_REPORT",
        detail: DETAIL,
        matchId: "match-1",
      });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.status, "OPEN");
      assertEquals(db.committed(), true);
    });
  });

  it("derives the reporter team from the JWT only", async () => {
    // TC-ADMIN-203 / TC-SEC-042 ★最重要
    await withDb(create, createStubs(), userVerifier, async (db) => {
      await call(create, {
        targetTeamId: "team-b",
        reporterTeamId: "team-zzz", // 詐称の試み
        reasonCode: "FALSE_REPORT",
        detail: DETAIL,
        matchId: "match-1",
      });
      const insert = db.find("INSERT INTO abuse_reports")!;
      assertEquals(insert.params.includes("team-zzz"), false);
      assertEquals(insert.params[2], "team-a");
    });
  });

  it("accepts a report from a user without a team", async () => {
    // TC-ADMIN-202 無所属でも通報できる。reporter_team_id は NULL
    const stubs = createStubs([["SELECT team_id FROM team_members WHERE profile_id = $1", []]]);
    await withDb(create, stubs, userVerifier, async (db) => {
      const res = await call(create, {
        targetTeamId: "team-b",
        reasonCode: "HARASSMENT",
        detail: DETAIL,
      });
      assertEquals(res.status, 200);
      assertEquals(db.find("INSERT INTO abuse_reports")!.params[2], null);
    });
  });

  it("accepts a report without evidence", async () => {
    // TC-ADMIN-209 ★証拠を必須にしない
    await withDb(create, createStubs(), userVerifier, async () => {
      const res = await call(create, {
        targetTeamId: "team-b",
        reasonCode: "OTHER",
        detail: DETAIL,
      });
      assertEquals(res.status, 200);
    });
  });

  it("rejects a report against the reporter's own team", async () => {
    // TC-ADMIN-204 / TC-SEC-043
    const stubs = createStubs([["SELECT id FROM teams WHERE id = $1", [{ id: "team-a" }]]]);
    await withDb(create, stubs, userVerifier, async () => {
      const res = await call(create, {
        targetTeamId: "team-a",
        reasonCode: "OTHER",
        detail: DETAIL,
      });
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "ABUSE-002");
    });
  });

  it("rejects a detail shorter than 10 characters", async () => {
    // TC-ADMIN-205
    await withDb(create, createStubs(), userVerifier, async () => {
      const res = await call(create, {
        targetTeamId: "team-b",
        reasonCode: "OTHER",
        detail: "短い",
      });
      assertEquals(res.status, 400);
    });
  });

  it("rejects more than three evidence urls", async () => {
    // TC-ADMIN-207
    await withDb(create, createStubs(), userVerifier, async () => {
      const res = await call(create, {
        targetTeamId: "team-b",
        reasonCode: "OTHER",
        detail: DETAIL,
        evidenceUrls: ["https://a", "https://b", "https://c", "https://d"],
      });
      assertEquals(res.status, 400);
    });
  });

  it("rejects a non-https evidence url", async () => {
    // TC-ADMIN-208
    await withDb(create, createStubs(), userVerifier, async () => {
      const res = await call(create, {
        targetTeamId: "team-b",
        reasonCode: "OTHER",
        detail: DETAIL,
        evidenceUrls: ["http://insecure"],
      });
      assertEquals(res.status, 400);
    });
  });

  it("rejects a duplicate report for the same match", async () => {
    // TC-ADMIN-210
    const stubs = createStubs([["SELECT id FROM abuse_reports", [{ id: "existing" }]]]);
    await withDb(create, stubs, userVerifier, async () => {
      const res = await call(create, {
        targetTeamId: "team-b",
        reasonCode: "FALSE_REPORT",
        detail: DETAIL,
        matchId: "match-1",
      });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "ABUSE-003");
    });
  });

  it("accepts reports while season updates are locked", async () => {
    // TC-ADMIN-215 ★assertUpdatesAllowed を呼ばない
    await withDb(create, createStubs(), userVerifier, async (db) => {
      await call(create, {
        targetTeamId: "team-b",
        reasonCode: "OTHER",
        detail: DETAIL,
      });
      assertEquals(db.find("SELECT updates_locked"), undefined);
    });
  });

  it("leaves the match untouched when reported", async () => {
    // TC-ADMIN-214 ★通報から試合への経路は存在してはならない
    await withDb(create, createStubs(), userVerifier, async (db) => {
      await call(create, {
        targetTeamId: "team-b",
        reasonCode: "FALSE_REPORT",
        detail: DETAIL,
        matchId: "match-1",
      });
      assertEquals(db.find("UPDATE matches"), undefined);
      assertEquals(db.find("UPDATE teams"), undefined);
      assertEquals(db.find("INSERT INTO rating_history"), undefined);
    });
  });
});

describe("withdraw-abuse-report", () => {
  const stubs = (over: QueryStub[] = []): QueryStub[] => [
    ...over,
    ["SELECT reporter_profile_id, status FROM abuse_reports", [{
      reporter_profile_id: "profile-1",
      status: "OPEN",
    }]],
  ];

  it("withdraws the reporter's own report", async () => {
    // TC-ADMIN-217
    await withDb(withdraw, stubs(), userVerifier, async (db) => {
      const res = await call(withdraw, { reportId: "report-1" });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.status, "WITHDRAWN");
      assertEquals(db.committed(), true);
    });
  });

  it("rejects withdrawing another's report", async () => {
    // TC-ADMIN-218 / TC-SEC-045
    const s = stubs([["SELECT reporter_profile_id, status FROM abuse_reports", [{
      reporter_profile_id: "profile-9",
      status: "OPEN",
    }]]]);
    await withDb(withdraw, s, userVerifier, async () => {
      const res = await call(withdraw, { reportId: "report-1" });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "ABUSE-007");
    });
  });

  it("rejects withdrawing a resolved report", async () => {
    // TC-ADMIN-219
    const s = stubs([["SELECT reporter_profile_id, status FROM abuse_reports", [{
      reporter_profile_id: "profile-1",
      status: "NO_ACTION",
    }]]]);
    await withDb(withdraw, s, userVerifier, async () => {
      const res = await call(withdraw, { reportId: "report-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "ABUSE-006");
    });
  });
});

describe("admin-resolve-abuse-report", () => {
  const stubs = (over: QueryStub[] = []): QueryStub[] => [
    ...over,
    ["SELECT status, target_team_id FROM abuse_reports", [{
      status: "OPEN",
      target_team_id: "team-b",
    }]],
    ["UPDATE teams SET is_banned", [{ id: "team-b" }]],
    ["UPDATE abuse_reports", [{ resolved_at: new Date("2026-08-27T01:00:00Z") }]],
  ];

  it("closes a report without action", async () => {
    // TC-ADMIN-220
    await withDb(resolve, stubs(), adminVerifier, async (db) => {
      const res = await call(resolve, { reportId: "report-1", resolution: "NO_ACTION" });
      assertEquals(res.status, 200);
      assertEquals(db.find("queue_cooldown_until"), undefined);
      assertEquals(db.find("UPDATE teams SET is_banned"), undefined);
    });
  });

  it("applies a cooldown as a sanction", async () => {
    // TC-ADMIN-221
    await withDb(resolve, stubs(), adminVerifier, async (db) => {
      const res = await call(resolve, {
        reportId: "report-1",
        resolution: "COOLDOWN",
        cooldownMinutes: 60,
      });
      assertEquals(res.status, 200);
      assertEquals(db.findAll("queue_cooldown_until").length, 1);
    });
  });

  it("bans the team as a sanction", async () => {
    // TC-ADMIN-222 ★BAN処理は admin-ban-team と共用する
    await withDb(resolve, stubs(), adminVerifier, async (db) => {
      const res = await call(resolve, { reportId: "report-1", resolution: "BANNED" });
      assertEquals(res.status, 200);
      assertEquals(db.findAll("UPDATE teams SET is_banned").length, 1);
      // BANは待機列からの削除を伴う。共用していなければここが漏れる。
      assertEquals(db.findAll("DELETE FROM matching_queue").length, 1);
    });
  });

  it("never modifies a completed match", async () => {
    // TC-ADMIN-223 / TC-SEC-046 ★通報から結果への経路は存在してはならない
    await withDb(resolve, stubs(), adminVerifier, async (db) => {
      await call(resolve, { reportId: "report-1", resolution: "BANNED" });
      assertEquals(db.find("UPDATE matches"), undefined);
      assertEquals(db.find("INSERT INTO rating_history"), undefined);
      assertEquals(db.find("UPDATE teams SET rating"), undefined);
    });
  });

  it("rejects resolving a report twice", async () => {
    // TC-ADMIN-224
    const s = stubs([["SELECT status, target_team_id FROM abuse_reports", [{
      status: "BANNED",
      target_team_id: "team-b",
    }]]]);
    await withDb(resolve, s, adminVerifier, async () => {
      const res = await call(resolve, { reportId: "report-1", resolution: "NO_ACTION" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "ABUSE-006");
    });
  });

  it("rejects a non-admin resolution", async () => {
    // TC-ADMIN-225
    await withDb(resolve, stubs(), userVerifier, async () => {
      const res = await call(resolve, { reportId: "report-1", resolution: "NO_ACTION" });
      assertEquals(res.status, 403);
    });
  });

  it("requires cooldown minutes for a cooldown sanction", async () => {
    await withDb(resolve, stubs(), adminVerifier, async () => {
      const res = await call(resolve, { reportId: "report-1", resolution: "COOLDOWN" });
      assertEquals(res.status, 400);
    });
  });
});
