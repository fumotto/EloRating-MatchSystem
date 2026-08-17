// ===== supabase/functions/approve-match/index.ts =====
// 敗者による承認とレート確定（04_BackendInterface.md 10.4 / ADR-009）。
//
// 敗者チームのいずれのメンバーでも実行できる。LEADER限定ではない。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { assertUpdatesAllowed } from "../_shared/season.ts";
import { completeMatch, type CompletionResult } from "../_shared/match-completion.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

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

    const result = await withTransaction<CompletionResult>(async (tx) => {
      // シーズン切替中は利用者側の更新を止める（06_ErrorCode.md 13.1）。
      await assertUpdatesAllowed(tx);

      const match = await tx.queryObject<{
        team_a_id: string;
        team_b_id: string;
        winner_team_id: string | null;
        status: string;
      }>(
        `SELECT team_a_id, team_b_id, winner_team_id, status FROM matches WHERE id = $1`,
        [matchId],
      );

      if (match.rows.length === 0) {
        throw businessError("MATCH-001", "Match not found.", 404);
      }

      const { team_a_id, team_b_id, winner_team_id, status } = match.rows[0];

      if (status === "COMPLETED" || status === "DRAWN") {
        throw businessError("MATCH-002", "Match already finished.", 409);
      }
      if (status !== "WINNER_REPORTED" || winner_team_id === null) {
        throw businessError("MATCH-004", "Winner has not been reported.", 409);
      }

      // 承認できるのは敗者チームのメンバーだけである。勝者側の承認は自作自演になる。
      const loserTeamId = winner_team_id === team_a_id ? team_b_id : team_a_id;

      const membership = await tx.queryObject<{ id: string }>(
        `SELECT id FROM team_members WHERE profile_id = $1 AND team_id = $2`,
        [claims.sub, loserTeamId],
      );

      if (membership.rows.length === 0) {
        throw businessError("MATCH-005", "Not allowed to operate this match.", 403);
      }

      // レート計算・履歴・チーム更新は共通処理が行う（08 10.1）。
      const completed = await completeMatch(
        tx,
        { matchId, winnerTeamId: winner_team_id, loserTeamId, version },
        claims.sub,
      );

      // 状態は確認済みであるため、失敗したのは version 不一致（二重承認・同時操作）である。
      if (completed === null) {
        throw businessError("MATCH-008", "Conflicting operation.", 409);
      }

      return completed;
    });

    // コミット後に通知する。レートが変わったのでランキングも再取得させる（04 7章）。
    await broadcast("match", "MATCH_COMPLETED", { matchId });
    await broadcast("ranking", "RANKING_UPDATED", { matchId });

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
