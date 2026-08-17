// マッチングアルゴリズム（09_MatchmakingSpecification.md 6章 / 04_BackendInterface.md 11.1）。
//
// `queue-match` の同期実行と `matchmaker` の救済実行が同じ処理を使う。
// 重複実装してはならない（Rating と同じ方針 / ADR-021）。
//
// 相手選択の純粋関数（selectOpponent）とDB操作（runMatchmaking）を分ける。
// 優先順位は単体テストで検証できるようにしておく。
// ★db.ts を import してはならない。優先順位の判定は Unit（Vitest / Node）でも検証するため、
//   このモジュールが Deno グローバルや https: 依存を引き込むと tsc が解決できなくなる。
//   トランザクションハンドルは構造的に必要な分だけ型で表す（PoolClient はこれを満たす）。
interface Transaction {
  queryObject<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface QueuedTeam {
  team_id: string;
  rating: number;
  // 待機開始時刻。ISO文字列でもDateでも比較できるよう数値へ寄せて扱う。
  queued_at: string | Date;
}

const queuedAtMs = (team: QueuedTeam): number => new Date(team.queued_at).getTime();

// 優先順位（6.2）: 第1 レート差が最小 → 第2 待機開始が最早 → 第3 Team ID 昇順。
// ★レート差が第1である。待機時間で先に並べ替えてはならない。
// 許容範囲外（6.3）の候補は選ばない。境界値（差＝許容値）は含む。
export function selectOpponent(
  team: QueuedTeam,
  candidates: QueuedTeam[],
  ratingRange: number,
): QueuedTeam | null {
  let best: QueuedTeam | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.team_id === team.team_id) continue;

    const diff = Math.abs(team.rating - candidate.rating);
    if (diff > ratingRange) continue;

    if (best === null || diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
      continue;
    }

    if (diff > bestDiff) continue;

    // 以下は同点時の決定性のための比較である。
    const waitDelta = queuedAtMs(candidate) - queuedAtMs(best);
    if (waitDelta < 0 || (waitDelta === 0 && candidate.team_id < best.team_id)) {
      best = candidate;
    }
  }

  return best;
}

// 待機列から成立する組を貪欲に決める。
// 起点は待機の長いチームから選ぶ（第2優先の「長く待っているチームを優先」）。
// 起点ごとの相手選びは selectOpponent がレート差優先で行う。
export function pairTeams(queue: QueuedTeam[], ratingRange: number): [QueuedTeam, QueuedTeam][] {
  const remaining = [...queue].sort((a, b) => {
    const wait = queuedAtMs(a) - queuedAtMs(b);
    return wait !== 0 ? wait : a.team_id < b.team_id ? -1 : 1;
  });

  const pairs: [QueuedTeam, QueuedTeam][] = [];

  while (remaining.length > 1) {
    const team = remaining.shift()!;
    const opponent = selectOpponent(team, remaining, ratingRange);
    // 相手が見つからないのはエラーではない。待機を継続させる（12章）。
    if (!opponent) continue;
    remaining.splice(remaining.indexOf(opponent), 1);
    pairs.push([team, opponent]);
  }

  return pairs;
}

export interface CreatedMatch {
  matchId: string;
  teamAId: string;
  teamBId: string;
}

export interface MatchmakingResult {
  // 成立した試合。呼び出し側が「自チームが組まれたか」を追加問い合わせなしで判定できるよう、
  // 試合IDだけでなく参加チームも返す。
  matches: CreatedMatch[];
}

// トランザクション内で呼ぶ。呼び出し側が BEGIN/COMMIT を持つ。
export async function runMatchmaking(tx: Transaction): Promise<MatchmakingResult> {
  // ★多重実行の防止（7.1）。同一トランザクション内でのみ有効な advisory lock を使う。
  //   これが無いと、同期実行とCronの救済実行が同じチームを別々の試合へ割り当てうる。
  await tx.queryObject(`SELECT pg_advisory_xact_lock(hashtext('matchmaking'))`);

  const settings = await tx.queryObject<{
    match_rating_range: number;
    report_timeout_minutes: number;
    matchmaking_paused: boolean;
  }>(
    `SELECT match_rating_range, report_timeout_minutes, matchmaking_paused
       FROM system_settings LIMIT 1`,
  );

  if (settings.rows.length === 0) {
    throw new Error("system settings not found");
  }

  const { match_rating_range, report_timeout_minutes, matchmaking_paused } = settings.rows[0];

  // ★シーズン終了の猶予中は新しい試合を組まない。組んでしまうと、
  //   進行中の試合が尽きるのを待つ猶予がいつまでも終わらない（Issue #9）。
  //   本関数は cron から呼ばれるため、queue-match の関門だけでは塞げない。
  if (matchmaking_paused) {
    return { matches: [] };
  }

  // 対象条件は3章。BANチームと進行中の試合を持つチームを除外する。
  // teams に状態列は無い。進行中かどうかは matches から導出する。
  const queued = await tx.queryObject<QueuedTeam>(
    `SELECT q.team_id, t.rating, q.queued_at
       FROM matching_queue q
       JOIN teams t ON t.id = q.team_id
      WHERE t.is_banned = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM matches m
           WHERE (m.team_a_id = q.team_id OR m.team_b_id = q.team_id)
             AND m.status NOT IN ('COMPLETED', 'DRAWN')
        )
      ORDER BY q.queued_at, q.team_id
        FOR UPDATE OF q SKIP LOCKED`,
  );

  const matches: CreatedMatch[] = [];

  for (const [teamA, teamB] of pairTeams(queued.rows, match_rating_range)) {
    // report_deadline_at は必ず設定する。無いと auto-resolve-matches が対象を判定できない（14章）。
    const inserted = await tx.queryObject<{ id: string }>(
      `INSERT INTO matches (team_a_id, team_b_id, status, report_deadline_at)
       VALUES ($1, $2, 'PLAYING', NOW() + ($3 || ' minutes')::interval)
       RETURNING id`,
      [teamA.team_id, teamB.team_id, String(report_timeout_minutes)],
    );

    const matchId = inserted.rows[0].id;

    await tx.queryObject(`DELETE FROM matching_queue WHERE team_id = ANY($1)`, [
      [teamA.team_id, teamB.team_id],
    ]);

    // 内部処理のため actor_profile_id は NULL である（列はNULL許容）。
    await tx.queryObject(
      `INSERT INTO audit_logs (action, target_type, target_id, payload)
       VALUES ('MATCH_CREATED', 'MATCH', $1, $2)`,
      [matchId, JSON.stringify({ teamAId: teamA.team_id, teamBId: teamB.team_id })],
    );

    matches.push({ matchId, teamAId: teamA.team_id, teamBId: teamB.team_id });
  }

  return { matches };
}
