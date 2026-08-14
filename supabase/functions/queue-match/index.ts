// ===== supabase/functions/queue-match/index.ts =====
// マッチング待機の登録と同期試行（04_BackendInterface.md 10.1 / 09 4章）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { runMatchmaking } from "../_shared/matchmaking.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface QueueMatchResponse {
  queuedAt: string;
  matched: boolean;
  matchId?: string;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { teamId } = body as { teamId?: unknown };

    if (typeof teamId !== "string" || teamId.length === 0) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<QueueMatchResponse>(async (tx) => {
      const membership = await tx.queryObject<{ role: string }>(
        `SELECT role FROM team_members WHERE profile_id = $1 AND team_id = $2`,
        [claims.sub, teamId],
      );

      if (membership.rows.length === 0 || membership.rows[0].role !== "LEADER") {
        throw businessError("TEAM-005", "Team leader only.", 403);
      }

      const team = await tx.queryObject<{ is_banned: boolean }>(
        `SELECT is_banned FROM teams WHERE id = $1`,
        [teamId],
      );

      if (team.rows.length === 0) {
        throw businessError("TEAM-001", "Team not found.", 404);
      }
      if (team.rows[0].is_banned) {
        throw businessError("TEAM-006", "Team is banned.", 409);
      }

      // 進行中の試合がある間は待機できない（QUEUE-002）。1チーム同時1試合である。
      const activeMatch = await tx.queryObject<{ id: string }>(
        `SELECT id FROM matches
         WHERE (team_a_id = $1 OR team_b_id = $1) AND status NOT IN ('COMPLETED', 'DRAWN')`,
        [teamId],
      );

      if (activeMatch.rows.length > 0) {
        throw businessError("QUEUE-002", "Match in progress.", 409);
      }

      const alreadyQueued = await tx.queryObject<{ team_id: string }>(
        `SELECT team_id FROM matching_queue WHERE team_id = $1`,
        [teamId],
      );

      if (alreadyQueued.rows.length > 0) {
        throw businessError("QUEUE-001", "Already queued.", 409);
      }

      // 必須人数に満たないチームは待機できない（09 4章 / QUEUE-005）。
      //
      // ★必須人数は system_settings.team_max_members と等しい。専用の列は設けない。
      //   人数の異なるチーム同士が対戦しないことが目的であり、上限と必須が一致していれば
      //   待機列に入るチームはすべて同数になる。
      //
      // ★ここで数え直す。招待の受諾や脱退は待機登録と独立に起きるため、
      //   画面が表示した時点の人数を信用してはならない。
      const settings = await tx.queryObject<{ team_max_members: number }>(
        `SELECT team_max_members FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const memberCount = await tx.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = $1`,
        [teamId],
      );

      if (memberCount.rows[0].count < settings.rows[0].team_max_members) {
        throw businessError("QUEUE-005", "Team does not have enough members.", 409);
      }

      const queued = await tx.queryObject<{ queued_at: Date }>(
        `INSERT INTO matching_queue (team_id) VALUES ($1) RETURNING queued_at`,
        [teamId],
      );

      // 登録直後に同期試行する。相手が見つからなければ待機を継続する（09 4章）。
      const { matches } = await runMatchmaking(tx);

      // 自チームが組まれたかは、成立した組の参加チームから直接判定する。
      const own = matches.find((m) => m.teamAId === teamId || m.teamBId === teamId);
      const matchId = own?.matchId;

      return {
        queuedAt: new Date(queued.rows[0].queued_at).toISOString(),
        matched: matchId !== undefined,
        ...(matchId ? { matchId } : {}),
      };
    });

    // 成立時のみ通知する。キュー登録・解除では送らない（09 11章）。
    if (result.matched && result.matchId) {
      await broadcast("match", "MATCH_CREATED", { matchId: result.matchId });
    }

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
