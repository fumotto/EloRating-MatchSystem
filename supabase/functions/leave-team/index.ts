// ===== supabase/functions/leave-team/index.ts =====
// チーム脱退（04_BackendInterface.md 9.5）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface LeaveTeamResponse {
  teamId: string;
  remainingMembers: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    // 入力は無い。所属チームはJWTから導出する（9.5）。

    const result = await withTransaction<LeaveTeamResponse>(async (tx) => {
      const membership = await tx.queryObject<{ team_id: string; role: string }>(
        `SELECT team_id, role FROM team_members WHERE profile_id = $1`,
        [claims.sub],
      );

      if (membership.rows.length === 0) {
        throw businessError("TEAM-010", "Not in a team.", 409);
      }

      const { team_id: teamId, role } = membership.rows[0];

      // BANされたチームは編成を変えられない（Issue #9 / 04_BackendInterface.md 12.1）。
      //
      // ★脱退を許すと、BANの実効性が失われる。全員が抜けて別のチームを作り直せば
      //   制裁を回避できてしまう。BANはチームに対する措置であり、
      //   解除まで編成を凍結する。
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

      // 進行中の試合。終端状態（COMPLETED / DRAWN）は進行中とみなさない（TC-TEAM-042）。
      const activeMatch = await tx.queryObject<{ id: string }>(
        `SELECT id FROM matches
         WHERE (team_a_id = $1 OR team_b_id = $1) AND status NOT IN ('COMPLETED', 'DRAWN')`,
        [teamId],
      );

      if (activeMatch.rows.length > 0) {
        throw businessError("TEAM-007", "Match in progress.", 409);
      }

      const memberCount = await tx.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = $1`,
        [teamId],
      );

      const remainingMembers = memberCount.rows[0].count - 1;

      // 単独メンバーのLEADERは脱退できる。他メンバーが居る場合のみ移譲を要求する（TEAM-008）。
      if (role === "LEADER" && remainingMembers > 0) {
        throw businessError("TEAM-008", "Transfer the leader role first.", 409);
      }

      // 待機中であればキューからも外す。残しておくとメンバー0人のチームがマッチしうる。
      await tx.queryObject(`DELETE FROM matching_queue WHERE team_id = $1`, [teamId]);

      await tx.queryObject(`DELETE FROM team_members WHERE profile_id = $1`, [claims.sub]);

      // 最後の1人が抜けてもチームは残す。チーム削除はMVP対象外である（9.5）。
      return { teamId, remainingMembers };
    });

    await broadcast("team", "TEAM_MEMBER_UPDATED", { teamId: result.teamId });

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
