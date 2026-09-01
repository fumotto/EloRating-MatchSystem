// ===== supabase/functions/create-abuse-report/index.ts =====
// 通報の登録（04_BackendInterface.md 20.1 / ADR-033）。
//
// ★通報は勝敗フローから完全に独立している。試合の状態にもレートにも影響しない。
// ★確定した試合の結果は通報によって覆らない（ADR-033 ①）。措置はクールダウンとBANに限る。
// ★単発の通報では措置しない。異なるチームからの累積が判断材料である（ADR-033 ④）。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

const REASON_CODES = ["FALSE_REPORT", "NO_SHOW", "HARASSMENT", "CHEATING", "OTHER"] as const;

interface CreateAbuseReportResponse {
  reportId: string;
  status: "OPEN";
  createdAt: string;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { targetTeamId, reasonCode, detail, matchId, evidenceUrls } = body as {
      targetTeamId?: unknown;
      reasonCode?: unknown;
      detail?: unknown;
      matchId?: unknown;
      evidenceUrls?: unknown;
    };

    if (
      typeof targetTeamId !== "string" || targetTeamId.length === 0 ||
      typeof reasonCode !== "string" ||
      !(REASON_CODES as readonly string[]).includes(reasonCode) ||
      typeof detail !== "string" || detail.length < 10 || detail.length > 1000 ||
      (matchId !== undefined && typeof matchId !== "string")
    ) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    // ★証拠URLは必須ではない（ADR-033 ③）。必須にすると、記録を残していない
    //   正当な訴えが提出すらできず、累積による判断の材料も集まらない。
    let urls: string[] = [];
    if (evidenceUrls !== undefined) {
      if (!Array.isArray(evidenceUrls) || evidenceUrls.length > 3) {
        return businessError("VALIDATION-001", "Invalid input.", 400);
      }
      urls = evidenceUrls as string[];
      for (const u of urls) {
        if (typeof u !== "string" || !u.startsWith("https://") || u.length > 2048) {
          return businessError("VALIDATION-001", "Invalid input.", 400);
        }
      }
    }

    const result = await withTransaction<CreateAbuseReportResponse>(async (tx) => {
      // ★assertUpdatesAllowed を呼ばない（ADR-033 ②）。
      //   通報は勝敗にもレートにも影響しないため、更新の凍結対象ではない。

      // ★所属チームは JWT の sub から導出する。クライアントから受け取ってはならない。
      //   受け取ると通報元チーム数（ADR-033 ④ の m）を偽装でき、判断材料が壊れる。
      //   `team_members` は UNIQUE (profile_id) を持つため一意に定まる。
      const own = await tx.queryObject<{ team_id: string }>(
        `SELECT team_id FROM team_members WHERE profile_id = $1`,
        [claims.sub],
      );
      const reporterTeamId = own.rows[0]?.team_id ?? null;

      const target = await tx.queryObject<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [targetTeamId],
      );
      if (target.rows.length === 0) {
        throw businessError("ABUSE-001", "Target team not found.", 404);
      }
      if (reporterTeamId !== null && reporterTeamId === targetTeamId) {
        throw businessError("ABUSE-002", "Cannot report your own team.", 400);
      }

      if (matchId !== undefined) {
        // ★参加チームであることを要求しない。第三者が観戦して気付いた事象も通報できる。
        const match = await tx.queryObject<{ id: string }>(
          `SELECT id FROM matches WHERE id = $1`,
          [matchId],
        );
        if (match.rows.length === 0) {
          throw businessError("MATCH-001", "Match not found.", 404);
        }

        const dup = await tx.queryObject<{ id: string }>(
          `SELECT id FROM abuse_reports
            WHERE reporter_team_id IS NOT DISTINCT FROM $1
              AND target_team_id = $2 AND match_id = $3 AND status <> 'WITHDRAWN'`,
          [reporterTeamId, targetTeamId, matchId],
        );
        if (dup.rows.length > 0) {
          throw businessError("ABUSE-003", "Already reported for this match.", 409);
        }
      } else {
        // 試合を伴わない通報は部分UNIQUEで縛れないため、頻度で制限する。
        const recent = await tx.queryObject<{ id: string }>(
          `SELECT id FROM abuse_reports
            WHERE reporter_profile_id = $1 AND target_team_id = $2
              AND match_id IS NULL AND status <> 'WITHDRAWN'
              AND created_at > NOW() - interval '1 day'`,
          [claims.sub, targetTeamId],
        );
        if (recent.rows.length > 0) {
          throw businessError("ABUSE-004", "Reporting too frequently.", 409);
        }
      }

      const inserted = await tx.queryObject<{ id: string; created_at: Date }>(
        `INSERT INTO abuse_reports
           (target_team_id, reporter_profile_id, reporter_team_id, match_id,
            reason_code, detail, evidence_urls)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at`,
        [targetTeamId, claims.sub, reporterTeamId, matchId ?? null, reasonCode, detail, urls],
      );

      // ★target_type は TEAM を用いる。通報の対象はチームであり、audit_logs の
      //   CHECK 制約を変更せずに正しく表現できる。
      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'ABUSE_REPORTED', 'TEAM', $2, $3)`,
        [
          claims.sub,
          targetTeamId,
          JSON.stringify({ reportId: inserted.rows[0].id, reasonCode }),
        ],
      );

      return {
        reportId: inserted.rows[0].id,
        status: "OPEN" as const,
        createdAt: new Date(inserted.rows[0].created_at).toISOString(),
      };
    });

    // ★Realtime通知を送らない。通報の発生を対象にも他人にも知らせない。
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
