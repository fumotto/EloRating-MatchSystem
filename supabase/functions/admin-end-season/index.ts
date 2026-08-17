// ===== supabase/functions/admin-end-season/index.ts =====
// シーズン終了の開始（Issue #9 / 04_BackendInterface.md 12.6）。
//
// ★ここでは止めるだけである。マッチングの受付を閉じ、猶予を開始する。
//   進行中の試合はそのまま申告・承認できる。対戦相手を巻き添えにしないためであり、
//   BAN が試合を中断しないのと同じ考え方である（12.1）。
//
// ★確定は finalize-season（cron）が行う。猶予は数分から数十分に及び、
//   Edge Function の実行時間では待てない。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface EndSeasonResponse {
  season: number;
  graceUntil: string;
  activeMatches: number;
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

    const body = await req.json().catch(() => ({}));
    const { disbandActiveTeams, disbandBannedTeams } = body as {
      disbandActiveTeams?: unknown;
      disbandBannedTeams?: unknown;
    };

    if (
      (disbandActiveTeams !== undefined && typeof disbandActiveTeams !== "boolean") ||
      (disbandBannedTeams !== undefined && typeof disbandBannedTeams !== "boolean")
    ) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<EndSeasonResponse>(async (tx) => {
      const settings = await tx.queryObject<{
        current_season: number;
        season_grace_minutes: number;
      }>(`SELECT current_season, season_grace_minutes FROM system_settings LIMIT 1`);

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const { current_season, season_grace_minutes } = settings.rows[0];

      // ★ACTIVE のときだけ開始できる。二重に押されても猶予が延びないようにする。
      const season = await tx.queryObject<{ status: string }>(
        `SELECT status FROM seasons WHERE number = $1 FOR UPDATE`,
        [current_season],
      );

      if (season.rows.length === 0 || season.rows[0].status !== "ACTIVE") {
        throw businessError("SEASON-003", "The season is not active.", 409);
      }

      const updated = await tx.queryObject<{ grace_until: Date }>(
        `UPDATE seasons
            SET status = 'ENDING',
                grace_until = NOW() + ($2 || ' minutes')::INTERVAL,
                disband_active_teams = $3,
                disband_banned_teams = $4
          WHERE number = $1
        RETURNING grace_until`,
        [
          current_season,
          String(season_grace_minutes),
          disbandActiveTeams === true,
          disbandBannedTeams === true,
        ],
      );

      // マッチングの受付を閉じる。待機列も空にする。
      // ★残したままだと、再開時に猶予前の待機が突然マッチする。
      await tx.queryObject(`UPDATE system_settings SET matchmaking_paused = TRUE`);
      await tx.queryObject(`DELETE FROM matching_queue`);

      const active = await tx.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM matches WHERE status NOT IN ('COMPLETED', 'DRAWN')`,
      );

      // target_type は audit_logs のCHECK制約に従う。運用設定の変更として 'SETTINGS' を使う。
      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'SEASON_END_STARTED', 'SETTINGS', $2, $3)`,
        [
          claims.sub,
          String(current_season),
          JSON.stringify({
            graceMinutes: season_grace_minutes,
            disbandActiveTeams: disbandActiveTeams === true,
            disbandBannedTeams: disbandBannedTeams === true,
            activeMatches: active.rows[0].count,
          }),
        ],
      );

      return {
        season: current_season,
        graceUntil: updated.rows[0].grace_until.toISOString(),
        activeMatches: active.rows[0].count,
      };
    });

    await broadcast("system", "SEASON_STATE_CHANGED", { season: result.season, status: "ENDING" });

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
