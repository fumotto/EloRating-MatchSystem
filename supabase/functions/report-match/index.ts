// ===== supabase/functions/report-match/index.ts =====
// 勝利申告（04_BackendInterface.md 10.3 / ADR-009）。
//
// 勝者チームのいずれのメンバーでも実行できる。LEADER限定ではない。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface ReportMatchResponse {
  status: "WINNER_REPORTED";
  approveDeadlineAt: string;
  version: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { matchId, winnerTeamId, version } = body as {
      matchId?: unknown;
      winnerTeamId?: unknown;
      version?: unknown;
    };

    if (
      typeof matchId !== "string" || typeof winnerTeamId !== "string" ||
      typeof version !== "number" || !Number.isInteger(version)
    ) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<ReportMatchResponse>(async (tx) => {
      const match = await tx.queryObject<{
        team_a_id: string;
        team_b_id: string;
        status: string;
        version: number;
      }>(
        `SELECT team_a_id, team_b_id, status, version FROM matches WHERE id = $1`,
        [matchId],
      );

      if (match.rows.length === 0) {
        throw businessError("MATCH-001", "Match not found.", 404);
      }

      const { team_a_id, team_b_id, status } = match.rows[0];

      // 状態ごとにコードを分ける（06_ErrorCode.md 11章の使用箇所）。
      if (status === "COMPLETED" || status === "DRAWN") {
        throw businessError("MATCH-002", "Match already finished.", 409);
      }
      if (status === "WINNER_REPORTED") {
        throw businessError("MATCH-003", "Winner already reported.", 409);
      }

      // 当該試合の参加チームでなければ勝者として指定できない。
      if (winnerTeamId !== team_a_id && winnerTeamId !== team_b_id) {
        throw businessError("MATCH-006", "Invalid winner team.", 400);
      }

      // ★申告できるのは勝者チームのメンバーだけである。
      //   敗者側からの申告も第三者による申告も MATCH-005 で弾く。
      const membership = await tx.queryObject<{ id: string }>(
        `SELECT id FROM team_members WHERE profile_id = $1 AND team_id = $2`,
        [claims.sub, winnerTeamId],
      );

      if (membership.rows.length === 0) {
        throw businessError("MATCH-005", "Not allowed to operate this match.", 403);
      }

      // 楽観ロック。WHERE に version を含め、更新できた行数で競合を判定する。
      // 同一チーム内で複数名が同時に申告しても1件しか成功しない（10.3）。
      const updated = await tx.queryObject<{ approve_deadline_at: Date; version: number }>(
        `UPDATE matches
            SET status = 'WINNER_REPORTED',
                winner_team_id = $1,
                reported_by_profile_id = $2,
                reported_at = NOW(),
                approve_deadline_at = NOW()
                  + ((SELECT approve_timeout_minutes FROM system_settings LIMIT 1) || ' minutes')::interval,
                version = version + 1
          WHERE id = $3 AND version = $4 AND status = 'PLAYING'
      RETURNING approve_deadline_at, version`,
        [winnerTeamId, claims.sub, matchId, version],
      );

      if (updated.rows.length === 0) {
        // 状態は先に確認済みであるため、ここへ来るのは version 不一致（同時操作）である。
        throw businessError("MATCH-008", "Conflicting operation.", 409);
      }

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'MATCH_REPORTED', 'MATCH', $2, $3)`,
        [claims.sub, matchId, JSON.stringify({ winnerTeamId })],
      );

      return {
        status: "WINNER_REPORTED" as const,
        approveDeadlineAt: new Date(updated.rows[0].approve_deadline_at).toISOString(),
        version: updated.rows[0].version,
      };
    });

    await broadcast("match", "WINNER_REPORTED", { matchId });

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
