// ===== supabase/functions/admin-export-season-data/index.ts =====
// 戦績・ログの持ち出し（Issue #9 / 04_BackendInterface.md 12.8）。
//
// ★個人を特定できる列を返さない。profile_id と表示名は含めず、
//   チーム単位の情報に留める。持ち出したファイルは管理者の手元に残り、
//   本システムの管理下から出るためである。
//
// ★持ち出しを season_exports へ記録する。削除の安全弁として使う（SEASON-005）。
//   audit_logs には置かない。ログの削除は本機能の対象であり、
//   そこへ置くと削除の可否を判断する根拠ごと消える。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

type ExportKind = "MATCHES" | "LOGS";

interface ExportResponse {
  season: number;
  kind: ExportKind;
  rowCount: number;
  rows: Record<string, unknown>[];
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }
    if (!isAdmin(claims)) {
      return businessError("ADMIN-001", "Administrator role required.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const { kind } = body as { kind?: unknown };

    if (kind !== "MATCHES" && kind !== "LOGS") {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<ExportResponse>(async (tx) => {
      const settings = await tx.queryObject<{ current_season: number }>(
        `SELECT current_season FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      // ★確定済みの直前シーズンを対象とする。current_season は既に次の番号である。
      const target = settings.rows[0].current_season - 1;

      const season = await tx.queryObject<{ status: string }>(
        `SELECT status FROM seasons WHERE number = $1`,
        [target],
      );

      if (season.rows.length === 0 || season.rows[0].status !== "FINALIZED") {
        throw businessError("SEASON-003", "No finalized season to export.", 409);
      }

      let rows: Record<string, unknown>[];

      if (kind === "MATCHES") {
        // ★申告者・承認者のIDは含めない。誰が押したかは個人の行動記録である。
        //   自動承認だったかどうかは運用の分析に要るため残す。
        const data = await tx.queryObject<Record<string, unknown>>(
          `SELECT
             m.id,
             ta.name AS team_a_name,
             tb.name AS team_b_name,
             tw.name AS winner_team_name,
             m.status,
             m.auto_approved,
             m.reject_count,
             m.started_at,
             m.completed_at,
             rh_a.before_rating AS team_a_before_rating,
             rh_a.after_rating  AS team_a_after_rating,
             rh_b.before_rating AS team_b_before_rating,
             rh_b.after_rating  AS team_b_after_rating,
             rh_a.k_value
           FROM matches m
           JOIN teams ta ON ta.id = m.team_a_id
           JOIN teams tb ON tb.id = m.team_b_id
           LEFT JOIN teams tw ON tw.id = m.winner_team_id
           LEFT JOIN rating_history rh_a ON rh_a.match_id = m.id AND rh_a.team_id = m.team_a_id
           LEFT JOIN rating_history rh_b ON rh_b.match_id = m.id AND rh_b.team_id = m.team_b_id
          ORDER BY m.created_at`,
        );
        rows = data.rows;
      } else {
        // ★actor_profile_id は含めない。誰が何をしたかの対応表になる。
        //   payload も返さない。チーム名や理由が入りうる自由記述である。
        const data = await tx.queryObject<Record<string, unknown>>(
          `SELECT id, action, target_type, created_at
             FROM audit_logs
            ORDER BY created_at`,
        );
        rows = data.rows;
      }

      await tx.queryObject(
        `INSERT INTO season_exports (season_number, kind, actor_profile_id, row_count)
         VALUES ($1, $2, $3, $4)`,
        [target, kind, claims.sub, rows.length],
      );

      return { season: target, kind, rowCount: rows.length, rows };
    });

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

if (import.meta.main) {
  Deno.serve(withCors(handler));
}
