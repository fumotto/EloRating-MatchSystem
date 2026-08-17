// ===== supabase/functions/reject-match/index.ts =====
// 敗者による申告拒否（04_BackendInterface.md 10.5 / ADR-014）。
//
// 拒否すると申告が破棄されて PLAYING へ戻る。拒否回数が上限に達した場合は DRAWN で解散する。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { assertUpdatesAllowed } from "../_shared/season.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface RejectMatchResponse {
  status: "PLAYING" | "DRAWN";
  rejectCount: number;
  reportDeadlineAt?: string;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { matchId, version } = body as { matchId?: unknown; version?: unknown };

    if (typeof matchId !== "string" || typeof version !== "number" || !Number.isInteger(version)) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<RejectMatchResponse>(async (tx) => {
      // シーズン切替中は利用者側の更新を止める（06_ErrorCode.md 13.1）。
      await assertUpdatesAllowed(tx);

      const match = await tx.queryObject<{
        team_a_id: string;
        team_b_id: string;
        winner_team_id: string | null;
        status: string;
        reject_count: number;
      }>(
        `SELECT team_a_id, team_b_id, winner_team_id, status, reject_count
           FROM matches WHERE id = $1`,
        [matchId],
      );

      if (match.rows.length === 0) {
        throw businessError("MATCH-001", "Match not found.", 404);
      }

      const { team_a_id, team_b_id, winner_team_id, status, reject_count } = match.rows[0];

      if (status === "COMPLETED" || status === "DRAWN") {
        throw businessError("MATCH-002", "Match already finished.", 409);
      }
      if (status !== "WINNER_REPORTED" || winner_team_id === null) {
        throw businessError("MATCH-004", "Winner has not been reported.", 409);
      }

      const loserTeamId = winner_team_id === team_a_id ? team_b_id : team_a_id;

      const membership = await tx.queryObject<{ id: string }>(
        `SELECT id FROM team_members WHERE profile_id = $1 AND team_id = $2`,
        [claims.sub, loserTeamId],
      );

      if (membership.rows.length === 0) {
        throw businessError("MATCH-005", "Not allowed to operate this match.", 403);
      }

      const settings = await tx.queryObject<{
        max_reject_count: number;
        report_timeout_minutes: number;
      }>(`SELECT max_reject_count, report_timeout_minutes FROM system_settings LIMIT 1`);

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const nextRejectCount = reject_count + 1;
      // 「上限に**達した**場合は解散」である（04 10.5 / ADR-014）。超過ではない。
      // 初期値2なら2回目の拒否で解散する。max_reject_count=0 なら初回で解散する。
      const drawn = nextRejectCount >= settings.rows[0].max_reject_count;

      if (drawn) {
        // 上限到達。DRAWN では winner_team_id が NULL でなければ制約違反となる。
        // レートは更新しない（08 3章）。rating_history も作らない。
        const updated = await tx.queryObject<{ reject_count: number }>(
          `UPDATE matches
              SET status = 'DRAWN',
                  winner_team_id = NULL,
                  reported_by_profile_id = NULL,
                  reported_at = NULL,
                  approve_deadline_at = NULL,
                  completed_at = NOW(),
                  reject_count = $1,
                  version = version + 1
            WHERE id = $2 AND version = $3 AND status = 'WINNER_REPORTED'
        RETURNING reject_count`,
          [nextRejectCount, matchId, version],
        );

        if (updated.rows.length === 0) {
          throw businessError("MATCH-008", "Conflicting operation.", 409);
        }

        await tx.queryObject(
          `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
           VALUES ($1, 'MATCH_DRAWN', 'MATCH', $2, $3)`,
          [claims.sub, matchId, JSON.stringify({ rejectCount: nextRejectCount })],
        );

        // 解散は業務エラーではない。result は OK で status に DRAWN を載せる（10.5）。
        return { status: "DRAWN" as const, rejectCount: nextRejectCount };
      }

      // PLAYING へ戻す。申告情報は必ずクリアする（chk_matches_playing）。
      //
      // ★report_deadline_at の再設定は必須である。再設定しないと、当初の申告期限を
      //   既に過ぎている場合に、戻した直後へ自動解決バッチがドロー解散させてしまう（10.5）。
      const updated = await tx.queryObject<{ report_deadline_at: Date; reject_count: number }>(
        `UPDATE matches
            SET status = 'PLAYING',
                winner_team_id = NULL,
                reported_by_profile_id = NULL,
                reported_at = NULL,
                approve_deadline_at = NULL,
                reject_count = $1,
                report_deadline_at = NOW() + ($2 || ' minutes')::interval,
                version = version + 1
          WHERE id = $3 AND version = $4 AND status = 'WINNER_REPORTED'
      RETURNING report_deadline_at, reject_count`,
        [
          nextRejectCount,
          String(settings.rows[0].report_timeout_minutes),
          matchId,
          version,
        ],
      );

      if (updated.rows.length === 0) {
        throw businessError("MATCH-008", "Conflicting operation.", 409);
      }

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'MATCH_REJECTED', 'MATCH', $2, $3)`,
        [claims.sub, matchId, JSON.stringify({ rejectCount: nextRejectCount })],
      );

      return {
        status: "PLAYING" as const,
        rejectCount: updated.rows[0].reject_count,
        reportDeadlineAt: new Date(updated.rows[0].report_deadline_at).toISOString(),
      };
    });

    await broadcast(
      "match",
      result.status === "DRAWN" ? "MATCH_DRAWN" : "MATCH_REJECTED",
      { matchId },
    );

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
