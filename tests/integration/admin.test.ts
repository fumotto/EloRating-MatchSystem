import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler as banTeam,
  setDbPool as setBanPool,
  resetDbPool as resetBanPool,
  setJwtVerifier as setBanVerifier,
  resetJwtVerifier as resetBanVerifier,
  setBroadcaster as setBanBroadcaster,
  resetBroadcaster as resetBanBroadcaster,
} from "../../supabase/functions/admin-ban-team/index.ts";
import {
  handler as unbanTeam,
  setDbPool as setUnbanPool,
  resetDbPool as resetUnbanPool,
  setJwtVerifier as setUnbanVerifier,
  resetJwtVerifier as resetUnbanVerifier,
  setBroadcaster as setUnbanBroadcaster,
  resetBroadcaster as resetUnbanBroadcaster,
} from "../../supabase/functions/admin-unban-team/index.ts";
import {
  handler as updateSettings,
  setDbPool as setSettingsPool,
  resetDbPool as resetSettingsPool,
  setJwtVerifier as setSettingsVerifier,
  resetJwtVerifier as resetSettingsVerifier,
  setBroadcaster as setSettingsBroadcaster,
  resetBroadcaster as resetSettingsBroadcaster,
} from "../../supabase/functions/admin-update-system-settings/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

// 管理者判定の出所は app_metadata.role だけである（ADR-020）。
const adminVerifier = () =>
  Promise.resolve({
    sub: "admin-1",
    app_metadata: { provider: "discord", role: "admin" },
    user_metadata: { provider_id: "discord-admin" },
  });

const userVerifier = () =>
  Promise.resolve({
    sub: "profile-1",
    app_metadata: { provider: "discord" },
    user_metadata: { provider_id: "discord-user-1" },
  });

const post = (handler: (req: Request) => Promise<Response>, body: unknown) =>
  handler(
    new Request(URL_FN, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(body),
    }),
  );

