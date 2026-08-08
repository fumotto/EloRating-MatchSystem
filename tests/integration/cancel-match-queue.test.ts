import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler,
  setDbPool,
  resetDbPool,
  setJwtVerifier,
  resetJwtVerifier,
} from "../../supabase/functions/cancel-match-queue/index.ts";
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
  ["SELECT role FROM team_members", [{ role: "LEADER" }]],
  ["DELETE FROM matching_queue", [{ team_id: "team-1" }]],
];

const post = (body: unknown) =>
  handler(
    new Request(URL_FN, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(body),
    }),
  );

describe("cancel-match-queue", () => {
  it("cancels the queue entry", async () => {
    // TC-QUEUE-010
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs());
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.result, "OK");
      assertEquals(data.data.teamId, "team-1");
      assertEquals(db.committed(), true);
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects cancelling when not queued", async () => {
    // TC-QUEUE-011
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["DELETE FROM matching_queue", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "QUEUE-004");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects cancelling after the match was created", async () => {
    // TC-QUEUE-013
    // 成立時点でキューから消えているため、DELETE の対象が無い＝QUEUE-004 となる（09 9章）。
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["DELETE FROM matching_queue", []]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "QUEUE-004");

      // ★SELECT で待機を確かめてから DELETE すると、その間に成立した場合に
      //   「待機中でないのに成功」を返す。削除できたかどうかで判定する。
      assertStringIncludes(db.find("DELETE FROM matching_queue")!.sql, "RETURNING team_id");
    } finally {
      resetJwtVerifier();
      resetDbPool();
    }
  });

  it("rejects cancelling by a non-leader", async () => {
    // TC-QUEUE-012
    setJwtVerifier(leaderVerifier);
    const db = createMockDb(okStubs([["SELECT role FROM team_members", [{ role: "MEMBER" }]]]));
    setDbPool(db.pool as never);

    try {
      const res = await post({ teamId: "team-1" });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "TEAM-005");
      assertEquals(db.find("DELETE FROM matching_queue"), undefined);
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

  it("rejects a missing team id", async () => {
    setJwtVerifier(leaderVerifier);
    try {
      const res = await post({});
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error.code, "VALIDATION-001");
    } finally {
      resetJwtVerifier();
    }
  });
});
