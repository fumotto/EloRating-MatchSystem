// シーズンリセット（Issue #9）。
//
// ★取り消せない操作を含む。順序と安全弁を固定する。
import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  handler as endSeason,
  setDbPool as setEndPool,
  resetDbPool as resetEndPool,
  setJwtVerifier as setEndVerifier,
  resetJwtVerifier as resetEndVerifier,
  setBroadcaster as setEndBroadcaster,
  resetBroadcaster as resetEndBroadcaster,
} from "../../supabase/functions/admin-end-season/index.ts";
import {
  handler as finalizeSeason,
  setDbPool as setFinalizePool,
  resetDbPool as resetFinalizePool,
  setBroadcaster as setFinalizeBroadcaster,
  resetBroadcaster as resetFinalizeBroadcaster,
} from "../../supabase/functions/finalize-season/index.ts";
import {
  handler as exportData,
  setDbPool as setExportPool,
  resetDbPool as resetExportPool,
  setJwtVerifier as setExportVerifier,
  resetJwtVerifier as resetExportVerifier,
} from "../../supabase/functions/admin-export-season-data/index.ts";
import {
  handler as purgeData,
  setDbPool as setPurgePool,
  resetDbPool as resetPurgePool,
  setJwtVerifier as setPurgeVerifier,
  resetJwtVerifier as resetPurgeVerifier,
  setBroadcaster as setPurgeBroadcaster,
  resetBroadcaster as resetPurgeBroadcaster,
} from "../../supabase/functions/admin-purge-season-data/index.ts";
import {
  handler as cancelEnd,
  setDbPool as setCancelPool,
  resetDbPool as resetCancelPool,
  setJwtVerifier as setCancelVerifier,
  resetJwtVerifier as resetCancelVerifier,
  setBroadcaster as setCancelBroadcaster,
  resetBroadcaster as resetCancelBroadcaster,
} from "../../supabase/functions/admin-cancel-season-end/index.ts";
import {
  handler as resumeSeason,
  setDbPool as setResumePool,
  resetDbPool as resetResumePool,
  setJwtVerifier as setResumeVerifier,
  resetJwtVerifier as resetResumeVerifier,
  setBroadcaster as setResumeBroadcaster,
  resetBroadcaster as resetResumeBroadcaster,
} from "../../supabase/functions/admin-resume-season/index.ts";
import {
  handler as leaveTeam,
  setDbPool as setLeavePool,
  resetDbPool as resetLeavePool,
  setJwtVerifier as setLeaveVerifier,
  resetJwtVerifier as resetLeaveVerifier,
  setBroadcaster as setLeaveBroadcaster,
  resetBroadcaster as resetLeaveBroadcaster,
} from "../../supabase/functions/leave-team/index.ts";
import { createMockDb, type QueryStub } from "../mocks/db.ts";

const URL_FN = "http://localhost:8000";
const AUTH_HEADERS = {
  "Authorization": "Bearer test-token",
  "Content-Type": "application/json",
};

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

function post(body: unknown = {}) {
  return new Request(URL_FN, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(body),
  });
}