describe("admin-ban-team", () => {
  const okStubs = (overrides: QueryStub[] = []): QueryStub[] => [
    ...overrides,
    ["UPDATE teams SET is_banned = TRUE", [{ id: "team-1" }]],
  ];

  const validBody = { teamId: "team-1", reason: "不正行為のため" };

  it("bans a team", async () => {
    // TC-ADMIN-005 / TC-ADMIN-001
    setBanVerifier(adminVerifier);
    const sent: { channel: string; event: string }[] = [];
    setBanBroadcaster((channel, event) => {
      sent.push({ channel, event });
      return Promise.resolve();
    });
    const db = createMockDb(okStubs());
    setBanPool(db.pool as never);

    try {
      const res = await post(banTeam, validBody);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data, { teamId: "team-1", isBanned: true });
      // TC-ADMIN-015
      assertEquals(sent, [{ channel: "team", event: "TEAM_UPDATED" }]);
    } finally {
      resetBanVerifier();
      resetBanPool();
      resetBanBroadcaster();
    }
  });

  it("removes a banned team from the queue", async () => {
    // TC-ADMIN-006
    setBanVerifier(adminVerifier);
    setBanBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs());
    setBanPool(db.pool as never);

    try {
      await post(banTeam, validBody);
      assertEquals(db.find("DELETE FROM matching_queue")!.params, ["team-1"]);
    } finally {
      resetBanVerifier();
      resetBanPool();
      resetBanBroadcaster();
    }
  });

  it("does not interrupt an in-progress match", async () => {
    // TC-ADMIN-007 進行中の試合には触らない（12.1）。
    setBanVerifier(adminVerifier);
    setBanBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs());
    setBanPool(db.pool as never);

    try {
      await post(banTeam, validBody);
      assertEquals(db.find("UPDATE matches"), undefined);
      assertEquals(db.find("DELETE FROM matches"), undefined);
    } finally {
      resetBanVerifier();
      resetBanPool();
      resetBanBroadcaster();
    }
  });

  it("treats a repeated ban as a no-op", async () => {
    // TC-ADMIN-010 冪等（06_ErrorCode.md 15章）。既にBAN済みでも OK を返す。
    setBanVerifier(adminVerifier);
    setBanBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs());
    setBanPool(db.pool as never);

    try {
      const res = await post(banTeam, validBody);
      assertEquals(res.status, 200);
      // WHERE に is_banned = FALSE を足すと、2回目が TEAM-001 になってしまう。
      assertEquals(/is_banned = FALSE/.test(db.find("UPDATE teams")!.sql), false);
    } finally {
      resetBanVerifier();
      resetBanPool();
      resetBanBroadcaster();
    }
  });

  it("returns not found for an unknown team", async () => {
    // TC-ADMIN-011
    setBanVerifier(adminVerifier);
    const db = createMockDb(okStubs([["UPDATE teams SET is_banned = TRUE", []]]));
    setBanPool(db.pool as never);

    try {
      const res = await post(banTeam, validBody);
      assertEquals(res.status, 404);
      assertEquals((await res.json()).error.code, "TEAM-001");
    } finally {
      resetBanVerifier();
      resetBanPool();
    }
  });

  it("requires a reason between 1 and 500 characters", async () => {
    // TC-ADMIN-012
    setBanVerifier(adminVerifier);
    try {
      for (const reason of ["", "a".repeat(501)]) {
        const res = await post(banTeam, { teamId: "team-1", reason });
        assertEquals(res.status, 400);
        assertEquals((await res.json()).error.code, "VALIDATION-001");
      }
    } finally {
      resetBanVerifier();
    }
  });

  it("stores the ban reason in the payload", async () => {
    // TC-ADMIN-047 / TC-ADMIN-048 / TC-ADMIN-051
    setBanVerifier(adminVerifier);
    setBanBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs());
    setBanPool(db.pool as never);

    try {
      await post(banTeam, validBody);
      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'TEAM_BANNED'");
      assertEquals(audit.params[0], "admin-1");
      assertEquals(audit.params[2], JSON.stringify({ reason: "不正行為のため" }));
    } finally {
      resetBanVerifier();
      resetBanPool();
      resetBanBroadcaster();
    }
  });

  it("rejects a non-administrator", async () => {
    // TC-ADMIN-002
    setBanVerifier(userVerifier);
    const db = createMockDb(okStubs());
    setBanPool(db.pool as never);

    try {
      const res = await post(banTeam, validBody);
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "ADMIN-001");
      assertEquals(db.executed.length, 0);
    } finally {
      resetBanVerifier();
      resetBanPool();
    }
  });

  it("ignores a role supplied in the request body", async () => {
    // TC-ADMIN-005（3.1） ボディの role を信用してはならない。
    setBanVerifier(userVerifier);
    const db = createMockDb(okStubs());
    setBanPool(db.pool as never);

    try {
      const res = await post(banTeam, { ...validBody, role: "admin", app_metadata: { role: "admin" } });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "ADMIN-001");
    } finally {
      resetBanVerifier();
      resetBanPool();
    }
  });

  it("rejects an unauthenticated request", async () => {
    // TC-ADMIN-003
    setBanVerifier(() => Promise.resolve(null));
    try {
      const res = await post(banTeam, validBody);
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error.code, "AUTH-001");
    } finally {
      resetBanVerifier();
    }
  });
});

describe("admin-unban-team", () => {
  it("lifts the ban", async () => {
    // TC-ADMIN-013 / TC-ADMIN-014（冪等）
    setUnbanVerifier(adminVerifier);
    const sent: { channel: string; event: string }[] = [];
    setUnbanBroadcaster((channel, event) => {
      sent.push({ channel, event });
      return Promise.resolve();
    });
    const db = createMockDb([["UPDATE teams SET is_banned = FALSE", [{ id: "team-1" }]]]);
    setUnbanPool(db.pool as never);

    try {
      const res = await post(unbanTeam, { teamId: "team-1" });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data, { teamId: "team-1", isBanned: false });

      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'TEAM_UNBANNED'");
      assertEquals(sent, [{ channel: "team", event: "TEAM_UPDATED" }]);
    } finally {
      resetUnbanVerifier();
      resetUnbanPool();
      resetUnbanBroadcaster();
    }
  });

  it("rejects a non-administrator", async () => {
    setUnbanVerifier(userVerifier);
    const db = createMockDb();
    setUnbanPool(db.pool as never);

    try {
      const res = await post(unbanTeam, { teamId: "team-1" });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "ADMIN-001");
    } finally {
      resetUnbanVerifier();
      resetUnbanPool();
    }
  });
});

