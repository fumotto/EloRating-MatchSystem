// ===== supabase/functions/create-team-invite/index.ts =====
// 招待発行（04_BackendInterface.md 9.3）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { assertUpdatesAllowed } from "../_shared/season.ts";
import { generateInviteCode, hashInviteCode } from "../_shared/invite.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface CreateTeamInviteResponse {
  inviteCode: string;
  expiresAt: string;
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

    // 平文はトランザクション外で生成してよい。DBへ入るのはハッシュだけである。
    const inviteCode = generateInviteCode();
    const inviteCodeHash = await hashInviteCode(inviteCode);

    const result = await withTransaction<CreateTeamInviteResponse>(async (tx) => {
      // シーズン切替中は利用者側の更新を止める（06_ErrorCode.md 13.1）。
      await assertUpdatesAllowed(tx);

      // LEADER確認。指定チームのLEADERであることを1問い合わせで確かめる。
      const membership = await tx.queryObject<{ role: string }>(
        `SELECT role FROM team_members WHERE profile_id = $1 AND team_id = $2`,
        [claims.sub, teamId],
      );

      if (membership.rows.length === 0 || membership.rows[0].role !== "LEADER") {
        throw businessError("TEAM-005", "Team leader only.", 403);
      }

      // BAN確認。チームの存在確認も兼ねる。
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

      const settings = await tx.queryObject<{
        team_max_members: number;
        invite_expiration_hours: number;
      }>(
        `SELECT team_max_members, invite_expiration_hours FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const { team_max_members, invite_expiration_hours } = settings.rows[0];

      const memberCount = await tx.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = $1`,
        [teamId],
      );

      if (memberCount.rows[0].count >= team_max_members) {
        throw businessError("TEAM-004", "Team is full.", 409);
      }

      // 旧招待の失効。平文を再現できないため既存招待は返さず、必ず作り直す（9.3）。
      // ★先に REVOKED にしないと ux_team_invites_active（team_id / status='ACTIVE' の
      //   部分UNIQUEインデックス）に衝突して INSERT が失敗する。
      await tx.queryObject(
        `UPDATE team_invites SET status = 'REVOKED' WHERE team_id = $1 AND status = 'ACTIVE'`,
        [teamId],
      );

      // 有効期限は system_settings.invite_expiration_hours から算出する。ハードコードしない。
      const inserted = await tx.queryObject<{ expires_at: Date }>(
        `INSERT INTO team_invites (team_id, invite_code_hash, created_by_profile_id, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::interval)
         RETURNING expires_at`,
        [teamId, inviteCodeHash, claims.sub, String(invite_expiration_hours)],
      );

      if (inserted.rows.length === 0) {
        throw systemError("SYSTEM-001", "Failed to create the invite.");
      }

      return {
        inviteCode,
        expiresAt: new Date(inserted.rows[0].expires_at).toISOString(),
      };
    });

    return ok(result);
  } catch (e) {
    if (e instanceof Response) {
      return e; // 業務エラー。ROLLBACKは済んでいる。
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setJwtVerifier, resetJwtVerifier } from "../_shared/auth.ts";

if (import.meta.main) {
  Deno.serve(withCors(handler));
}
