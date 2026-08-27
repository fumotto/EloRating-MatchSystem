// ===== supabase/functions/extend-match-deadline/index.ts =====
// 報告期限の延長（04_BackendInterface.md 21.4 / ADR-032 ⑦）。
//
// ★`report_timeout_minutes` の固定値を延ばす案は採らない。
//   固定値を延ばすと妨害の効果時間がそのまま延びる。
//   長い対戦は当事者の宣言で扱い、沈黙は短い期限で打ち切る。
import { verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { assertUpdatesAllowed } from "../_shared/season.ts";
import {
  assertPlaying,
  clearNoContestRequest,
  loadMatch,
  resolveOwnTeam,
} from "../_shared/match-guard.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface ExtendMatchDeadlineResponse {
  reportDeadlineAt: string;
  extensionCount: number;
  remainingExtensions: number;
  version: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const claims = await verifyJwt(req);
    if (!claims) {
      return businessError("AUTH-001", "Authentication required.", 401);
    }

    const body = await req.json().catch(() => ({}));
    const { matchId, version } = body as { matchId?: unknown; version?: unknown };

    if (typeof matchId !== "string" || typeof version !== "number" || !Number.isInteger(version)) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<ExtendMatchDeadlineResponse>(async (tx) => {
      await assertUpdatesAllowed(tx);

      const match = await loadMatch(tx, matchId);
      assertPlaying(match);

      // 延長はいずれの参加チームからでも行える。
      await resolveOwnTeam(tx, claims.sub, match);

      const settings = await tx.queryObject<{
        report_extension_minutes: number;
        max_report_extensions: number;
      }>(
        `SELECT report_extension_minutes, max_report_extensions FROM system_settings LIMIT 1`,
      );
      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }
      const { report_extension_minutes, max_report_extensions } = settings.rows[0];

      if (match.report_extension_count >= max_report_extensions) {
        throw businessError("MATCH-010", "Extension limit reached.", 409);
      }

      // ★現在時刻からではなく、既存の期限から加算する。
      //   現在時刻を起点にすると、期限の直前に延長するのと直後に延長するのとで
      //   得られる猶予が変わり、期限際の駆け引きを生む。
      const updated = await tx.queryObject<{
        report_deadline_at: Date;
        report_extension_count: number;
        version: number;
      }>(
        `UPDATE matches
            SET report_deadline_at = report_deadline_at + ($1 || ' minutes')::interval,
                report_extension_count = report_extension_count + 1,
                version = version + 1
          WHERE id = $2 AND version = $3 AND status = 'PLAYING'
      RETURNING report_deadline_at, report_extension_count, version`,
        [String(report_extension_minutes), matchId, version],
      );

      if (updated.rows.length === 0) {
        throw businessError("MATCH-008", "Conflicting operation.", 409);
      }

      // 延長は不成立の申請に対する「応答」でもある（ADR-032 ⑧）。
      await clearNoContestRequest(tx, matchId);

      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'MATCH_EXTENDED', 'MATCH', $2, $3)`,
        [claims.sub, matchId, JSON.stringify({ minutes: report_extension_minutes })],
      );

      const row = updated.rows[0];
      return {
        reportDeadlineAt: new Date(row.report_deadline_at).toISOString(),
        extensionCount: row.report_extension_count,
        remainingExtensions: max_report_extensions - row.report_extension_count,
        version: row.version,
      };
    });

    await broadcast("match", "MATCH_EXTENDED", { matchId });

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