describe("admin-update-system-settings", () => {
  const before = {
    team_max_members: 3,
    initial_rating: 1500,
    rating_k: 32,
    match_rating_range: 400,
    invite_expiration_hours: 24,
    report_timeout_minutes: 60,
    approve_timeout_minutes: 10,
    max_reject_count: 2,
  };

  const okStubs = (
    after: Record<string, number | string | null> = { ...before, rating_k: 64 },
  ): QueryStub[] => [
    ["SELECT team_max_members", [before]],
    ["UPDATE system_settings", [after]],
  ];

  it("updates the K factor", async () => {
    // TC-ADMIN-018 / TC-ADMIN-036
    setSettingsVerifier(adminVerifier);
    const sent: { channel: string; event: string }[] = [];
    setSettingsBroadcaster((channel, event) => {
      sent.push({ channel, event });
      return Promise.resolve();
    });
    const db = createMockDb(okStubs());
    setSettingsPool(db.pool as never);

    try {
      const res = await post(updateSettings, { ratingK: 64 });
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.settings.rating_k, 64);

      const update = db.find("UPDATE system_settings")!;
      assertStringIncludes(update.sql, "rating_k = $1");
      assertEquals(update.params, [64]);
      assertEquals(sent, [{ channel: "system", event: "SYSTEM_SETTINGS_UPDATED" }]);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("updates only the provided fields", async () => {
    // TC-ADMIN-028 指定のない項目をSQLへ含めてはならない。
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs());
    setSettingsPool(db.pool as never);

    try {
      await post(updateSettings, { ratingK: 64 });
      const update = db.find("UPDATE system_settings")!;
      assertEquals(/team_max_members = /.test(update.sql), false);
      assertEquals(/initial_rating = /.test(update.sql), false);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("accepts the K factor boundaries", async () => {
    // TC-ADMIN-031 / TC-ADMIN-033
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs());
    setSettingsPool(db.pool as never);

    try {
      // teamMaxMembers の下限は 1 である。1人チームを許す（Issue #4 / Migration 0017）。
      for (const body of [{ ratingK: 1 }, { ratingK: 128 }, { teamMaxMembers: 1 }]) {
        assertEquals((await post(updateSettings, body)).status, 200);
      }
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("updates the presentation settings", async () => {
    // Issue #8 表示設定。数値と同じ経路で更新できること。
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs({ ...before, site_title: "My Site" }));
    setSettingsPool(db.pool as never);

    try {
      const res = await post(updateSettings, {
        siteTitle: "  My Site  ",
        rulesMarkdown: "# ルール\n\n1. 正直に申告する",
        backgroundImagePath: "bg.png",
      });
      assertEquals(res.status, 200);

      const update = db.find("UPDATE system_settings")!;
      // タイトルとURLは前後の空白を落とす。
      assertEquals(update.params.includes("My Site"), true);
      // ★本文は落とさない。整形の一部でありうる。
      assertEquals(update.params.includes("# ルール\n\n1. 正直に申告する"), true);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("accepts every announcement level", async () => {
    // Issue #7 帯の3種類。値は Migration 0019 の CHECK と一致する。
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());

    try {
      for (const level of ["INFO", "WARN", "ALERT"]) {
        const db = createMockDb(okStubs({ ...before, announcement_level: level }));
        setSettingsPool(db.pool as never);
        const res = await post(updateSettings, { announcementLevel: level });
        assertEquals(res.status, 200);
        assertEquals(db.find("UPDATE system_settings")!.params, [level]);
        resetSettingsPool();
      }
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("allows clearing the announcement text", async () => {
    // Issue #7 空文字は「帯を下げる」操作である。NULL にはしない（列は NOT NULL）。
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs({ ...before, announcement_text: "" }));
    setSettingsPool(db.pool as never);

    try {
      const res = await post(updateSettings, { announcementText: "" });
      assertEquals(res.status, 200);
      assertEquals(db.find("UPDATE system_settings")!.params, [""]);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("clears the background image when an empty string is sent", async () => {
    // Issue #8 背景画像の解除。空文字は NULL を意味する。
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs({ ...before, background_image_path: null }));
    setSettingsPool(db.pool as never);

    try {
      const res = await post(updateSettings, { backgroundImagePath: "" });
      assertEquals(res.status, 200);
      assertEquals(db.find("UPDATE system_settings")!.params, [null]);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("rejects settings outside the database constraints", async () => {
    // TC-ADMIN-029 / 030 / 032 / 034
    // ★ここで通すとDB側のCHECKで落ち、ADMIN-002 ではなく SYSTEM-001 になる。
    setSettingsVerifier(adminVerifier);
    const db = createMockDb(okStubs());
    setSettingsPool(db.pool as never);

    try {
      const invalid = [
        { ratingK: 0 },
        { ratingK: 129 },
        { teamMaxMembers: 0 },
        { initialRating: 99 },
        { maxRejectCount: -1 },
        { matchRatingRange: 0 },
        { ratingK: 32.5 },
        { ratingK: "64" },
        // 表示設定（Issue #8 / Migration 0018）。制約はDBの CHECK と一致させる。
        { siteTitle: "" },
        { siteTitle: "   " },
        { siteTitle: "a".repeat(61) },
        { siteTitle: 1 },
        // ★スキームを絞る。javascript: や data: を背景画像へ渡させない。
        { backgroundImagePath: "javascript:alert(1)" },
        { backgroundImagePath: "data:image/png;base64,AAAA" },
        { backgroundImagePath: "//example.com/a.png" },
        { backgroundImagePath: "../secret.png" },
        { rulesMarkdown: "a".repeat(20001) },
        { rulesMarkdown: 1 },
        // シーズン終了の猶予（Issue #9 / Migration 0021）。DBのCHECK（1〜1440）と一致させる。
        { seasonGraceMinutes: 0 },
        { seasonGraceMinutes: 1441 },
        // お知らせ（Issue #7 / Migration 0019）。
        { announcementText: "a".repeat(201) },
        // ★帯の種類は3つに閉じる。DBのCHECKと一致させる。
        { announcementLevel: "CRITICAL" },
        { announcementLevel: "info" },
        { announcementLevel: 1 },
      ];

      for (const body of invalid) {
        const res = await post(updateSettings, body);
        assertEquals(res.status, 400);
        assertEquals((await res.json()).error.code, "ADMIN-002");
      }
      assertEquals(db.find("UPDATE system_settings"), undefined);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
    }
  });

  it("does not evict existing members when the limit shrinks", async () => {
    // TC-ADMIN-021 設定を変えるだけである。既存メンバーには触らない（12.3）。
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs({ ...before, team_max_members: 3 }));
    setSettingsPool(db.pool as never);

    try {
      assertEquals((await post(updateSettings, { teamMaxMembers: 3 })).status, 200);
      assertEquals(db.find("DELETE FROM team_members"), undefined);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("records the setting change with before and after", async () => {
    // TC-ADMIN-049
    setSettingsVerifier(adminVerifier);
    setSettingsBroadcaster(() => Promise.resolve());
    const db = createMockDb(okStubs());
    setSettingsPool(db.pool as never);

    try {
      await post(updateSettings, { ratingK: 64 });
      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'SETTINGS_UPDATED'");

      const payload = JSON.parse(audit.params[1] as string);
      assertEquals(payload.before.rating_k, 32);
      assertEquals(payload.after.rating_k, 64);
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
      resetSettingsBroadcaster();
    }
  });

  it("rejects a non-administrator", async () => {
    setSettingsVerifier(userVerifier);
    const db = createMockDb(okStubs());
    setSettingsPool(db.pool as never);

    try {
      const res = await post(updateSettings, { ratingK: 64 });
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "ADMIN-001");
    } finally {
      resetSettingsVerifier();
      resetSettingsPool();
    }
  });
});
