// ===== supabase/functions/create-team/index.ts =====
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface CreateTeamRequest {
  name: string;
}

interface CreateTeamResponse {
  teamId: string;
  name: string;
  rating: number;
}

// teams の行。応答DTOは `teamId`、DBの列は `id` であり別物である。
interface TeamRow {
  id: string;
  name: string;
  rating: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json();
    const { name } = body;

    // 入力バリデーション
    if (typeof name !== "string") {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    if (name.length < 1 || name.length > 30) {
      return businessError("VALIDATION-003", "Input out of range.", 400);
    }

    const result = await withTransaction(async (tx) => {
      // 所属確認（team_members に自分が存在しないこと）
      const existingMembership = await tx.queryObject<{ id: string }>(
        `SELECT id FROM team_members WHERE profile_id = $1`,
        [claims.sub]
      );

      if (existingMembership.rows.length > 0) {
        throw businessError("TEAM-003", "Already in a team.", 409);
      }

      // system_settings.initial_rating 取得
      const initialRatingResult = await tx.queryObject<{ initial_rating: number }>(
        `SELECT initial_rating FROM system_settings LIMIT 1`
      );

      if (initialRatingResult.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const initialRating = initialRatingResult.rows[0].initial_rating;

      // teams INSERT
      const teamInsertResult = await tx.queryObject<TeamRow>(
        `INSERT INTO teams (name, rating) VALUES ($1, $2) RETURNING id, name, rating`,
        [name, initialRating]
      );

      if (teamInsertResult.rows.length === 0) {
        throw systemError("SYSTEM-001", "Failed to create the team.");
      }

      const team = teamInsertResult.rows[0];

      // team_members INSERT（role = 'LEADER'）
      await tx.queryObject(
        `INSERT INTO team_members (team_id, profile_id, role) VALUES ($1, $2, 'LEADER')`,
        [team.id, claims.sub]
      );

      // audit_logs INSERT（TEAM_CREATED）
      // 列は actor_profile_id / action / target_type / target_id / payload（ADR-017、03_Database.md 10.9）。
      // audit_logs は業務テーブルと外部キーで結合せず、対象を target_type + target_id で表す。
      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id) VALUES ($1, 'TEAM_CREATED', 'TEAM', $2)`,
        [claims.sub, team.id]
      );

      return {
        teamId: team.id,
        name: team.name,
        rating: team.rating,
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
  Deno.serve(handler);
}