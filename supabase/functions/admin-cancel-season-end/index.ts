// ===== supabase/functions/admin-cancel-season-end/index.ts =====
// シーズン終了の取りやめ（Issue #9 / 04_BackendInterface.md 12.11）。
//
// ★猶予中に限り引き返せるようにする。終了の開始は取り消せない前提の操作に見えるが、
//   実際に消えるものは確定まで何も無い。押し間違いに気付いた管理者が
//   確定を待つしかない状態は、運用上の袋小路である。
//
// ★確定後は取りやめられない。退避もレートリセットも済んでおり、
//   戻す先が無い。ENDING のときだけ受け付ける。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface CancelSeasonEndResponse {
  season: number;
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

    const result = await withTransaction<CancelSeasonEndResponse>(async (tx) => {
      const settings = await tx.queryObject<{ current_season: number }>(
        `SELECT current_season FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const current = settings.rows[0].current_season;

      // ★確定と競合しないよう行を取る。cron が同時に確定へ進むことがある。
      const season = await tx.queryObject<{ status: string }>(
        `SELECT status FROM seasons WHERE number = $1 FOR UPDATE`,
        [current],
      );

      if (season.rows.length === 0 || season.rows[0].status !== "ENDING") {
        throw businessError("SEASON-003", "The season is not ending.", 409);
      }

      await tx.queryObject(
        `UPDATE seasons
            SET status = 'ACTIVE',
                grace_until = NULL,
                disband_active_teams = FALSE,
                disband_banned_teams = FALSE
          WHERE number = $1`,
        [current],
      );

      // ★待機列は戻さない。終了の開始時に消しており、誰がいつから待っていたかは残っていない。
      //   利用者に押し直してもらう。
      await tx.queryObject(`UPDATE system_settings SET matchmaking_paused = FALSE`);

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id)
         VALUES ($1, 'SEASON_END_CANCELLED', 'SETTINGS', $2)`,
        [claims.sub, String(current)],
      );

      return { season: current };
    });

    await broadcast("system", "SEASON_STATE_CHANGED", {
      season: result.season,
      status: "ACTIVE",
    });

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
