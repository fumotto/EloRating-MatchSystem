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
} from "../../supabase/functions/accept-team-invite/index.ts";
import { hashInviteCode } from "../../supabase/functions/_shared/invite.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};
const INVITE_CODE = "ABCDEFGHIJKLMNOPQRSTUVWXY2";

const authenticatedVerifier = () =>
  Promise.resolve({
    sub: "profile-2",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-2" },
  });

const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["FROM team_invites WHERE invite_code_hash", [
    { id: "invite-1", team_id: "team-1", status: "ACTIVE", expired: false },
  ]],
  ["SELECT name, is_banned FROM teams", [{ name: "Test Team", is_banned: false }]],
  ["SELECT id FROM team_members WHERE profile_id = $1", []],
  ["SELECT team_max_members FROM system_settings", [{ team_max_members: 3 }]],
  ["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 1 }]],
];

const post = (body: unknown) =>
  handler(
    new Request(URL_FN, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(body),
    }),
  );

// 送信されたRealtimeイベントを記録する。
const recordBroadcasts = () => {
  const sent: { channel: string; event: string }[] = [];
  setBroadcaster((channel, event) => {
    sent.push({ channel, event });
    return Promise.resolve();
  });
  return sent;
};

describe("accept-team-invite", () => {
  it("adds the member and marks the invite as used", async () => {
    // TC-TEAM-025
    setJwtVerifier(authenticatedVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.teamId, "team-1");
      assertEquals(data.data.teamName, "Test Team");

      const insert = db.find("INSERT INTO team_members");
      if (!insert) throw new Error("team_members への INSERT が発行されていない");

      const used = db.find("SET status = 'USED'");
      if (!used) throw new Error("招待の USED 更新が発行されていない");
      // chk_team_invites_used_at により、status='USED' と used_at は同時でなければならない。
      assertStringIncludes(used.sql, "used_at = NOW()");
      assertStringIncludes(used.sql, "used_by_profile_id");

      assertEquals(db.committed(), true);
      // TEAM_MEMBER_UPDATED はコミット後に送る（04 7章・18章）。
      assertEquals(sent, [{ channel: "team", event: "TEAM_MEMBER_UPDATED" }]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("joins as a member, not a leader", async () => {
    // TC-TEAM-026
    setJwtVerifier(authenticatedVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      assertEquals((await post({ inviteCode: INVITE_CODE })).status, 200);
      // ★'LEADER' で入れると ux_team_members_leader に衝突し、既存LEADERも失う。
      assertStringIncludes(db.find("INSERT INTO team_members")!.sql, "'MEMBER'");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("looks the invite up by its hash, never by the plaintext", async () => {
    // TC-SEC-020 の対。DBに平文は無いため、照合もハッシュで行うほかない。
    setJwtVerifier(authenticatedVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post({ inviteCode: INVITE_CODE });
      const lookup = db.find("FROM team_invites WHERE invite_code_hash")!;
      assertEquals(lookup.params[0], await hashInviteCode(INVITE_CODE));
      assertEquals(lookup.params.includes(INVITE_CODE), false);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects an unknown invite code", async () => {
    // TC-TEAM-027
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(okStubs([["FROM team_invites WHERE invite_code_hash", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 404);
      assertEquals((await res.json()).error.code, "INVITE-001");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects an expired invite", async () => {
    // TC-TEAM-028 / TC-SEC-023
    // 期限切れは status が ACTIVE のまま到来しうる（EXPIRED を付けるのはバッチである）。
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(okStubs([[
      "FROM team_invites WHERE invite_code_hash",
      [{ id: "invite-1", team_id: "team-1", status: "ACTIVE", expired: true }],
    ]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "INVITE-002");
      assertEquals(db.find("INSERT INTO team_members"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects an already used invite", async () => {
    // TC-TEAM-029 / TC-SEC-024
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(okStubs([[
      "FROM team_invites WHERE invite_code_hash",
      [{ id: "invite-1", team_id: "team-1", status: "USED", expired: false }],
    ]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "INVITE-003");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects a revoked invite", async () => {
    // TC-TEAM-030
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(okStubs([[
      "FROM team_invites WHERE invite_code_hash",
      [{ id: "invite-1", team_id: "team-1", status: "REVOKED", expired: false }],
    ]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "INVITE-004");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects joining while already in a team", async () => {
    // TC-TEAM-031
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(
      okStubs([["SELECT id FROM team_members WHERE profile_id = $1", [{ id: "member-1" }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-003");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects joining a full team", async () => {
    // TC-TEAM-032
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(
      okStubs([["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 3 }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-004");
      assertEquals(db.find("INSERT INTO team_members"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("accepts the member that fills the last slot", async () => {
    // TC-TEAM-035 上限まで残り1名（3人上限で2人在籍）
    setJwtVerifier(authenticatedVerifier);
    recordBroadcasts();
    const db = createMockDb(
      okStubs([["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 2 }]]]),
    );
    setDbPool(db.pool as never);

    try {
      assertEquals((await post({ inviteCode: INVITE_CODE })).status, 200);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("prevents exceeding the member limit under concurrency", async () => {
    // TC-TEAM-034
    // ★モックでは実際の同時実行は再現できない。ここで検証するのは、超過を防ぐ仕組みが
    //   コードに存在すること——teams の行ロックを取り、そのロック取得より後に人数を
    //   数え直していること——である。実際の直列化は pgTAP / 実DBでの検証に委ねる。
    setJwtVerifier(authenticatedVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      await post({ inviteCode: INVITE_CODE });

      const lock = db.find("FOR UPDATE");
      if (!lock) throw new Error("teams の行ロックが取得されていない");
      assertStringIncludes(lock.sql, "FROM teams WHERE id = $1 FOR UPDATE");

      const count = db.find("SELECT COUNT(*)::int AS count FROM team_members")!;
      // ロックを取る前に数えると、2つのトランザクションが同じ件数を読んで双方成功しうる。
      assertEquals(db.executed.indexOf(lock) < db.executed.indexOf(count), true);
      // INSERT は数え直しより後でなければならない。
      assertEquals(
        db.executed.indexOf(count) < db.executed.indexOf(db.find("INSERT INTO team_members")!),
        true,
      );
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects joining a banned team", async () => {
    // TC-TEAM-033
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(
      okStubs([["SELECT name, is_banned FROM teams", [{ name: "Banned", is_banned: true }]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-006");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("does not broadcast when the join fails", async () => {
    // Realtimeはコミット成功後にのみ送る。失敗時に送ると画面が誤って更新される。
    setJwtVerifier(authenticatedVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs([["FROM team_invites WHERE invite_code_hash", []]]));
    setDbPool(db.pool as never);

    try {
      assertEquals((await post({ inviteCode: INVITE_CODE })).status, 404);
      assertEquals(sent.length, 0);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects an unauthenticated call", async () => {
    setJwtVerifier(() => Promise.resolve(null));
    try {
      const res = await post({ inviteCode: INVITE_CODE });
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects a missing invite code", async () => {
    setJwtVerifier(authenticatedVerifier);
    try {
      const res = await post({});
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });
});
