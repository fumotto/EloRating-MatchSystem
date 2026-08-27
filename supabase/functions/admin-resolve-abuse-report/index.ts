// ===== supabase/functions/admin-resolve-abuse-report/index.ts =====
// 通報への措置（04_BackendInterface.md 20.3 / ADR-033 ③）。
//
// ★措置はクールダウンとBANに限る。**確定した試合には一切触れない**（ADR-033 ①）。
// ★単発の通報で措置しない。判断は異なるチームからの累積に基づく（ADR-033 ④）。
//   本Functionは管理者が画面上で下した判断を実行するだけである。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { applyCooldown, banTeam } from "../_shared/team-sanction.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

const RESOLUTIONS = ["NO_ACTION", "WARNED", "COOLDOWN", "BANNED"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

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
    const { reportId, resolution, note, cooldownMinutes } = body as {
      reportId?: unknown;
      resolution?: unknown;
      note?: unknown;
      cooldownMinutes?: unknown;
    };

    if (
      typeof reportId !== "string" || typeof resolution !== "string" ||
      !(RESOLUTIONS as readonly string[]).includes(resolution) ||
      (note !== undefined && (typeof note !== "string" || note.length > 1000)) ||
      (resolution === "COOLDOWN" &&
        (typeof cooldownMinutes !== "number" || !Number.isInteger(cooldownMinutes) ||
          cooldownMinutes < 1))
    ) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction(async (tx) => {
      const report = await tx.queryObject<{ status: string; target_team_id: string }>(
        `SELECT status, target_team_id FROM abuse_reports WHERE id = $1`,
        [reportId],
      );
      if (report.rows.length === 0) {
        throw businessError("ABUSE-005", "Report not found.", 404);
      }
      if (report.rows[0].status !== "OPEN") {
        throw businessError("ABUSE-006", "Report already resolved.", 409);
      }

      const targetTeamId = report.rows[0].target_team_id;
      let banned = false;

      if (resolution === "COOLDOWN") {
        await applyCooldown(tx, [targetTeamId], cooldownMinutes as number);
      } else if (resolution === "BANNED") {
        // ★BAN処理を重複実装しない。`admin-ban-team` と共用する（ADR-021 と同じ方針）。
        //   BANは待機列からの削除を伴うため、二箇所に書くと必ずずれる。
        banned = await banTeam(
          tx,
          targetTeamId,
          claims.sub,
          `abuse report ${reportId}${note ? `: ${note}` : ""}`,
        );
        if (!banned) {
          throw businessError("TEAM-001", "Team not found.", 404);
        }
      }
      // ★WARNED はシステム上の効果を持たない。伝達は運営が Discord で行う。

      const updated = await tx.queryObject<{ resolved_at: Date }>(
        `UPDATE abuse_reports
            SET status = $1, resolved_by_profile_id = $2, resolved_at = NOW(), resolution_note = $3
          WHERE id = $4 AND status = 'OPEN'
      RETURNING resolved_at`,
        [resolution, claims.sub, note ?? null, reportId],
      );
      if (updated.rows.length === 0) {
        throw businessError("ABUSE-006", "Report already resolved.", 409);
      }

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'ABUSE_RESOLVED', 'TEAM', $2, $3)`,
        [claims.sub, targetTeamId, JSON.stringify({ reportId, resolution })],
      );

      return {
        reportId,
        status: resolution as Resolution,
        resolvedAt: new Date(updated.rows[0].resolved_at).toISOString(),
        targetTeamId,
        banned,
      };
    });

    if (result.banned) {
      await broadcast("team", "TEAM_UPDATED", { teamId: result.targetTeamId });
    }

    return ok({
      reportId: result.reportId,
      status: result.status,
      resolvedAt: result.resolvedAt,
    });
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
