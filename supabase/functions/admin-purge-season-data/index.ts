// ===== supabase/functions/admin-purge-season-data/index.ts =====
// 戦績・ログの削除と総解散（Issue #9 / 04_BackendInterface.md 12.8）。
//
// ★取り消せない。持ち出しの記録（season_exports）が無ければ拒否する（SEASON-005）。
//   押し間違いで戦績が消えるのを防ぐ安全弁である。
//
// ★総解散をここで行う。Issue の並びでは退避の直後だったが、
//   matches.team_a_id は ON DELETE RESTRICT であり、戦績が残っている限り
//   チームを削除できない。先に消すと持ち出す戦績が無くなるため、削除の後ろへ回した。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface PurgeResponse {
  season: number;
  deletedMatches: number;
  deletedRatingHistory: number;
  deletedLogs: number;
  disbandedTeams: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }
    if (!isAdmin(claims)) {
      return businessError("ADMIN-001", "Administrator role required.", 403);
    }

    const result = await withTransaction<PurgeResponse>(async (tx) => {
      const settings = await tx.queryObject<{ current_season: number }>(
        `SELECT current_season FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const target = settings.rows[0].current_season - 1;

      const season = await tx.queryObject<{
        status: string;
        disband_active_teams: boolean;
        disband_banned_teams: boolean;
      }>(
        `SELECT status, disband_active_teams, disband_banned_teams
           FROM seasons WHERE number = $1 FOR UPDATE`,
        [target],
      );

      if (season.rows.length === 0 || season.rows[0].status !== "FINALIZED") {
        throw businessError("SEASON-003", "No finalized season to purge.", 409);
      }

      // ★持ち出し済みであることを確かめる。両方が要る。
      //   片方だけで消せると、確かめていない側が黙って失われる。
      const exported = await tx.queryObject<{ kind: string }>(
        `SELECT DISTINCT kind FROM season_exports WHERE season_number = $1`,
        [target],
      );

      const kinds = exported.rows.map((r) => r.kind);
      if (!kinds.includes("MATCHES") || !kinds.includes("LOGS")) {
        throw businessError("SEASON-005", "Export the season data before deleting it.", 409);
      }

      // ---- 戦績 ----
      // rating_history.match_id は RESTRICT である。先に子から消す。
      const history = await tx.queryObject<{ id: string }>(
        `DELETE FROM rating_history RETURNING id`,
      );
      const matches = await tx.queryObject<{ id: string }>(`DELETE FROM matches RETURNING id`);

      // ---- ログ ----
      const logs = await tx.queryObject<{ id: string }>(`DELETE FROM audit_logs RETURNING id`);

      // ---- 総解散（オプション）----
      //
      // ★選択は終了操作の時点で決まっている（seasons）。ここで再入力させない。
      //   猶予を挟むため、押した人と確定を見る人が同じとは限らない。
      const { disband_active_teams, disband_banned_teams } = season.rows[0];
      let disbanded = 0;

      if (disband_active_teams || disband_banned_teams) {
        const conditions: string[] = [];
        if (disband_active_teams) conditions.push("is_banned = FALSE");
        if (disband_banned_teams) conditions.push("is_banned = TRUE");
        const where = conditions.join(" OR ");

        // team_members / team_invites は teams に対して RESTRICT である。先に消す。
        await tx.queryObject(
          `DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE ${where})`,
        );
        await tx.queryObject(
          `DELETE FROM team_invites WHERE team_id IN (SELECT id FROM teams WHERE ${where})`,
        );
        const removed = await tx.queryObject<{ id: string }>(
          `DELETE FROM teams WHERE ${where} RETURNING id`,
        );
        disbanded = removed.rows.length;
      }

      // ★削除そのものは記録に残す。直前に audit_logs を空にしているため、
      //   この1件だけが残る。何が消えたのかを後から確かめられるようにする。
      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'SEASON_DATA_PURGED', 'SETTINGS', $2, $3)`,
        [
          claims.sub,
          String(target),
          JSON.stringify({
            deletedMatches: matches.rows.length,
            deletedRatingHistory: history.rows.length,
            deletedLogs: logs.rows.length,
            disbandedTeams: disbanded,
          }),
        ],
      );

      return {
        season: target,
        deletedMatches: matches.rows.length,
        deletedRatingHistory: history.rows.length,
        deletedLogs: logs.rows.length,
        disbandedTeams: disbanded,
      };
    });

    await broadcast("ranking", "RANKING_UPDATED", {});

    return ok(result);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setJwtVerifier, resetJwtVerifier } from "../_shared/auth.ts";
export { setBroadcaster, resetBroadcaster } from "../_shared/realtime.ts";

if (import.meta.main) {
  Deno.serve(withCors(handler));
}
