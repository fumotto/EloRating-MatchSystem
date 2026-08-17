// ===== supabase/functions/admin-resume-season/index.ts =====
// 通常営業への復帰（Issue #9 / 04_BackendInterface.md 12.9）。
//
// ★禁止の解除とマッチングの再開は同時に行う。片方だけ戻すと、
//   編成は変えられるのに対戦できない、あるいはその逆という状態が残る。
//
// ★確定の直後には自動で戻さない。持ち出しと削除は管理者が任意の時間をかけて行う。
//   その間に利用者がレートを動かすと、削除の対象が動いてしまう。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface ResumeResponse {
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

    const result = await withTransaction<ResumeResponse>(async (tx) => {
      const settings = await tx.queryObject<{ current_season: number }>(
        `SELECT current_season FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const current = settings.rows[0].current_season;

      // ★確定が済んでいなければ再開させない。猶予中に解除すると、
      //   止めたはずのマッチングが動き出す。
      const season = await tx.queryObject<{ status: string }>(
        `SELECT status FROM seasons WHERE number = $1`,
        [current],
      );

      if (season.rows.length === 0 || season.rows[0].status !== "ACTIVE") {
        throw businessError("SEASON-003", "The season is not ready to resume.", 409);
      }

      await tx.queryObject(
        `UPDATE system_settings SET matchmaking_paused = FALSE, updates_locked = FALSE`,
      );

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id)
         VALUES ($1, 'SEASON_RESUMED', 'SETTINGS', $2)`,
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
