// ===== supabase/functions/admin-reset-ratings/index.ts =====
// 全チームのレートリセット（04_BackendInterface.md 12.4）。
//
// ★シーズン機能ではない。シーズン管理はMVP対象外である（13_FutureFeatures.md）。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface AdminResetRatingsResponse {
  affectedTeams: number;
  initialRating: number;
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
    const { initialRating } = body as { initialRating?: unknown };

    if (initialRating !== undefined) {
      // 下限は teams.rating の CHECK制約（>= 100）と一致させる。
      if (
        typeof initialRating !== "number" || !Number.isInteger(initialRating) ||
        initialRating < 100
      ) {
        return businessError("RATING-002", "Invalid rating setting.", 400);
      }
    }

    const result = await withTransaction<AdminResetRatingsResponse>(async (tx) => {
      // 進行中の試合があるとレート計算の整合が崩れる（12.4）。
      const activeMatch = await tx.queryObject<{ id: string }>(
        `SELECT id FROM matches WHERE status NOT IN ('COMPLETED', 'DRAWN') LIMIT 1`,
      );

      if (activeMatch.rows.length > 0) {
        throw businessError("RATING-003", "A match is in progress.", 409);
      }

      let rating = initialRating;
      if (rating === undefined) {
        // 省略時は system_settings.initial_rating を使う。ハードコードしない。
        const settings = await tx.queryObject<{ initial_rating: number }>(
          `SELECT initial_rating FROM system_settings LIMIT 1`,
        );
        if (settings.rows.length === 0) {
          throw systemError("SYSTEM-001", "System settings not found.");
        }
        rating = settings.rows[0].initial_rating;
      }

      const updated = await tx.queryObject<{ id: string }>(
        `UPDATE teams SET rating = $1 WHERE rating <> $1 RETURNING id`,
        [rating],
      );

      // ★rating_history へは登録しない。match_id が NOT NULL かつ matches への外部キーであり、
      //   試合に紐づかない履歴を作れないためである（ADR-017）。既存の履歴も消さない。
      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'RATING_RESET', 'SETTINGS', '1', $2)`,
        [
          claims.sub,
          JSON.stringify({ affectedTeams: updated.rows.length, initialRating: rating }),
        ],
      );

      return { affectedTeams: updated.rows.length, initialRating: rating };
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
  Deno.serve(handler);
}
