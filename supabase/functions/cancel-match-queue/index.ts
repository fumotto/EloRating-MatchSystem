// ===== supabase/functions/cancel-match-queue/index.ts =====
// マッチング待機のキャンセル（04_BackendInterface.md 10.2 / 09 9章）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface CancelMatchQueueResponse {
  teamId: string;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { teamId } = body as { teamId?: unknown };

    if (typeof teamId !== "string" || teamId.length === 0) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<CancelMatchQueueResponse>(async (tx) => {
      const membership = await tx.queryObject<{ role: string }>(
        `SELECT role FROM team_members WHERE profile_id = $1 AND team_id = $2`,
        [claims.sub, teamId],
      );

      if (membership.rows.length === 0 || membership.rows[0].role !== "LEADER") {
        throw businessError("TEAM-005", "Team leader only.", 403);
      }

      // 削除できたかどうかで待機中を判定する。SELECT してから DELETE すると、
      // その間にマッチが成立して「待機中でないのに成功」を返しうる。
      const deleted = await tx.queryObject<{ team_id: string }>(
        `DELETE FROM matching_queue WHERE team_id = $1 RETURNING team_id`,
        [teamId],
      );

      // マッチ成立後は成立時点でキューから消えているため QUEUE-004 となる（09 9章）。
      if (deleted.rows.length === 0) {
        throw businessError("QUEUE-004", "Not queued.", 409);
      }

      return { teamId };
    });

    // キュー解除ではRealtime通知を送らない（09 11章）。
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

if (import.meta.main) {
  Deno.serve(handler);
}
