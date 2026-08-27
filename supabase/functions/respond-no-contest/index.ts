// ===== supabase/functions/respond-no-contest/index.ts =====
// 不成立の申請への応答（04_BackendInterface.md 21.5 / ADR-032 ⑧ ＋ ADR-034 ②）。
//
// ACCEPT   … DRAWN / MUTUAL。**双方に代償を課さない。即時に成立し、猶予を待たない。**
// CONTINUE … 申請を消して試合を継続する。**報告期限は変えない。**
//
// ★報告期限を変えないことが重要である。申請と応答を繰り返して期限を伸ばせると、
//   旧「拒否」と同じ引き延ばしが復活する。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { assertUpdatesAllowed } from "../_shared/season.ts";
import { assertPlaying, loadMatch, resolveOwnTeam } from "../_shared/match-guard.ts";
import { applyCooldown, getCooldownMinutes } from "../_shared/team-sanction.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface RespondNoContestResponse {
  status: "DRAWN" | "PLAYING";
  noContestReason?: "MUTUAL";
  avoidanceRegistered?: boolean;
  version: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { matchId, response, version } = body as {
      matchId?: unknown;
      response?: unknown;
      version?: unknown;
    };

    if (
      typeof matchId !== "string" || typeof version !== "number" || !Number.isInteger(version) ||
      (response !== "ACCEPT" && response !== "CONTINUE")
    ) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<RespondNoContestResponse>(async (tx) => {
      await assertUpdatesAllowed(tx);

      const match = await loadMatch(tx, matchId);
      assertPlaying(match);

      const ownTeamId = await resolveOwnTeam(tx, claims.sub, match);

      if (match.no_contest_requested_by_team_id === null) {
        throw businessError("MATCH-011", "No pending no-contest request.", 409);
      }
      // ★申請者自身は応答できない。自分ひとりでは不成立にできないという歯止めである。
      if (match.no_contest_requested_by_team_id === ownTeamId) {
        throw businessError("MATCH-005", "Not allowed to operate this match.", 403);
      }

      if (response === "CONTINUE") {
        const updated = await tx.queryObject<{ version: number }>(
          `UPDATE matches
              SET no_contest_requested_by_team_id = NULL,
                  no_contest_requested_at = NULL,
                  no_contest_reason_code = NULL,
                  version = version + 1
            WHERE id = $1 AND version = $2 AND status = 'PLAYING'
        RETURNING version`,
          [matchId, version],
        );
        if (updated.rows.length === 0) {
          throw businessError("MATCH-008", "Conflicting operation.", 409);
        }

        await tx.queryObject(
          `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id)
           VALUES ($1, 'MATCH_NO_CONTEST_DECLINED', 'MATCH', $2)`,
          [claims.sub, matchId],
        );

        return { status: "PLAYING" as const, version: updated.rows[0].version };
      }

      // ===== ACCEPT =====
      const reasonCodeRow = await tx.queryObject<{ no_contest_reason_code: string | null }>(
        `SELECT no_contest_reason_code FROM matches WHERE id = $1`,
        [matchId],
      );
      const reasonCode = reasonCodeRow.rows[0]?.no_contest_reason_code;

      const updated = await tx.queryObject<{ version: number }>(
        `UPDATE matches
            SET status = 'DRAWN',
                no_contest_reason = 'MUTUAL',
                winner_team_id = NULL,
                completed_at = NOW(),
                no_contest_requested_by_team_id = NULL,
                no_contest_requested_at = NULL,
                no_contest_reason_code = NULL,
                version = version + 1
          WHERE id = $1 AND version = $2 AND status = 'PLAYING'
      RETURNING version`,
        [matchId, version],
      );
      if (updated.rows.length === 0) {
        throw businessError("MATCH-008", "Conflicting operation.", 409);
      }

      const settings = await tx.queryObject<{
        mutual_no_contest_daily_limit: number;
        avoidance_days: number;
        max_avoidance_entries: number;
      }>(
        `SELECT mutual_no_contest_daily_limit, avoidance_days, max_avoidance_entries
           FROM system_settings LIMIT 1`,
      );
      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }
      const { mutual_no_contest_daily_limit, avoidance_days, max_avoidance_entries } =
        settings.rows[0];

      // ★濫用の抑止。相手を選ぶために不成立を繰り返す使い方を防ぐ。
      //   上限までは無償である（ADR-034 ②）。
      for (const teamId of [match.team_a_id, match.team_b_id]) {
        const count = await tx.queryObject<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM matches
            WHERE status = 'DRAWN' AND no_contest_reason = 'MUTUAL'
              AND (team_a_id = $1 OR team_b_id = $1)
              AND completed_at > NOW() - interval '1 day'`,
          [teamId],
        );
        if (count.rows[0].count > mutual_no_contest_daily_limit) {
          await applyCooldown(tx, [teamId], await getCooldownMinutes(tx));
        }
      }

      // ★match_avoidance への登録は承諾ブランチのみ。NO_SHOW では登録しない。
      //   片方の操作で登録できると、強い相手を恒久的に回避する手段になる（ADR-034 ③）。
      let avoidanceRegistered = false;
      if (reasonCode === "CONNECTION") {
        const [low, high] = [match.team_a_id, match.team_b_id].sort();

        // チームあたりの上限。超える場合は最も古い行を落とす。
        for (const teamId of [low, high]) {
          await tx.queryObject(
            `DELETE FROM match_avoidance
              WHERE id IN (
                SELECT id FROM match_avoidance
                 WHERE (team_low_id = $1 OR team_high_id = $1) AND expires_at > NOW()
                 ORDER BY created_at DESC
                OFFSET $2
              )`,
            [teamId, max_avoidance_entries - 1],
          );
        }

        await tx.queryObject(
          `INSERT INTO match_avoidance (team_low_id, team_high_id, match_id, expires_at)
           VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)
           ON CONFLICT (team_low_id, team_high_id)
           DO UPDATE SET expires_at = EXCLUDED.expires_at, match_id = EXCLUDED.match_id`,
          [low, high, matchId, String(avoidance_days)],
        );
        avoidanceRegistered = true;
      }

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'MATCH_NO_CONTEST_ACCEPTED', 'MATCH', $2, $3)`,
        [claims.sub, matchId, JSON.stringify({ reasonCode, avoidanceRegistered })],
      );

      return {
        status: "DRAWN" as const,
        noContestReason: "MUTUAL" as const,
        avoidanceRegistered,
        version: updated.rows[0].version,
      };
    });

    await broadcast(
      "match",
      result.status === "DRAWN" ? "MATCH_DRAWN" : "MATCH_NO_CONTEST_DECLINED",
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
