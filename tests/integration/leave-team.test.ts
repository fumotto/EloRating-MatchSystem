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
} from "../../supabase/functions/leave-team/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

const authenticatedVerifier = () =>
  Promise.resolve({
    sub: "profile-2",
    app_metadata: { provider: "discord", role: "user" },
    user_metadata: { provider_id: "discord-user-2" },
  });

// 既定はMEMBER・進行中の試合なし・3人チーム。
const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
  ...overrides,
  ["SELECT team_id, role FROM team_members", [{ team_id: "team-1", role: "MEMBER" }]],
  ["SELECT is_banned FROM teams", [{ is_banned: false }]],
  ["FROM matches", []],
  ["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 3 }]],
];

const post = () =>
  handler(new Request(URL_FN, { method: "POST", headers: AUTH_HEADERS, body: "{}" }));

const recordBroadcasts = () => {
  const sent: { channel: string; event: string }[] = [];
  setBroadcaster((channel, event) => {
    sent.push({ channel, event });
    return Promise.resolve();
  });
  return sent;
};

describe("leave-team", () => {
  it("lets a member leave the team", async () => {
    // TC-TEAM-036
    setJwtVerifier(authenticatedVerifier);
    const sent = recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post();
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.teamId, "team-1");
      assertEquals(data.data.remainingMembers, 2);

      const del = db.find("DELETE FROM team_members");
      if (!del) throw new Error("team_members からの DELETE が発行されていない");
      assertEquals(del.params, ["profile-2"]);

      assertEquals(db.committed(), true);
      assertEquals(sent, [{ channel: "team", event: "TEAM_MEMBER_UPDATED" }]);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects leaving while a match is in progress", async () => {
    // TC-TEAM-037
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(okStubs([["FROM matches", [{ id: "match-1" }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post();
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-007");
      assertEquals(db.find("DELETE FROM team_members"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("allows leaving after the match was drawn", async () => {
    // TC-TEAM-042
    // ★終端状態（COMPLETED / DRAWN）を進行中に数えると、一度試合をしたチームから
    //   誰も抜けられなくなる。判定は status NOT IN ('COMPLETED','DRAWN') で行う。
    setJwtVerifier(authenticatedVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      assertEquals((await post()).status, 200);
      assertStringIncludes(db.find("FROM matches")!.sql, "NOT IN ('COMPLETED', 'DRAWN')");
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("requires a leader transfer before leaving", async () => {
    // TC-TEAM-038 LEADER かつ他メンバーが存在
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(
      okStubs([["SELECT team_id, role FROM team_members", [
        { team_id: "team-1", role: "LEADER" },
      ]]]),
    );
    setDbPool(db.pool as never);

    try {
      const res = await post();
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-008");
      assertEquals(db.find("DELETE FROM team_members"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("allows the last leader to leave", async () => {
    // TC-TEAM-039 単独メンバーのLEADERは移譲先が居ないため脱退できる
    setJwtVerifier(authenticatedVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs([
      ["SELECT team_id, role FROM team_members", [{ team_id: "team-1", role: "LEADER" }]],
      ["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 1 }]],
    ]));
    setDbPool(db.pool as never);

    try {
      const res = await post();
      assertEquals(res.status, 200);
      // チームはメンバー0人で残存する。チーム削除はMVP対象外である。
      assertEquals((await res.json()).data.remainingMembers, 0);
      assertEquals(db.find("DELETE FROM teams"), undefined);
    } finally {
      resetJwtVerifier();
      resetDbPool();
      resetBroadcaster();
    }
  });

  it("rejects leaving when not in a team", async () => {
    // TC-TEAM-040
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(okStubs([["SELECT team_id, role FROM team_members", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post();
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-010");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("removes the team from the queue when the leader leaves", async () => {
    // TC-TEAM-041
    setJwtVerifier(authenticatedVerifier);
    recordBroadcasts();
    const db = createMockDb(okStubs([
      ["SELECT team_id, role FROM team_members", [{ team_id: "team-1", role: "LEADER" }]],
      ["SELECT COUNT(*)::int AS count FROM team_members", [{ count: 1 }]],
    ]));
    setDbPool(db.pool as never);

    try {
      assertEquals((await post()).status, 200);

      const dequeue = db.find("DELETE FROM matching_queue");
      if (!dequeue) throw new Error("matching_queue からの DELETE が発行されていない");
      assertEquals(dequeue.params, ["team-1"]);
      // 残したままだとメンバー0人のチームがマッチしうる。
      assertEquals(
        db.executed.indexOf(dequeue) < db.executed.indexOf(db.find("DELETE FROM team_members")!),
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
      const res = await post();
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error.code, "AUTH-001");
    } finally {
      resetJwtVerifier();
    }
  });

  it("refuses to leave a banned team", async () => {
    // Issue #9 BANされたチームは編成を変えられない。
    // ★脱退を許すと、全員が抜けて作り直すことで制裁を回避できてしまう。
    setJwtVerifier(authenticatedVerifier);
    const db = createMockDb(okStubs([["SELECT is_banned FROM teams", [{ is_banned: true }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post();
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "TEAM-006");
      assertEquals(db.find("DELETE FROM team_members"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });
});
