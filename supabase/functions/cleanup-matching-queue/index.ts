// ===== supabase/functions/cleanup-matching-queue/index.ts =====
// 滞留した待機情報の削除（04_BackendInterface.md 11.4 / 09 10章）。Cron・10分間隔。
//
// 正常な処理では待機情報はマッチ成立・キャンセル・BANのいずれかで消える。
// ★本処理で削除される件数は通常0件である。継続的に0でない場合は不具合の兆候として扱う。
//   そのため削除件数を応答とログの双方へ出す。
import { isServiceRole } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

// 滞留とみなす経過時間。09 10章が定める24時間である。
const STALE_HOURS = 24;

interface CleanupResponse {
  removedCount: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    if (!isServiceRole(req)) {
      return businessError("AUTH-004", "Forbidden.", 403);
    }

    const removed = await withTransaction(async (tx) => {
      const deleted = await tx.queryObject<{ team_id: string }>(
        `DELETE FROM matching_queue
          WHERE queued_at < NOW() - ($1 || ' hours')::interval
      RETURNING team_id`,
        [String(STALE_HOURS)],
      );
      return deleted.rows.length;
    });

    if (removed > 0) {
      console.warn(
        JSON.stringify({
          function: "cleanup-matching-queue",
          removedCount: removed,
          message: "stale queue entries were removed; investigate the cause",
        }),
      );
    }

    const response: CleanupResponse = { removedCount: removed };
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
