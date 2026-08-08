// ===== supabase/functions/accept-team-invite/index.ts =====
// 招待によるチーム参加（04_BackendInterface.md 9.4）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { hashInviteCode } from "../_shared/invite.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface AcceptTeamInviteResponse {
  teamId: string;
  teamName: string;
}

interface InviteRow {
  id: string;
  team_id: string;
  status: string;
  expired: boolean;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { inviteCode } = body as { inviteCode?: unknown };

    if (typeof inviteCode !== "string" || inviteCode.length === 0) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const inviteCodeHash = await hashInviteCode(inviteCode);

    const result = await withTransaction<AcceptTeamInviteResponse>(async (tx) => {
      // 照合はハッシュ値で行う。平文はDBに存在しない。
      // 期限判定はDBの NOW() で行う。Edge Function 側の時計に依存させない。
      const invite = await tx.queryObject<InviteRow>(
        `SELECT id, team_id, status, (expires_at <= NOW()) AS expired
         FROM team_invites WHERE invite_code_hash = $1`,
        [inviteCodeHash],
      );

      if (invite.rows.length === 0) {
        throw businessError("INVITE-001", "Invite not found.", 404);
      }

      const { id: inviteId, team_id: teamId, status, expired } = invite.rows[0];

      // 使用済み・取り消し済みは期限より先に判定する。利用者にとって原因が異なるためである。
      if (status === "USED") {
        throw businessError("INVITE-003", "Invite already used.", 409);
      }
      if (status === "REVOKED") {
        throw businessError("INVITE-004", "Invite revoked.", 409);
      }
      // status='EXPIRED' は cleanup-expired-invites が付ける。バッチ実行前でも expired で弾く。
      if (status === "EXPIRED" || expired) {
        throw businessError("INVITE-002", "Invite expired.", 409);
      }

      // ★teams の行ロック。同時参加による定員超過を防ぐ（TC-TEAM-034）。
      //   team_members を数えるだけでは、2つのトランザクションが同じ件数を読んで
      //   双方とも INSERT に成功しうる。参加処理をチーム単位で直列化する。
      const team = await tx.queryObject<{ name: string; is_banned: boolean }>(
        `SELECT name, is_banned FROM teams WHERE id = $1 FOR UPDATE`,
        [teamId],
      );

      if (team.rows.length === 0) {
        throw businessError("TEAM-001", "Team not found.", 404);
      }
      if (team.rows[0].is_banned) {
        throw businessError("TEAM-006", "Team is banned.", 409);
      }

      const existingMembership = await tx.queryObject<{ id: string }>(
        `SELECT id FROM team_members WHERE profile_id = $1`,
        [claims.sub],
      );

      if (existingMembership.rows.length > 0) {
        throw businessError("TEAM-003", "Already in a team.", 409);
      }

      const settings = await tx.queryObject<{ team_max_members: number }>(
        `SELECT team_max_members FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      // 行ロック取得後に数え直す。ここが定員超過を防ぐ最後の関門である。
      const memberCount = await tx.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = $1`,
        [teamId],
      );

      if (memberCount.rows[0].count >= settings.rows[0].team_max_members) {
        throw businessError("TEAM-004", "Team is full.", 409);
      }

      // 参加者は MEMBER である。LEADER は移譲でしか変わらない。
      await tx.queryObject(
        `INSERT INTO team_members (team_id, profile_id, role) VALUES ($1, $2, 'MEMBER')`,
        [teamId, claims.sub],
      );

      // used_at は status='USED' と同時でなければ chk_team_invites_used_at に違反する。
      await tx.queryObject(
        `UPDATE team_invites SET status = 'USED', used_at = NOW(), used_by_profile_id = $1
         WHERE id = $2`,
        [claims.sub, inviteId],
      );

      return { teamId, teamName: team.rows[0].name };
    });

    // コミット成功後に送信する。失敗してもロールバックしない（SYSTEM-003）。
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
