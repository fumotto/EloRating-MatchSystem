// ===== supabase/functions/auto-resolve-matches/index.ts =====
// 期限超過した試合の自動解決（04_BackendInterface.md 11.2 / ADR-014）。
//
// ① 報告期限切れ（PLAYING）→ DRAWN。レートは更新しない。
// ② 承認期限切れ（WINNER_REPORTED）→ 自動承認して COMPLETED。レートを更新する。
import { isServiceRole } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { completeMatch } from "../_shared/match-completion.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface AutoResolveResponse {
  drawnCount: number;
  autoApprovedCount: number;
}

interface ExpiredMatch {
  id: string;
  team_a_id: string;
  team_b_id: string;
  winner_team_id: string | null;
  version: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    if (!isServiceRole(req)) {
      return businessError("AUTH-004", "Forbidden.", 403);
    }

    // 対象の抽出は1つのトランザクションで行い、確定は試合ごとに分ける。
    // 1件の失敗が他の試合を巻き込まないようにするためである（11.2）。
    const targets = await withTransaction(async (tx) => {
      const expiredReport = await tx.queryObject<ExpiredMatch>(
        `SELECT id, team_a_id, team_b_id, winner_team_id, version
           FROM matches
          WHERE status = 'PLAYING' AND report_deadline_at < NOW()`,
      );

      const expiredApprove = await tx.queryObject<ExpiredMatch>(
        `SELECT id, team_a_id, team_b_id, winner_team_id, version
           FROM matches
          WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW()`,
      );

      return { drawn: expiredReport.rows, autoApprove: expiredApprove.rows };
    });

    const drawnIds: string[] = [];
    const completedIds: string[] = [];

    // ① 報告期限切れ → ドロー解散。
    for (const match of targets.drawn) {
      try {
        const done = await withTransaction(async (tx) => {
          // ★advisory lock で試合ごとに直列化する。多重起動しても二重処理にならない。
          //   状態と version を WHERE に含めるため、取りこぼしても不整合にはならない。
          await tx.queryObject(`SELECT pg_advisory_xact_lock(hashtext('auto-resolve'), $1::int)`, [
            hashToInt(match.id),
          ]);

          const updated = await tx.queryObject<{ id: string }>(
            `UPDATE matches
                SET status = 'DRAWN',
                    winner_team_id = NULL,
                    completed_at = NOW(),
                    version = version + 1
              WHERE id = $1 AND version = $2 AND status = 'PLAYING'
                AND report_deadline_at < NOW()
          RETURNING id`,
            [match.id, match.version],
          );

          if (updated.rows.length === 0) return false;

          await tx.queryObject(
            `INSERT INTO audit_logs (action, target_type, target_id)
             VALUES ('MATCH_DRAWN', 'MATCH', $1)`,
            [match.id],
          );

          return true;
        });

        if (done) drawnIds.push(match.id);
      } catch (e) {
        // 1件の失敗で全体を止めない。失敗はログに残し、次回の実行で再試行される。
        logFailure("auto-resolve-matches", match.id, e);
      }
    }

    // ② 承認期限切れ → 自動承認。レート更新は共通処理が行う。
    for (const match of targets.autoApprove) {
      if (match.winner_team_id === null) continue; // 制約上ありえないが、念のため飛ばす。

      const loserTeamId = match.winner_team_id === match.team_a_id
        ? match.team_b_id
        : match.team_a_id;

      try {
        const completed = await withTransaction(async (tx) => {
          await tx.queryObject(`SELECT pg_advisory_xact_lock(hashtext('auto-resolve'), $1::int)`, [
            hashToInt(match.id),
          ]);

          // approvedByProfileId は null。auto_approved = TRUE で確定する。
          return await completeMatch(
            tx,
            {
              matchId: match.id,
              winnerTeamId: match.winner_team_id!,
              loserTeamId,
              version: match.version,
            },
            null,
          );
        });

        if (completed) completedIds.push(match.id);
      } catch (e) {
        logFailure("auto-resolve-matches", match.id, e);
      }
    }

    // コミット後に通知する。
    for (const matchId of drawnIds) {
      await broadcast("match", "MATCH_DRAWN", { matchId });
    }
    for (const matchId of completedIds) {
      await broadcast("match", "MATCH_COMPLETED", { matchId });
    }
    if (completedIds.length > 0) {
      await broadcast("ranking", "RANKING_UPDATED", { count: completedIds.length });
    }

    const response: AutoResolveResponse = {
      drawnCount: drawnIds.length,
      autoApprovedCount: completedIds.length,
    };

    return ok(response);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

// advisory lock の第2引数は int である。UUIDをそのまま渡せないため32bitへ畳む。
function hashToInt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return hash;
}

// 17章のログ方針。個人情報・トークンは出力しない。
function logFailure(fn: string, matchId: string, e: unknown) {
  console.error(
    JSON.stringify({
      function: fn,
      matchId,
      result: "NG",
      errorCode: "SYSTEM-001",
      message: e instanceof Error ? e.message : String(e),
    }),
  );
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setBroadcaster, resetBroadcaster } from "../_shared/realtime.ts";

if (import.meta.main) {
  Deno.serve(handler);
}
