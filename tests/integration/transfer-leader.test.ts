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
} from "../../supabase/functions/transfer-leader/index.ts";
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

const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["SELECT team_id, role FROM team_members WHERE profile_id = $1", [
    { team_id: "team-1", role: "LEADER" },
  ]],
  ["SELECT is_banned FROM teams", [{ is_banned: false }]],
  ["SELECT id FROM team_members WHERE profile_id = $1 AND team_id = $2", [{ id: "member-2" }]],
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
  const sent: { channel: string; event: string }[] = [];
  setBroadcaster((channel, event) => {
    sent.push({ channel, event });
    return Promise.resolve();
  });
  return sent;
};

describe("transfer-leader", () => {
  it("transfers the leader role", async () => {
    // TC-TEAM-043
    setJwtVerifier(leaderVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ newLeaderProfileId: "profile-2" });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.leaderId, "profile-2");
      assertEquals(db.committed(), true);
      assertEquals(sent, [{ channel: "team", event: "TEAM_MEMBER_UPDATED" }]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("demotes the current leader before promoting the new one", async () => {
    // TC-TEAM-045 / TC-TEAM-044
    // ★順序が逆だと ux_team_members_leader（部分UNIQUE）違反で必ず失敗する。
    setJwtVerifier(leaderVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      assertEquals((await post({ newLeaderProfileId: "profile-2" })).status, 200);

      const demote = db.find("SET role = 'MEMBER'");
      const promote = db.find("SET role = 'LEADER'");
      if (!demote || !promote) throw new Error("役割の更新が2件発行されていない");

      assertEquals(demote.params, ["profile-1"]);
      assertEquals(promote.params, ["profile-2"]);
      assertEquals(db.executed.indexOf(demote) < db.executed.indexOf(promote), true);

      // 同一トランザクション内であること。分かれるとLEADER不在の瞬間が観測されうる。
      assertStringIncludes(db.executed[0].sql, "BEGIN");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects a transfer by a non-leader", async () => {
    // TC-TEAM-046
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([[
      "SELECT team_id, role FROM team_members WHERE profile_id = $1",
      [{ team_id: "team-1", role: "MEMBER" }],
    ]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ newLeaderProfileId: "profile-2" });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "TEAM-005");
      assertEquals(db.find("SET role = 'LEADER'"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects transferring to a member of another team", async () => {
    // TC-TEAM-047 別チームのメンバーは team_id 条件で引けない
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([[
      "SELECT id FROM team_members WHERE profile_id = $1 AND team_id = $2",
      [],
    ]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ newLeaderProfileId: "profile-9" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-009");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects transferring to an unknown profile", async () => {
    // TC-TEAM-049
    // 存在しない profile も他チームのメンバーも同じ TEAM-009 とする。
    // 区別すると、どの profile が実在するかを外部から探れてしまう。
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([[
      "SELECT id FROM team_members WHERE profile_id = $1 AND team_id = $2",
      [],
    ]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ newLeaderProfileId: "does-not-exist" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-009");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects transferring to yourself", async () => {
    // TC-TEAM-048
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ newLeaderProfileId: "profile-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-009");
      // 自己譲渡を通すと、降格→昇格で同一行を2回更新することになる。
      assertEquals(db.find("SET role = 'MEMBER'"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects an unauthenticated call", async () => {
    setJwtVerifier(() => Promise.resolve(null));
    try {
      const res = await post({ newLeaderProfileId: "profile-2" });
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("rejects a missing transfer target", async () => {
    setJwtVerifier(leaderVerifier);
    try {
      const res = await post({});
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("refuses to transfer the leader of a banned team", async () => {
    // Issue #9 移譲も編成の変更である。凍結中に代表者だけ挿げ替えられると、
    // 誰に対する措置なのかが曖昧になる。
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT is_banned FROM teams", [{ is_banned: true }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ newLeaderProfileId: "member-2" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-006");
      assertEquals(db.find("UPDATE team_members"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });
});
