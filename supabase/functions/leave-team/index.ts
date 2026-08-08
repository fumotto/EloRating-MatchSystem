// ===== supabase/functions/leave-team/index.ts =====
// チーム脱退（04_BackendInterface.md 9.5）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

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
  Deno.serve(handler);
}
