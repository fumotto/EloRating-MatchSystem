// ===== supabase/functions/cleanup-expired-invites/index.ts =====
// 期限切れ招待の状態更新（04_BackendInterface.md 11.3）。Cron・1時間間隔。
//
// accept-team-invite は参照時にも expires_at を見るため、本処理は表示上の整合を保つものである。
// 本処理が動かなくても期限切れ招待が使われることはない。
import { isServiceRole } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface CleanupResponse {
  expiredCount: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    if (!isServiceRole(req)) {
      return businessError("AUTH-004", "Forbidden.", 403);
    }

    const expired = await withTransaction(async (tx) => {
      const updated = await tx.queryObject<{ id: string }>(
        `UPDATE team_invites
            SET status = 'EXPIRED'
          WHERE status = 'ACTIVE' AND expires_at < NOW()
      RETURNING id`,
      );
      return updated.rows.length;
    });

    const response: CleanupResponse = { expiredCount: expired };
    return ok(response);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";

if (import.meta.main) {
  Deno.serve(handler);
}
