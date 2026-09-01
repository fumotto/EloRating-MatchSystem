// ===== supabase/functions/auto-resolve-matches/index.ts =====
// 期限超過した試合の自動解決（04_BackendInterface.md 21.6 / ADR-014 / ADR-032 / ADR-034）。
//
// 処理は4種類である。
//   ① 報告期限切れ（PLAYING）              → DRAWN / REPORT_TIMEOUT   両チームにクールダウン
//   ② 不成立の申請へ無応答（PLAYING）        → DRAWN / NO_SHOW         無応答側のみ
//   ③ 承認期限切れ・競合なし（WINNER_REPORTED）→ COMPLETED（自動承認）    放置した敗者側のみ
//   ④ 承認期限切れ・競合あり（WINNER_REPORTED）→ DRAWN / CONFLICT       両チームにクールダウン
//
// ★③の条件に `counter_claim_team_id IS NULL` を必ず含めること。含めないと、矛盾する
//   2つの主張があるにもかかわらず先に申告した側で確定してしまい、**早く嘘をついた側が勝つ。**
import { isServiceRole } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { completeMatch } from "../_shared/match-completion.ts";
import { applyCooldown, getCooldownMinutes } from "../_shared/team-sanction.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";

interface AutoResolveResponse {
  drawnCount: number;
  noShowCount: number;
  conflictCount: number;
  autoApprovedCount: number;
}

interface ExpiredMatch {
  id: string;
  team_a_id: string;
  team_b_id: string;
  winner_team_id: string | null;
  no_contest_requested_by_team_id: string | null;
  version: number;
}

