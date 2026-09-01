// ===== supabase/functions/request-no-contest/index.ts =====
// 不成立の申請（04_BackendInterface.md 21.5 / ADR-032 ⑧ ＋ ADR-034 ②）。
//
// ★結末は相手の応答で決まる。申請そのものは結末を決めない。
//     承諾                       → DRAWN / MUTUAL（双方に代償なし）
//     対戦継続・申告・投了・延長      → 試合は継続する
//     無応答                     → DRAWN / NO_SHOW（無応答側のみ代償）
//
// ★申請はマッチ成立の直後から出せる。時間の壁は「申請できる時刻」ではなく
//   「沈黙が試合を終わらせる時刻」に置く（auto-resolve-matches が判定する）。
//   これにより、対戦できないと分かった時点で直ちに申請でき、かつ劣勢の側が
//   対戦直後に申請して相手の一時離席に賭ける使い方を防げる。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { assertUpdatesAllowed } from "../_shared/season.ts";
import { assertPlaying, loadMatch, resolveOwnTeam } from "../_shared/match-guard.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

const REASON_CODES = ["CONNECTION", "GAME_ISSUE", "NO_RESPONSE", "OTHER"] as const;

interface RequestNoContestResponse {
  requestedByTeamId: string;
  reasonCode: string;
  requestCount: number;
  version: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { matchId, reasonCode, version } = body as {
      matchId?: unknown;
      reasonCode?: unknown;
      version?: unknown;
    };

    if (
      typeof matchId !== "string" || typeof version !== "number" || !Number.isInteger(version) ||
      typeof reasonCode !== "string" ||
      !(REASON_CODES as readonly string[]).includes(reasonCode)
    ) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<RequestNoContestResponse>(async (tx) => {
      await assertUpdatesAllowed(tx);

      const match = await loadMatch(tx, matchId);
      // ★PLAYING に限る（ADR-034 ②）。WINNER_REPORTED から認めると、敗者が勝者へ
      //   「無かったことにしてほしい」と交渉する経路になる。
      //   対戦が成立しなかったのであれば勝利の申告は生じない。
      assertPlaying(match);

      const ownTeamId = await resolveOwnTeam(tx, claims.sub, match);

      if (match.no_contest_requested_by_team_id !== null) {
        throw businessError("MATCH-011", "A no-contest request is already pending.", 409);
      }

      const settings = await tx.queryObject<{ max_no_contest_requests: number }>(
        `SELECT max_no_contest_requests FROM system_settings LIMIT 1`,
      );
      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      if (match.no_contest_request_count >= settings.rows[0].max_no_contest_requests) {
        throw businessError("MATCH-012", "No-contest request limit reached.", 409);
      }

      const updated = await tx.queryObject<{ no_contest_request_count: number; version: number }>(
        `UPDATE matches
            SET no_contest_requested_by_team_id = $1,
                no_contest_requested_at = NOW(),
                no_contest_reason_code = $2,
                no_contest_request_count = no_contest_request_count + 1,
                version = version + 1
          WHERE id = $3 AND version = $4 AND status = 'PLAYING'
            AND no_contest_requested_by_team_id IS NULL
      RETURNING no_contest_request_count, version`,
        [ownTeamId, reasonCode, matchId, version],
      );

      if (updated.rows.length === 0) {
        throw businessError("MATCH-008", "Conflicting operation.", 409);
      }

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'MATCH_NO_CONTEST_REQUESTED', 'MATCH', $2, $3)`,
        [claims.sub, matchId, JSON.stringify({ requestedByTeamId: ownTeamId, reasonCode })],
      );

      return {
        requestedByTeamId: ownTeamId,
        reasonCode,
        requestCount: updated.rows[0].no_contest_request_count,
        version: updated.rows[0].version,
      };
    });

    await broadcast("match", "MATCH_NO_CONTEST_REQUESTED", { matchId });

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