describe("season", () => {
  it("pauses matchmaking and clears the queue when the season ends", async () => {
    // TC-SEASON-001
    const db = createMockDb([
      ["FROM system_settings LIMIT 1", [{ current_season: 3, season_grace_minutes: 10 }]],
      ["SELECT status", [{ status: "ACTIVE" }]],
      ["RETURNING grace_until", [{ grace_until: new Date("2026-08-17T00:10:00Z") }]],
      ["COUNT(*)::int AS count FROM matches", [{ count: 2 }]],
    ]);
    setEndPool(db.pool as never);
    setEndVerifier(adminVerifier);
    setEndBroadcaster(() => Promise.resolve());
    try {
      const res = await endSeason(post());
      assertEquals(res.status, 200);

      // ★受付を閉じ、待機列を空にする。残すと再開時に突然マッチする。
      assertEquals(db.find("matchmaking_paused = TRUE") !== undefined, true);
      assertEquals(db.find("DELETE FROM matching_queue") !== undefined, true);

      // ★この時点では更新を止めない。進行中の試合を決着させたいためである。
      assertEquals(db.find("updates_locked = TRUE"), undefined);
      assertEquals(db.committed(), true);
    } finally {
      resetEndPool();
      resetEndVerifier();
      resetEndBroadcaster();
    }
  });

  it("refuses to end a season that is not active", async () => {
    // TC-SEASON-002
    const db = createMockDb([
      ["FROM system_settings LIMIT 1", [{ current_season: 3, season_grace_minutes: 10 }]],
      ["SELECT status", [{ status: "ENDING" }]],
    ]);
    setEndPool(db.pool as never);
    setEndVerifier(adminVerifier);
    setEndBroadcaster(() => Promise.resolve());
    try {
      const res = await endSeason(post());
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "SEASON-003");
      assertEquals(db.rolledBack(), true);
    } finally {
      resetEndPool();
      resetEndVerifier();
      resetEndBroadcaster();
    }
  });

  it("rejects a non-administrator", async () => {
    // TC-SEASON-003
    const db = createMockDb([]);
    setEndPool(db.pool as never);
    setEndVerifier(userVerifier);
    setEndBroadcaster(() => Promise.resolve());
    try {
      const res = await endSeason(post());
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "ADMIN-001");
    } finally {
      resetEndPool();
      resetEndVerifier();
      resetEndBroadcaster();
    }
  });

  it("does nothing while the grace period is still running", async () => {
    // TC-SEASON-004
    // ★猶予中に確定すると、決着しかけた試合を引き分けで潰す。
    const future = new Date(Date.now() + 5 * 60 * 1000);
    const db = createMockDb([
      ["FROM seasons\n          WHERE status = 'ENDING'", [{ number: 3, grace_until: future }]],
    ]);
    setFinalizePool(db.pool as never);
    setFinalizeBroadcaster(() => Promise.resolve());
    try {
      const res = await finalizeSeason(new Request(URL_FN, { method: "POST" }));
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.finalized, false);

      assertEquals(db.find("SET status = 'DRAWN'"), undefined);
      assertEquals(db.find("INSERT INTO season_rankings"), undefined);
    } finally {
      resetFinalizePool();
      resetFinalizeBroadcaster();
    }
  });

  const finalizeStubs: QueryStub[] = [
    [
      "FROM seasons\n          WHERE status = 'ENDING'",
      [{ number: 3, grace_until: new Date(Date.now() - 60 * 1000) }],
    ],
    ["SET status = 'DRAWN'", [{ id: "match-1" }]],
    ["COUNT(*)::int AS count FROM season_rankings", [{ count: 4 }]],
    ["SELECT initial_rating FROM system_settings", [{ initial_rating: 1500 }]],
    ["UPDATE teams SET rating", [{ id: "team-1" }, { id: "team-2" }]],
  ];

  it("finalizes the season once the grace period has passed", async () => {
    // TC-SEASON-005
    const db = createMockDb(finalizeStubs);
    setFinalizePool(db.pool as never);
    setFinalizeBroadcaster(() => Promise.resolve());
    try {
      const res = await finalizeSeason(new Request(URL_FN, { method: "POST" }));
      assertEquals(res.status, 200);

      const body = await res.json();
      assertEquals(body.data.finalized, true);
      assertEquals(body.data.season, 3);
      assertEquals(body.data.nextSeason, 4);

      // 残った試合を引き分けにする
      const cutoff = db.find("SET status = 'DRAWN'")!;
      // ★理由を必ず設定する（ADR-038 ①）。設定しないと chk_matches_drawn_reason に
      //   違反し、シーズンが確定できない。実際にその状態だった。
      assertStringIncludes(cutoff.sql, "no_contest_reason = 'SEASON_END'");
      // ★ADMIN_VOID を流用しない。管理者が個別に無効化したのではない。
      assertEquals(/ADMIN_VOID/.test(cutoff.sql), false);
      // 退避する前に更新を止める
      assertEquals(db.find("updates_locked = TRUE") !== undefined, true);
      // ランキングと編成を退避する
      assertEquals(db.find("INSERT INTO season_rankings") !== undefined, true);
      assertEquals(db.find("INSERT INTO season_members") !== undefined, true);
      // 招待を消し、レートを戻し、番号を進める
      assertEquals(db.find("DELETE FROM team_invites") !== undefined, true);
      assertEquals(db.find("UPDATE teams SET rating") !== undefined, true);
      assertEquals(db.find("INSERT INTO seasons") !== undefined, true);
      assertEquals(db.committed(), true);
    } finally {
      resetFinalizePool();
      resetFinalizeBroadcaster();
    }
  });

  it("locks user updates before taking the snapshot", async () => {
    // TC-SEASON-006
    // ★順序が要点である。退避の後にレートが動くと、
    //   シーズン別ランキングはどの瞬間でもない値を記録する。
    const db = createMockDb(finalizeStubs);
    setFinalizePool(db.pool as never);
    setFinalizeBroadcaster(() => Promise.resolve());
    try {
      await finalizeSeason(new Request(URL_FN, { method: "POST" }));

      const lock = db.executed.findIndex((q) => q.sql.includes("updates_locked = TRUE"));
      const snapshot = db.executed.findIndex((q) => q.sql.includes("INSERT INTO season_rankings"));
      const reset = db.executed.findIndex((q) => q.sql.includes("UPDATE teams SET rating"));

      assertEquals(lock < snapshot, true);
      assertEquals(snapshot < reset, true);
    } finally {
      resetFinalizePool();
      resetFinalizeBroadcaster();
    }
  });

  it("keeps personal identifiers out of the exported match data", async () => {
    // TC-SEASON-007
    // ★持ち出したファイルは本システムの管理下から出る。
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
      ["SELECT status FROM seasons", [{ status: "FINALIZED" }]],
      ["FROM matches m", [{ id: "match-1" }]],
    ]);
    setExportPool(db.pool as never);
    setExportVerifier(adminVerifier);
    try {
      const res = await exportData(post({ kind: "MATCHES" }));
      assertEquals(res.status, 200);

      const select = db.find("FROM matches m");
      if (!select) throw new Error("戦績の取得が発行されていない");
      assertEquals(select.sql.includes("reported_by_profile_id"), false);
      assertEquals(select.sql.includes("approved_by_profile_id"), false);

      // 持ち出しを記録する。削除の安全弁として使う。
      assertEquals(db.find("INSERT INTO season_exports") !== undefined, true);
    } finally {
      resetExportPool();
      resetExportVerifier();
    }
  });

  it("keeps actor identifiers and payloads out of the exported logs", async () => {
    // TC-SEASON-008
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
      ["SELECT status FROM seasons", [{ status: "FINALIZED" }]],
      ["FROM audit_logs", [{ id: "log-1" }]],
    ]);
    setExportPool(db.pool as never);
    setExportVerifier(adminVerifier);
    try {
      await exportData(post({ kind: "LOGS" }));

      const select = db.find("FROM audit_logs");
      if (!select) throw new Error("ログの取得が発行されていない");
      assertEquals(select.sql.includes("actor_profile_id"), false);
      assertEquals(select.sql.includes("payload"), false);
    } finally {
      resetExportPool();
      resetExportVerifier();
    }
  });

  it("refuses to delete data that has not been exported", async () => {
    // TC-SEASON-009
    // ★取り消せない。押し間違いで戦績が消えるのを防ぐ。
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
      [
        "SELECT status, disband_active_teams",
        [{ status: "FINALIZED", disband_active_teams: false, disband_banned_teams: false }],
      ],
      ["SELECT DISTINCT kind FROM season_exports", [{ kind: "MATCHES" }]],
    ]);
    setPurgePool(db.pool as never);
    setPurgeVerifier(adminVerifier);
    setPurgeBroadcaster(() => Promise.resolve());
    try {
      const res = await purgeData(post());
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "SEASON-005");

      assertEquals(db.find("DELETE FROM matches"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      resetPurgePool();
      resetPurgeVerifier();
      resetPurgeBroadcaster();
    }
  });

  it("deletes the season data after both exports exist", async () => {
    // TC-SEASON-010
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
      [
        "SELECT status, disband_active_teams",
        [{ status: "FINALIZED", disband_active_teams: false, disband_banned_teams: false }],
      ],
      ["SELECT DISTINCT kind FROM season_exports", [{ kind: "MATCHES" }, { kind: "LOGS" }]],
      ["DELETE FROM rating_history", [{ id: "rh-1" }]],
      ["DELETE FROM matches", [{ id: "match-1" }]],
      ["DELETE FROM audit_logs", [{ id: "log-1" }]],
    ]);
    setPurgePool(db.pool as never);
    setPurgeVerifier(adminVerifier);
    setPurgeBroadcaster(() => Promise.resolve());
    try {
      const res = await purgeData(post());
      assertEquals(res.status, 200);

      // ★子から先に消す。rating_history.match_id は RESTRICT である。
      const history = db.executed.findIndex((q) => q.sql.includes("DELETE FROM rating_history"));
      const matches = db.executed.findIndex((q) => q.sql.includes("DELETE FROM matches"));
      assertEquals(history < matches, true);

      // 削除そのものは記録に残す
      assertEquals(db.find("SEASON_DATA_PURGED") !== undefined, true);
      assertEquals(db.committed(), true);
    } finally {
      resetPurgePool();
      resetPurgeVerifier();
      resetPurgeBroadcaster();
    }
  });

  it("disbands teams only after the match data is gone", async () => {
    // TC-SEASON-011
    // ★matches.team_a_id は ON DELETE RESTRICT である。
    //   戦績が残っている間はチームを削除できない。
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
      [
        "SELECT status, disband_active_teams",
        [{ status: "FINALIZED", disband_active_teams: true, disband_banned_teams: false }],
      ],
      ["SELECT DISTINCT kind FROM season_exports", [{ kind: "MATCHES" }, { kind: "LOGS" }]],
      ["DELETE FROM teams", [{ id: "team-1" }]],
    ]);
    setPurgePool(db.pool as never);
    setPurgeVerifier(adminVerifier);
    setPurgeBroadcaster(() => Promise.resolve());
    try {
      const res = await purgeData(post());
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.disbandedTeams, 1);

      const matches = db.executed.findIndex((q) => q.sql.includes("DELETE FROM matches"));
      const members = db.executed.findIndex((q) => q.sql.includes("DELETE FROM team_members"));
      const teams = db.executed.findIndex((q) => q.sql.includes("DELETE FROM teams"));

      assertEquals(matches < members, true);
      assertEquals(members < teams, true);

      // BANチームは対象外である
      const removal = db.find("DELETE FROM teams");
      assertEquals(removal?.sql.includes("is_banned = FALSE"), true);
      assertEquals(removal?.sql.includes("is_banned = TRUE"), false);
    } finally {
      resetPurgePool();
      resetPurgeVerifier();
      resetPurgeBroadcaster();
    }
  });

  it("blocks user updates while the season change is in progress", async () => {
    // TC-SEASON-012
    // ★確定の最中に編成が動くと、退避した内容と実データが食い違う。
    const db = createMockDb([["SELECT updates_locked", [{ updates_locked: true }]]]);
    setLeavePool(db.pool as never);
    setLeaveVerifier(userVerifier);
    setLeaveBroadcaster(() => Promise.resolve());
    try {
      const res = await leaveTeam(post());
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "SEASON-001");

      assertEquals(db.find("DELETE FROM team_members"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      resetLeavePool();
      resetLeaveVerifier();
      resetLeaveBroadcaster();
    }
  });

  it("cancels the season end while the grace period is running", async () => {
    // TC-SEASON-013
    // ★確定前なら引き返せる。押し間違いに気付いた管理者が待つしかない状態にしない。
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 3 }]],
      ["SELECT status FROM seasons", [{ status: "ENDING" }]],
    ]);
    setCancelPool(db.pool as never);
    setCancelVerifier(adminVerifier);
    setCancelBroadcaster(() => Promise.resolve());
    try {
      const res = await cancelEnd(post());
      assertEquals(res.status, 200);

      assertEquals(db.find("SET status = 'ACTIVE'") !== undefined, true);
      assertEquals(db.find("matchmaking_paused = FALSE") !== undefined, true);
      assertEquals(db.committed(), true);
    } finally {
      resetCancelPool();
      resetCancelVerifier();
      resetCancelBroadcaster();
    }
  });

  it("refuses to cancel after the season is finalized", async () => {
    // TC-SEASON-014
    // ★退避もレートリセットも済んでおり、戻す先が無い。
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
      ["SELECT status FROM seasons", [{ status: "ACTIVE" }]],
    ]);
    setCancelPool(db.pool as never);
    setCancelVerifier(adminVerifier);
    setCancelBroadcaster(() => Promise.resolve());
    try {
      const res = await cancelEnd(post());
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "SEASON-003");
      assertEquals(db.rolledBack(), true);
    } finally {
      resetCancelPool();
      resetCancelVerifier();
      resetCancelBroadcaster();
    }
  });
});

