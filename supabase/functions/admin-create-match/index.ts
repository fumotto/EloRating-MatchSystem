// ===== supabase/functions/admin-create-match/index.ts =====
// 管理者による対戦カードの作成（04_BackendInterface.md 12.11 / ADR-035 ⑤ / ADR-039）。
//
// ★待機列を経由しない試合の生成経路である。ADR-035 ④ が要求するとおり、
//   待機列と進行中の試合に関する判定は**この関数が自前で行う**。DBは肩代わりしない。
//   ただし「進行中の試合を持つチームを弾く」判定は行わない。1チームへ複数の試合を
//   同時に割り当てられることが本機能の目的である（ADR-035 ⑤）。
//
// ★自動マッチングの公平の仕組みには拘束されない（ADR-035 ⑤ / ADR-039 ②）。
//   `match_avoidance`・`queue_cooldown_until`・`match_rating_range` のいずれも見ない。
//   大会・イベントでは実力差のあるカードも、回線相性のあるペアも組む必要がある。
import { isAdmin, verifyJwt } from "../_shared/auth.ts";
import { withTransaction } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";
import { ok, businessError, systemError } from "../_shared/response.ts";
import { withCors } from "../_shared/cors.ts";

interface AdminCreateMatchResponse {
  matchId: string;
  teamAId: string;
  teamBId: string;
  reportDeadlineAt: string;
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
    const { teamAId, teamBId } = body as { teamAId?: unknown; teamBId?: unknown };

    if (typeof teamAId !== "string" || typeof teamBId !== "string") {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }
    // 自分自身とは組めない。DBにも chk_matches_teams_different があるが、
    // ここで弾かないと原因が VALIDATION-001 ではなく SYSTEM-001 になる。
    if (teamAId === teamBId) {
      return businessError("VALIDATION-001", "Invalid input.", 400);
    }

    const result = await withTransaction<AdminCreateMatchResponse>(async (tx) => {
      // ★停止フラグには従う（ADR-039 ③）。拘束されないのはペア単位・チーム単位の
      //   公平の仕組みだけであり、停止は「いま試合を始めるべきでない」という
      //   全体の宣言である。管理者による用意もその宣言の対象に含まれる。
      const settings = await tx.queryObject<{
        report_timeout_minutes: number;
        matchmaking_paused: boolean;
        maintenance_paused: boolean;
        updates_locked: boolean;
      }>(
        `SELECT report_timeout_minutes, matchmaking_paused, maintenance_paused, updates_locked
           FROM system_settings LIMIT 1`,
      );

      if (settings.rows.length === 0) {
        throw systemError("SYSTEM-001", "System settings not found.");
      }

      const { report_timeout_minutes, matchmaking_paused, maintenance_paused, updates_locked } =
        settings.rows[0];

      // ★確定処理の最中に作ると、finalize-season の強制引き分けに巻き込まれ、
      //   用意した直後に SEASON_END で打ち切られる（ADR-038 ①）。
      if (updates_locked) {
        throw businessError("SEASON-001", "Updates are locked during the season change.", 409);
      }
      // ★猶予中に作ると、進行中の試合が尽きるのを待つ猶予がいつまでも終わらない。
      if (matchmaking_paused) {
        throw businessError("SEASON-002", "Matchmaking is paused.", 409);
      }
      // ★ゲーム側が止まっている間に作るのは、ADR-034 ⑥ の手順（停止 → 無効化）と矛盾する。
      if (maintenance_paused) {
        throw businessError("QUEUE-007", "Matchmaking is under maintenance.", 409);
      }

      // 両チームをまとめて読む。ID順に並べるのは、同時実行時のデッドロックを避けるためである
      // （completeMatch と同じ方針 / _shared/match-completion.ts）。
      const teams = await tx.queryObject<{
        id: string;
        is_banned: boolean;
        member_count: number;
      }>(
        `SELECT t.id,
                t.is_banned,
                (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id = t.id) AS member_count
           FROM teams t
          WHERE t.id = ANY($1)
          ORDER BY t.id
          FOR UPDATE OF t`,
        [[teamAId, teamBId]],
      );

      if (teams.rows.length !== 2) {
        throw businessError("TEAM-001", "Team not found.", 404);
      }

      for (const team of teams.rows) {
        // BANチームは対戦できない。BANは編成も対戦も凍結する措置である（04 12.1）。
        if (team.is_banned) {
          throw businessError("TEAM-006", "Team is banned.", 409);
        }
        // ★メンバーが1人も居ないチームは組めない（ADR-039 ④）。
        //   誰も申告・投了・承認できないため、報告期限まで相手を拘束したうえで
        //   引き分けに終わる。最後の1人が抜けてもチームは残る仕様である（04 9.5）。
        //
        // ★必須人数（team_max_members）は要求しない。あれは待機列への入り口の条件であり
        //   （09 4.1）、管理者による用意は待機列を経由しない。人数の不揃いは画面で示し、
        //   組むかどうかは管理者が判断する。
        if (team.member_count === 0) {
          throw businessError("TEAM-011", "Team has no members.", 409);
        }
      }

      // report_deadline_at は必ず設定する。無いと auto-resolve-matches が対象を判定できない
      // （09 14章）。用意した試合も通常の確定フローに従う（ADR-035 ⑤）。
      const inserted = await tx.queryObject<{ id: string; report_deadline_at: Date }>(
        `INSERT INTO matches (team_a_id, team_b_id, status, report_deadline_at)
         VALUES ($1, $2, 'PLAYING', NOW() + ($3 || ' minutes')::interval)
         RETURNING id, report_deadline_at`,
        [teamAId, teamBId, String(report_timeout_minutes)],
      );

      const row = inserted.rows[0];

      // ★MATCH_CREATED と分ける（ADR-039 ⑦）。自動成立と管理者による用意は
      //   由来が違う。同じ action にすると、後から「誰が用意した試合か」を数えられない。
      //   自動成立は actor が NULL であり、こちらは管理者が入る。
      await tx.queryObject(
        `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
         VALUES ($1, 'MATCH_PREPARED', 'MATCH', $2, $3)`,
        [claims.sub, row.id, JSON.stringify({ teamAId, teamBId })],
      );

      return {
        matchId: row.id,
        teamAId,
        teamBId,
        reportDeadlineAt: new Date(row.report_deadline_at).toISOString(),
      };
    });

    // 通常の成立と同じ通知を出す。受け取る側は試合を再取得するだけであり、
    // 由来によって扱いを変えない（04 14章）。
    await broadcast("match", "MATCH_CREATED", {
      matchId: result.matchId,
      teamAId: result.teamAId,
      teamBId: result.teamBId,
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
export { setBroadcaster, resetBroadcaster } from "../_shared/realtime.ts";

if (import.meta.main) {
  Deno.serve(withCors(handler));
}
