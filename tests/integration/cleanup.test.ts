import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler as cleanupInvites,
  setDbPool as setInvitesPool,
  resetDbPool as resetInvitesPool,
} from "../../supabase/functions/cleanup-expired-invites/index.ts";
import {
  handler as cleanupQueue,
  setDbPool as setQueuePool,
  resetDbPool as resetQueuePool,
} from "../../supabase/functions/cleanup-matching-queue/index.ts";
import { createMockDb } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const SERVICE_ROLE_KEY = "test-service-role-key";
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
const serviceHeaders = { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` };

const request = (headers: HeadersInit = serviceHeaders) =>
  new Request(URL_FN, { method: "POST", headers });

describe("cleanup-expired-invites", () => {
  it("expires only active invites past their expiry", async () => {
    const db = createMockDb([["UPDATE team_invites", [{ id: "invite-1" }, { id: "invite-2" }]]]);
    setInvitesPool(db.pool as never);

    try {
      const res = await cleanupInvites(request());
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.expiredCount, 2);

      const update = db.find("UPDATE team_invites")!;
      assertStringIncludes(update.sql, "SET status = 'EXPIRED'");
      // USED / REVOKED を EXPIRED で塗り潰してはならない。理由が失われる。
      assertStringIncludes(update.sql, "WHERE status = 'ACTIVE' AND expires_at < NOW()");
    } finally {
      resetInvitesPool();
    }
  });

  it("keeps invites that are still valid", async () => {
    const db = createMockDb([["UPDATE team_invites", []]]);
    setInvitesPool(db.pool as never);

    try {
      const res = await cleanupInvites(request());
      assertEquals((await res.json()).data.expiredCount, 0);
    } finally {
      resetInvitesPool();
    }
  });

  it("rejects a call without the service role key", async () => {
    const db = createMockDb();
    setInvitesPool(db.pool as never);

    try {
      const res = await cleanupInvites(request({ "Authorization": "Bearer user-token" }));
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "AUTH-004");
      assertEquals(db.executed.length, 0);
    } finally {
      resetInvitesPool();
    }
  });
});

describe("cleanup-matching-queue", () => {
  it("removes stale queue entries older than 24 hours", async () => {
    // TC-QUEUE-043
    const db = createMockDb([["DELETE FROM matching_queue", [{ team_id: "team-old" }]]]);
    setQueuePool(db.pool as never);

    try {
      const res = await cleanupQueue(request());
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.removedCount, 1);

      const del = db.find("DELETE FROM matching_queue")!;
      assertStringIncludes(del.sql, "queued_at < NOW() - ($1 || ' hours')::interval");
      // 滞留とみなす閾値は 09 10章の24時間である。
      assertEquals(del.params, ["24"]);
    } finally {
      resetQueuePool();
    }
  });

  it("keeps recent queue entries", async () => {
    // TC-QUEUE-044 通常は0件である。0件でも正常応答とする。
    const db = createMockDb([["DELETE FROM matching_queue", []]]);
    setQueuePool(db.pool as never);

    try {
      const res = await cleanupQueue(request());
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.removedCount, 0);
    } finally {
      resetQueuePool();
    }
  });

  it("rejects a call without the service role key", async () => {
    const db = createMockDb();
    setQueuePool(db.pool as never);

    try {
      const res = await cleanupQueue(request({}));
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "AUTH-004");
    } finally {
      resetQueuePool();
    }
  });
});
