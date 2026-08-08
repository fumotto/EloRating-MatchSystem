// ===== supabase/functions/admin-ban-team/index.ts =====
// チームのBAN（04_BackendInterface.md 12.1）。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface AdminBanTeamResponse {
  teamId: string;
  isBanned: true;
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
    const { teamId, reason } = body as { teamId?: unknown; reason?: unknown };

    if (typeof teamId !== "string" || typeof reason !== "string") {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }
    // 長さ違反も VALIDATION-001 とする。create-team の名前長（VALIDATION-003）とは
    // 扱いが異なるが、04 12.1 のエラーコード一覧と TC-ADMIN-012 がこちらを指定している。
    if (reason.length < 1 || reason.length > 500) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<AdminBanTeamResponse>(async (tx) => {
      // 既にBAN済みでも成功として扱う（06_ErrorCode.md 15章の冪等な操作）。
      const updated = await tx.queryObject<{ id: string }>(
        `UPDATE teams SET is_banned = TRUE WHERE id = $1 RETURNING id`,
        [teamId],
      );

      if (updated.rows.length === 0) {
        throw businessError("TEAM-001", "Team not found.", 404);
      }

      // 待機中のまま残すとBANチームがマッチしうる。
      await tx.queryObject(`DELETE FROM matching_queue WHERE team_id = $1`, [teamId]);

      // 進行中の試合は中断しない。試合終了後にBANの効果が現れる（12.1）。
      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'TEAM_BANNED', 'TEAM', $2, $3)`,
        [claims.sub, teamId, JSON.stringify({ reason })],
      );

      return { teamId, isBanned: true as const };
    });

    await broadcast("team", "TEAM_UPDATED", { teamId: result.teamId });

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
  Deno.serve(handler);
}
