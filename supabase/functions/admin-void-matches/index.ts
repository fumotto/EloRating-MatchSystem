// ===== supabase/functions/admin-void-matches/index.ts =====
// 管理者による試合の無効化（04_BackendInterface.md 21.7 / ADR-034 ④）。
//
// ゲーム側の障害・メンテナンスのように、運営が把握できる外部要因に用いる。
//
// ★運営起因・外部起因の不成立は、当事者にいかなる不利益も伴わせない。
//   レートを変えず、確定率にも計上せず、クールダウンも課さない。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

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
    const { matchId, reason, includeReported } = body as {
      matchId?: unknown;
      reason?: unknown;
      includeReported?: unknown;
    };

    // ★理由の入力を必須とする。理由の無い一括無効化は事故と区別できない。
    if (
      typeof reason !== "string" || reason.length < 1 || reason.length > 500 ||
      (matchId !== undefined && typeof matchId !== "string") ||
      (includeReported !== undefined && typeof includeReported !== "boolean")
    ) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    // ★一括版の既定の対象は PLAYING のみ。障害の前に成立していた申告を
    //   巻き込んで消さないためである。
    const statuses = includeReported === true
      ? ["PLAYING", "WINNER_REPORTED"]
      : ["PLAYING"];

    const result = await withTransaction(async (tx) => {
      const voided = await tx.queryObject<{ id: string }>(
        matchId !== undefined
          ? `UPDATE matches
                SET status = 'DRAWN',
                    no_contest_reason = 'ADMIN_VOID',
                    winner_team_id = NULL,
                    completed_at = NOW(),
                    no_contest_requested_by_team_id = NULL,
                    no_contest_requested_at = NULL,
                    no_contest_reason_code = NULL,
                    version = version + 1
              WHERE id = $2 AND status = ANY($1)
          RETURNING id`
          : `UPDATE matches
                SET status = 'DRAWN',
                    no_contest_reason = 'ADMIN_VOID',
                    winner_team_id = NULL,
                    completed_at = NOW(),
                    no_contest_requested_by_team_id = NULL,
                    no_contest_requested_at = NULL,
                    no_contest_reason_code = NULL,
                    version = version + 1
              WHERE status = ANY($1)
          RETURNING id`,
        matchId !== undefined ? [statuses, matchId] : [statuses],
      );

      if (matchId !== undefined && voided.rows.length === 0) {
        // 対象が終端状態か存在しない。
        const exists = await tx.queryObject<{ id: string }>(
          `SELECT id FROM matches WHERE id = $1`,
          [matchId],
        );
        throw exists.rows.length === 0
          ? businessError("MATCH-001", "Match not found.", 404)
          : businessError("MATCH-002", "Match already finished.", 409);
      }

      // ★レートは変動させない。rating_history も作らない。
      // ★クールダウンも課さない。
      for (const row of voided.rows) {
        await tx.queryObject(
          `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
           VALUES ($1, 'MATCH_VOIDED', 'MATCH', $2, $3)`,
          [claims.sub, row.id, JSON.stringify({ reason })],
        );
      }

      return { voidedCount: voided.rows.length, ids: voided.rows.map((r) => r.id) };
    });

    for (const id of result.ids) {
      await broadcast("match", "MATCH_DRAWN", { matchId: id });
    }

    return ok({ voidedCount: result.voidedCount });
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