export async function handler(req: Request): Promise<Response> {
  try {
    if (!isServiceRole(req)) {
      return businessError("AUTH-004", "Forbidden.", 403);
    }

    // 対象の抽出は1つのトランザクションで行い、確定は試合ごとに分ける。
    // 1件の失敗が他の試合を巻き込まないようにするためである（11.2）。
    const targets = await withTransaction(async (tx) => {
      const cols = `id, team_a_id, team_b_id, winner_team_id,
                    no_contest_requested_by_team_id, version`;

      // ② 無応答による解散。★2つの条件は AND である。
      //    どちらか一方では、対戦直後の申請が相手の短い離席で成立してしまう（ADR-032 ⑧）。
      const noShow = await tx.queryObject<ExpiredMatch>(
        `SELECT ${cols} FROM matches m
          WHERE m.status = 'PLAYING'
            AND m.no_contest_requested_at IS NOT NULL
            AND m.started_at
                + ((SELECT no_show_minutes FROM system_settings LIMIT 1) || ' minutes')::interval
                < NOW()
            AND m.no_contest_requested_at
                + ((SELECT no_show_response_minutes FROM system_settings LIMIT 1) || ' minutes')::interval
                < NOW()`,
      );

      const expiredReport = await tx.queryObject<ExpiredMatch>(
        `SELECT ${cols} FROM matches
          WHERE status = 'PLAYING' AND report_deadline_at < NOW()`,
      );

      const expiredApprove = await tx.queryObject<ExpiredMatch>(
        `SELECT ${cols} FROM matches
          WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW()
            AND counter_claim_team_id IS NULL`,
      );

      const conflicted = await tx.queryObject<ExpiredMatch>(
        `SELECT ${cols} FROM matches
          WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW()
            AND counter_claim_team_id IS NOT NULL`,
      );

      return {
        noShow: noShow.rows,
        drawn: expiredReport.rows,
        autoApprove: expiredApprove.rows,
        conflict: conflicted.rows,
      };
    });

    const noShowIds: string[] = [];
    const drawnIds: string[] = [];
    const conflictIds: string[] = [];
    const completedIds: string[] = [];

    // 共通の解散処理。cooldownTeamIds に挙げたチームだけがクールダウンを負う。
    const resolveDrawn = async (
      match: ExpiredMatch,
      reason: "REPORT_TIMEOUT" | "NO_SHOW" | "CONFLICT",
      fromStatus: "PLAYING" | "WINNER_REPORTED",
      cooldownTeamIds: string[],
      extraWhere: string,
      action: string,
    ): Promise<boolean> => {
      return await withTransaction(async (tx) => {
        // ★advisory lock で試合ごとに直列化する。多重起動しても二重処理にならない。
        await tx.queryObject(`SELECT pg_advisory_xact_lock(hashtext('auto-resolve'), $1::int)`, [
          hashToInt(match.id),
        ]);

        // ★CONFLICT では winner_team_id を NULL にするが、reported_by_profile_id /
        //   counter_claim_team_id は残す。誰がどちらを主張したかは通報の判断材料になる。
        const updated = await tx.queryObject<{ id: string }>(
          `UPDATE matches
              SET status = 'DRAWN',
                  no_contest_reason = $4,
                  winner_team_id = NULL,
                  completed_at = NOW(),
                  no_contest_requested_by_team_id = NULL,
                  no_contest_requested_at = NULL,
                  no_contest_reason_code = NULL,
                  version = version + 1
            WHERE id = $1 AND version = $2 AND status = $3 ${extraWhere}
        RETURNING id`,
          [match.id, match.version, fromStatus, reason],
        );

        if (updated.rows.length === 0) return false;

        await applyCooldown(tx, cooldownTeamIds, await getCooldownMinutes(tx));

        await tx.queryObject(
          `INSERT INTO audit_logs (action, target_type, target_id, payload)
           VALUES ($1, 'MATCH', $2, $3)`,
          [action, match.id, JSON.stringify({ reason })],
        );

        return true;
      });
    };

    // ② 無応答による解散。★申請側にクールダウンを課さない。妨害の被害者だからである。
    for (const match of targets.noShow) {
      try {
        const silent = match.no_contest_requested_by_team_id === match.team_a_id
          ? match.team_b_id
          : match.team_a_id;
        const done = await resolveDrawn(
          match,
          "NO_SHOW",
          "PLAYING",
          [silent],
          `AND no_contest_requested_at IS NOT NULL`,
          "MATCH_NO_SHOW_DRAWN",
        );
        if (done) noShowIds.push(match.id);
      } catch (e) {
        logFailure("auto-resolve-matches", match.id, e);
      }
    }

    // ① 報告期限切れ → ドロー解散。両チームにクールダウン。
    for (const match of targets.drawn) {
      try {
        const done = await resolveDrawn(
          match,
          "REPORT_TIMEOUT",
          "PLAYING",
          [match.team_a_id, match.team_b_id],
          `AND report_deadline_at < NOW()`,
          "MATCH_DRAWN",
        );
        if (done) drawnIds.push(match.id);
      } catch (e) {
        logFailure("auto-resolve-matches", match.id, e);
      }
    }

    // ④ 競合したまま承認期限切れ → CONFLICT。両チームにクールダウン。
    for (const match of targets.conflict) {
      try {
        const done = await resolveDrawn(
          match,
          "CONFLICT",
          "WINNER_REPORTED",
          [match.team_a_id, match.team_b_id],
          `AND counter_claim_team_id IS NOT NULL`,
          "MATCH_CONFLICT_DRAWN",
        );
        if (done) conflictIds.push(match.id);
      } catch (e) {
        logFailure("auto-resolve-matches", match.id, e);
      }
    }

    // ③ 承認期限切れ → 自動承認。★放置した敗者側にのみクールダウンを課す。
    for (const match of targets.autoApprove) {
      if (match.winner_team_id === null) continue; // 制約上ありえないが、念のため飛ばす。

      const loserTeamId = match.winner_team_id === match.team_a_id
        ? match.team_b_id
        : match.team_a_id;

      try {
        const completed = await withTransaction(async (tx) => {
          await tx.queryObject(`SELECT pg_advisory_xact_lock(hashtext('auto-resolve'), $1::int)`, [
            hashToInt(match.id),
          ]);

          // approvedByProfileId は null。auto_approved = TRUE で確定する。
          const done = await completeMatch(
            tx,
            {
              matchId: match.id,
              winnerTeamId: match.winner_team_id!,
              loserTeamId,
              version: match.version,
            },
            null,
          );

          if (done === null) return false;

          // 放置は無料ではない。ただし勝者側には課さない（ADR-032 ④）。
          await applyCooldown(tx, [loserTeamId], await getCooldownMinutes(tx));
          return true;
        });

        if (completed) completedIds.push(match.id);
      } catch (e) {
        logFailure("auto-resolve-matches", match.id, e);
      }
    }

    // コミット後に通知する。
    for (const matchId of [...drawnIds, ...noShowIds, ...conflictIds]) {
      await broadcast("match", "MATCH_DRAWN", { matchId });
    }
    for (const matchId of completedIds) {
      await broadcast("match", "MATCH_COMPLETED", { matchId });
    }
    if (completedIds.length > 0) {
      await broadcast("ranking", "RANKING_UPDATED", { count: completedIds.length });
    }

    const response: AutoResolveResponse = {
      drawnCount: drawnIds.length,
      noShowCount: noShowIds.length,
      conflictCount: conflictIds.length,
      autoApprovedCount: completedIds.length,
    };

    return ok(response);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

// advisory lock の第2引数は int である。UUIDをそのまま渡せないため32bitへ畳む。
function hashToInt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return hash;
}

// 17章のログ方針。個人情報・トークンは出力しない。
function logFailure(fn: string, matchId: string, e: unknown) {
  console.error(
    JSON.stringify({
      function: fn,
      matchId,
      result: "NG",
      errorCode: "SYSTEM-001",
      message: e instanceof Error ? e.message : String(e),
    }),
  );
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setBroadcaster, resetBroadcaster } from "../_shared/realtime.ts";

if (import.meta.main) {
  Deno.serve(handler);
}
