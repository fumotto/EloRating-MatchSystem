// ===== supabase/functions/withdraw-abuse-report/index.ts =====
// 通報の取り下げ（04_BackendInterface.md 20.2 / ADR-033）。
//
// ★取り下げの経路が無いと、確信の持てない通報が萎縮する。
//   ADR-033 ⑤ が虚偽の通報を措置の対象とする以上、自分で片付けられる必要がある。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { reportId } = body as { reportId?: unknown };

    if (typeof reportId !== "string" || reportId.length === 0) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction(async (tx) => {
      const report = await tx.queryObject<{ reporter_profile_id: string; status: string }>(
        `SELECT reporter_profile_id, status FROM abuse_reports WHERE id = $1`,
        [reportId],
      );
      if (report.rows.length === 0) {
        throw businessError("ABUSE-005", "Report not found.", 404);
      }
      if (report.rows[0].reporter_profile_id !== claims.sub) {
        throw businessError("ABUSE-007", "Not allowed to withdraw this report.", 403);
      }
      if (report.rows[0].status !== "OPEN") {
        throw businessError("ABUSE-006", "Report already resolved.", 409);
      }

      // ★resolved_by_profile_id は NULL のままとする。管理者の措置ではないためである。
      await tx.queryObject(
        `UPDATE abuse_reports SET status = 'WITHDRAWN', resolved_at = NOW() WHERE id = $1`,
        [reportId],
      );

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'ABUSE_WITHDRAWN', 'TEAM',
                 (SELECT target_team_id::text FROM abuse_reports WHERE id = $2), $3)`,
        [claims.sub, reportId, JSON.stringify({ reportId })],
      );

      return { status: "WITHDRAWN" as const };
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

if (import.meta.main) {
  Deno.serve(withCors(handler));
}