// 通常営業への復帰（Issue #9 / ADR-034 ⑤ / ADR-038 ③）。
//
// ★本Functionにはテストが1件も無かった。「再開が保守停止を解除しない」という
//   ADR-034 ⑤ の存在理由そのものが未検証で、誰かが「停止フラグをまとめてリセット」と
//   整理すれば黙って壊れる状態だった。
describe("admin-resume-season", () => {
  const readyStubs: QueryStub[] = [
    ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
    ["SELECT status FROM seasons", [{ status: "ACTIVE" }]],
  ];

  it("clears the season pause and the update lock together", async () => {
    // TC-SEASON-020
    // ★片方だけ戻すと、編成は変えられるのに対戦できない状態が残る。
    const db = createMockDb(readyStubs);
    setResumePool(db.pool as never);
    setResumeVerifier(adminVerifier);
    setResumeBroadcaster(() => Promise.resolve());
    try {
      const res = await resumeSeason(post());
      assertEquals(res.status, 200);
      assertEquals((await res.json()).data.season, 4);

      const update = db.find("UPDATE system_settings SET matchmaking_paused")!;
      assertStringIncludes(update.sql, "matchmaking_paused = FALSE");
      assertStringIncludes(update.sql, "updates_locked = FALSE");
      assertEquals(db.committed(), true);
    } finally {
      resetResumePool();
      resetResumeVerifier();
      resetResumeBroadcaster();
    }
  });

  it("never clears the maintenance pause", async () => {
    // TC-SEASON-021
    // ★これが maintenance_paused を別列にした理由そのものである（ADR-034 ⑤）。
    //   兼用していれば、シーズンの再開が障害対応の停止を解除してしまう。
    //   ゲーム側が復旧していないのにマッチングが動き出す。
    const db = createMockDb(readyStubs);
    setResumePool(db.pool as never);
    setResumeVerifier(adminVerifier);
    setResumeBroadcaster(() => Promise.resolve());
    try {
      await resumeSeason(post());

      for (const query of db.executed) {
        assertEquals(/maintenance_paused/.test(query.sql), false);
      }
    } finally {
      resetResumePool();
      resetResumeVerifier();
      resetResumeBroadcaster();
    }
  });

  it("records the resume in the audit log", async () => {
    // TC-SEASON-022
    const db = createMockDb(readyStubs);
    setResumePool(db.pool as never);
    setResumeVerifier(adminVerifier);
    setResumeBroadcaster(() => Promise.resolve());
    try {
      await resumeSeason(post());
      const audit = db.find("INSERT INTO audit_logs")!;
      assertStringIncludes(audit.sql, "'SEASON_RESUMED'");
      assertEquals(audit.params[0], "admin-1");
    } finally {
      resetResumePool();
      resetResumeVerifier();
      resetResumeBroadcaster();
    }
  });

  it("refuses to resume while the season is still ending", async () => {
    // TC-SEASON-023
    // ★猶予中に解除すると、止めたはずのマッチングが動き出す。
    const db = createMockDb([
      ["SELECT current_season FROM system_settings", [{ current_season: 4 }]],
      ["SELECT status FROM seasons", [{ status: "ENDING" }]],
    ]);
    setResumePool(db.pool as never);
    setResumeVerifier(adminVerifier);
    setResumeBroadcaster(() => Promise.resolve());
    try {
      const res = await resumeSeason(post());
      assertEquals(res.status, 409);
      assertEquals((await res.json()).error.code, "SEASON-003");
      assertEquals(db.find("UPDATE system_settings"), undefined);
      assertEquals(db.rolledBack(), true);
    } finally {
      resetResumePool();
      resetResumeVerifier();
      resetResumeBroadcaster();
    }
  });

  it("rejects a non-administrator", async () => {
    // TC-SEASON-024
    const db = createMockDb(readyStubs);
    setResumePool(db.pool as never);
    setResumeVerifier(userVerifier);
    try {
      const res = await resumeSeason(post());
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, "ADMIN-001");
      assertEquals(db.executed.length, 0);
    } finally {
      resetResumePool();
      resetResumeVerifier();
    }
  });
});
