// ===== supabase/functions/concede-match/index.ts =====
// 投了（敗北の自己申告 / 04_BackendInterface.md 21.1 / ADR-032 ①）。
//
// ★これが基本の経路である。勝者申告は敗者が投了しない場合の代替にすぎない。
//
// 自分に不利な申告に虚偽の動機は無いため、承認を要さず即座に確定する。
// クールダウンを課さない。投了は最短で次のキューへ入れる道である（ADR-032 ④）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { assertUpdatesAllowed } from "../_shared/season.ts";
import { completeMatch, type CompletionResult } from "../_shared/match-completion.ts";
import {
  assertNotFinished,
  loadMatch,
  opponentOf,
  resolveOwnTeam,
} from "../_shared/match-guard.ts";
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
      await assertUpdatesAllowed(tx);

      const match = await loadMatch(tx, matchId);
      assertNotFinished(match);

      // ★winnerTeamId を入力に取らない。投了するのは呼び出しユーザーのチームであり、
      //   勝者はもう一方として一意に定まる。受け取ると、投了に見せかけて相手の敗北を
      //   登録できてしまう。
      const loserTeamId = await resolveOwnTeam(tx, claims.sub, match);
      const winnerTeamId = opponentOf(match, loserTeamId);

      // 自分が申告した勝利に投了するのは撤回であって投了ではない（MATCH-009）。
      // ★撤回の手段は用意しない。用意すると、申告を出しては引っ込めて
      //   相手の承認期限を消費できる。
      if (match.status === "WINNER_REPORTED" && match.winner_team_id === loserTeamId) {
        throw businessError("MATCH-009", "Cannot concede a win reported by your own team.", 409);
      }

      // 反対申告で競合中でも投了できる。競合はいずれかの投了で解ける（ADR-032 ⑩）。
      const completed = await completeMatch(
        tx,
        { matchId, winnerTeamId, loserTeamId, version },
        claims.sub,
        { action: "MATCH_CONCEDED", fromStatuses: ["PLAYING", "WINNER_REPORTED"] },
      );

      if (completed === null) {
        throw businessError("MATCH-008", "Conflicting operation.", 409);
      }

      return completed;
    });

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
