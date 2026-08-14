// ===== supabase/functions/admin-unban-team/index.ts =====
// BANの解除（04_BackendInterface.md 12.2）。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface AdminUnbanTeamResponse {
  teamId: string;
  isBanned: false;
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
    const { teamId } = body as { teamId?: unknown };

    if (typeof teamId !== "string" || teamId.length === 0) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<AdminUnbanTeamResponse>(async (tx) => {
      // BANされていないチームへの解除も成功とする（冪等 / 06_ErrorCode.md 15章）。
      const updated = await tx.queryObject<{ id: string }>(
        `UPDATE teams SET is_banned = FALSE WHERE id = $1 RETURNING id`,
        [teamId],
      );

      if (updated.rows.length === 0) {
        throw businessError("TEAM-001", "Team not found.", 404);
      }

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id)
         VALUES ($1, 'TEAM_UNBANNED', 'TEAM', $2)`,
        [claims.sub, teamId],
      );

      return { teamId, isBanned: false as const };
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
  Deno.serve(withCors(handler));
}
