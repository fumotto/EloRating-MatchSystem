import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler,
  setDbPool,
  resetDbPool,
  setJwtVerifier,
  resetJwtVerifier,
} from "../../supabase/functions/create-team-invite/index.ts";
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

// 正常系の既定スタブ。個々のテストは異なる部分だけを先頭で上書きする。
const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["SELECT role FROM team_members", [{ role: "LEADER" }]],
  ["SELECT is_banned FROM teams", [{ is_banned: false }]],
  ["SELECT team_max_members, invite_expiration_hours", [
    { team_max_members: 3, invite_expiration_hours: 24 },
  ]],
  ["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 1 }]],
  ["INSERT INTO team_invites", [{ expires_at: new Date("2026-08-09T00:00:00Z") }]],
];

const post = (body: unknown) =>
  handler(
    new Request(URL_FN, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(body),
    }),
  );

describe("create-team-invite", () => {
  it("issues an invite code", async () => {
    // TC-TEAM-018
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.result, "OK");
      // 平文コードは応答でしか得られない（9.3）。
      assertEquals(/^[A-Z2-7]{26}$/.test(data.data.inviteCode), true);
      assertEquals(data.data.expiresAt, "2026-08-09T00:00:00.000Z");
      assertEquals(db.committed(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("stores only the hash of the invite code", async () => {
    // TC-TEAM-019 / TC-SEC-020
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      const data = await res.json();
      const plaintext = data.data.inviteCode as string;

      const insert = db.find("INSERT INTO team_invites");
      if (!insert) throw new Error("team_invites への INSERT が発行されていない");

      // ★平文がパラメータに紛れ込んでいないこと。ここが漏れると保存が平文になる。
      assertEquals(insert.params.includes(plaintext), false);
      // 保存されるのは SHA-256 の16進表記である。
      assertEquals(/^[0-9a-f]{64}$/.test(insert.params[1] as string), true);
      // 列名にも平文を置かない。
      assertStringIncludes(insert.sql, "invite_code_hash");
      assertEquals(/\binvite_code\b/.test(insert.sql), false);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("revokes the previous invite when issuing a new one", async () => {
    // TC-TEAM-020
    // 平文を再現できないため既存招待は返せない。旧招待を REVOKED にしてから発行する。
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      assertEquals((await post({ teamId: "team-1" })).status, 200);

      const revoke = db.find("SET status = 'REVOKED'");
      if (!revoke) throw new Error("旧招待の失効が実行されていない");
      assertStringIncludes(revoke.sql, "status = 'ACTIVE'");

      // ★失効が INSERT より前であること。順序を誤ると ux_team_invites_active に衝突する。
      const revokeIndex = db.executed.indexOf(revoke);
      const insertIndex = db.executed.indexOf(db.find("INSERT INTO team_invites")!);
      assertEquals(revokeIndex < insertIndex, true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("sets the expiry from system settings", async () => {
    // TC-TEAM-024
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([
      ["SELECT team_max_members, invite_expiration_hours", [
        { team_max_members: 3, invite_expiration_hours: 48 },
      ]],
    ]));
    setDbPool(db.pool as never);

    try {
      assertEquals((await post({ teamId: "team-1" })).status, 200);

      const insert = db.find("INSERT INTO team_invites")!;
      // 有効期限は設定値から算出する。ハードコードしてはならない（08 の初期レートと同じ方針）。
      assertStringIncludes(insert.sql, "hours')::interval");
      assertEquals(insert.params[3], "48");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects invite creation by a non-leader", async () => {
    // TC-TEAM-021 / TC-SEC-022
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT role FROM team_members", [{ role: "MEMBER" }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "TEAM-005");
      assertEquals(db.rolledBack(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects invite creation by someone outside the team", async () => {
    // 非メンバーは LEADER 行が引けない。TEAM-005 で弾く。
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT role FROM team_members", []]]));
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

  it("rejects invite creation when the team is full", async () => {
    // TC-TEAM-022
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(
      okStubs([["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 3 }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-004");
      // 満員なら招待を作ってはならない。
      assertEquals(db.find("INSERT INTO team_invites"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects invite creation for a banned team", async () => {
    // TC-TEAM-023
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

  it("returns TEAM-001 when the team does not exist", async () => {
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT is_banned FROM teams", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 404);
      assertEquals((await res.json()).error.code, "TEAM-001");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects an unauthenticated call", async () => {
    // TC-SEC-001
    setJwtVerifier(() => Promise.resolve(null));
    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects a non-string team id", async () => {
    setJwtVerifier(leaderVerifier);
    try {
      const res = await post({ teamId: 123 });
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });
});
