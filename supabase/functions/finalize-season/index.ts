// ===== supabase/functions/finalize-season/index.ts =====
// シーズンの確定（Issue #9 / 04_BackendInterface.md 12.7）。
//
// ★cron から呼ぶ。猶予は数分から数十分に及び、admin-end-season の実行中には待てない。
//   猶予が切れていなければ何もせず戻る。管理者の操作は不要である。
//
// ★1トランザクションで行う。退避とリセットが別々に成立すると、
//   シーズン別ランキングと現在のレートのどちらが正なのか分からなくなる。
//
// ★チームの削除はここでは行わない。matches.team_a_id は ON DELETE RESTRICT であり、
//   戦績が残っている限りチームを消せない。総解散は戦績の削除後に
//   admin-purge-season-data が行う（Issue #9 の並びから変更した理由は 12.8）。
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, systemError } from "../_shared/response.ts";

interface FinalizeSeasonResponse {
  finalized: boolean;
  season?: number;
  drawnMatches?: number;
  snapshotTeams?: number;
  resetTeams?: number;
  nextSeason?: number;
}

export async function handler(_req: Request): Promise<Response> {
  try {
    const result = await withTransaction<FinalizeSeasonResponse>(async (tx) => {
      // ★多重起動しても二重に確定しないよう、シーズン行を取り合う。
      const season = await tx.queryObject<{
        number: number;
        grace_until: Date | null;
      }>(
        `SELECT number, grace_until
           FROM seasons
          WHERE status = 'ENDING'
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
      );

      if (season.rows.length === 0) {
        return { finalized: false };
      }

      const { number, grace_until } = season.rows[0];

      if (!grace_until || grace_until.getTime() > Date.now()) {
        // 猶予中である。進行中の試合が自然に決着するのを待つ。
        return { finalized: false };
      }

      // ---- ① 残った試合を引き分けで終わらせる ----
      //
      // ★猶予を過ぎても決着していない試合は、当事者が戻ってこないものとみなす。
      //   レートは動かさない。片方だけ有利にする根拠が無い（08 4章）。
      const drawn = await tx.queryObject<{ id: string }>(
        `UPDATE matches
            SET status = 'DRAWN',
                winner_team_id = NULL,
                completed_at = NOW(),
                version = version + 1
          WHERE status NOT IN ('COMPLETED', 'DRAWN')
        RETURNING id`,
      );

      // ---- ② 利用者側の更新を止める ----
      //
      // ★退避の直前に閉じる。ここから先はレートも編成も動かない。
      await tx.queryObject(`UPDATE system_settings SET updates_locked = TRUE`);

      // ---- ③ ランキングとBAN状況を退避する ----
      //
      // ★team_ranking_view は使わない。同Viewは BAN チームを除くが、
      //   退避は BAN 状況そのものを残すことが目的である（Issue #9）。
      await tx.queryObject(
        `INSERT INTO season_rankings
           (season_number, team_id, team_name, rating, rank, wins, losses, matches, win_rate, is_banned)
         SELECT
           $1,
           t.id,
           t.name,
           t.rating,
           RANK() OVER (ORDER BY t.rating DESC),
           COALESCE(h.wins, 0),
           COALESCE(h.losses, 0),
           COALESCE(h.wins, 0) + COALESCE(h.losses, 0),
           COALESCE(h.wins, 0)::NUMERIC
             / NULLIF(COALESCE(h.wins, 0) + COALESCE(h.losses, 0), 0),
           t.is_banned
         FROM teams t
         LEFT JOIN (
           SELECT team_id,
                  COUNT(*) FILTER (WHERE result = 'WIN')  AS wins,
                  COUNT(*) FILTER (WHERE result = 'LOSE') AS losses
             FROM rating_history
            GROUP BY team_id
         ) h ON h.team_id = t.id`,
        [number],
      );

      const snapshot = await tx.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM season_rankings WHERE season_number = $1`,
        [number],
      );

      // ---- ④ チーム編成を退避する ----
      //
      // ★総解散でチームが消えても、誰が所属していたのかを残す。
      await tx.queryObject(
        `INSERT INTO season_members (season_number, team_id, profile_id, display_name, role)
         SELECT $1, tm.team_id, tm.profile_id, p.display_name, tm.role
           FROM team_members tm
           JOIN profiles p ON p.id = tm.profile_id`,
        [number],
      );

      // ---- ⑤ 招待をすべて削除する ----
      //
      // ★次シーズンへ持ち越さない。総解散を選んだ場合、消えたチームへの
      //   招待コードが生き残る。
      await tx.queryObject(`DELETE FROM team_invites`);

      // ---- ⑥ レートを初期値へ戻す ----
      const settings = await tx.queryObject<{ initial_rating: number }>(
        `SELECT initial_rating FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const reset = await tx.queryObject<{ id: string }>(
        `UPDATE teams SET rating = $1, updated_at = NOW() RETURNING id`,
        [settings.rows[0].initial_rating],
      );

      // ---- ⑦ シーズンを閉じ、番号を進める ----
      await tx.queryObject(
        `UPDATE seasons SET status = 'FINALIZED', ended_at = NOW() WHERE number = $1`,
        [number],
      );

      const next = number + 1;
      await tx.queryObject(`INSERT INTO seasons (number, status) VALUES ($1, 'ACTIVE')`, [next]);
      await tx.queryObject(`UPDATE system_settings SET current_season = $1`, [next]);

      await tx.queryObject(
        `INSERT INTO audit_logs (action, target_type, target_id, payload)
         VALUES ('SEASON_FINALIZED', 'SETTINGS', $1, $2)`,
        [
          String(number),
          JSON.stringify({
            drawnMatches: drawn.rows.length,
            snapshotTeams: snapshot.rows[0].count,
            resetTeams: reset.rows.length,
            nextSeason: next,
          }),
        ],
      );

      return {
        finalized: true,
        season: number,
        drawnMatches: drawn.rows.length,
        snapshotTeams: snapshot.rows[0].count,
        resetTeams: reset.rows.length,
        nextSeason: next,
      };
    });

    if (result.finalized) {
      // ★引き分けにした試合の当事者へ個別には送らない。件数が読めないためである。
      //   画面はシーズンの状態変化を受けて再取得する。
      await broadcast("system", "SEASON_STATE_CHANGED", {
        season: result.season,
        status: "FINALIZED",
      });
      await broadcast("ranking", "RANKING_UPDATED", {});
    }

    return ok(result);
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    return systemError("SYSTEM-001", "Internal server error.");
  }
}

export { setDbPool, resetDbPool } from "../_shared/db.ts";
export { setBroadcaster, resetBroadcaster } from "../_shared/realtime.ts";

if (import.meta.main) {
  // ★内部処理専用である。CORSラッパを付けない（4.2）。
  Deno.serve(handler);
}
