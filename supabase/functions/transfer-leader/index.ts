// ===== supabase/functions/transfer-leader/index.ts =====
// LEADER権限の移譲（04_BackendInterface.md 9.6）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface TransferLeaderResponse {
  leaderId: string;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { newLeaderProfileId } = body as { newLeaderProfileId?: unknown };

    if (typeof newLeaderProfileId !== "string" || newLeaderProfileId.length === 0) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<TransferLeaderResponse & { teamId: string }>(
      async (tx) => {
        const membership = await tx.queryObject<{ team_id: string; role: string }>(
          `SELECT team_id, role FROM team_members WHERE profile_id = $1`,
          [claims.sub],
        );

        if (membership.rows.length === 0 || membership.rows[0].role !== "LEADER") {
          throw businessError("TEAM-005", "Team leader only.", 403);
        }

        const teamId = membership.rows[0].team_id;

        // 自己譲渡は不正な移譲先として扱う（TC-TEAM-048）。
        if (newLeaderProfileId === claims.sub) {
          throw businessError("TEAM-009", "Invalid transfer target.", 409);
        }

        // 存在しない profile も他チームのメンバーも、同じ「移譲先が不正」である。
        // 別コードにすると、どの profile が実在するかを外部から探れてしまう。
        const target = await tx.queryObject<{ id: string }>(
          `SELECT id FROM team_members WHERE profile_id = $1 AND team_id = $2`,
          [newLeaderProfileId, teamId],
        );

        if (target.rows.length === 0) {
          throw businessError("TEAM-009", "Invalid transfer target.", 409);
        }

        // ★順序が重要である。ux_team_members_leader（team_id / role='LEADER' の
        //   部分UNIQUEインデックス）があるため、先に新LEADERを昇格させると必ず制約違反になる。
        //   現LEADERをMEMBERへ降格してから昇格させる（9.6）。
        await tx.queryObject(
          `UPDATE team_members SET role = 'MEMBER' WHERE profile_id = $1`,
          [claims.sub],
        );
        await tx.queryObject(
          `UPDATE team_members SET role = 'LEADER' WHERE profile_id = $1`,
          [newLeaderProfileId],
        );

        return { leaderId: newLeaderProfileId, teamId };
      },
    );

    await broadcast("team", "TEAM_MEMBER_UPDATED", { teamId: result.teamId });

    return ok({ leaderId: result.leaderId });
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
