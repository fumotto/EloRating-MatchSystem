// 試合確定とレート更新（08_RatingSpecification.md 9章 / 04_BackendInterface.md 10.4・11.2）。
//
// `approve-match`（敗者による承認）と `auto-resolve-matches`（承認期限切れの自動承認）が
// 同じ処理を使う。レート更新の実装を複数箇所へ重複させてはならない（08 10.1）。
import { calculateRating } from "./rating.ts";

interface Transaction {
  queryObject<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface CompletionTarget {
  matchId: string;
  winnerTeamId: string;
  loserTeamId: string;
  version: number;
}

export interface TeamRatingResult {
  teamId: string;
  beforeRating: number;
  afterRating: number;
  ratingChange: number;
}

export interface CompletionResult {
  completedAt: string;
  winnerTeamId: string;
  ratings: TeamRatingResult[];
}

// 呼び出し側のトランザクション内で実行する。
// approvedByProfileId が null のときは自動承認（auto_approved = TRUE）として確定する。
//
// 楽観ロックに失敗した場合（version 不一致・状態が WINNER_REPORTED でない）は null を返す。
// 呼び出し側がエラーコードを決める。承認では MATCH-008、自動解決では単に対象外である。
export async function completeMatch(
  tx: Transaction,
  target: CompletionTarget,
  approvedByProfileId: string | null,
): Promise<CompletionResult | null> {
  // K値は試合の完了時点の設定値を使う（08 7.1）。ハードコードしない。
  const settings = await tx.queryObject<{ rating_k: number }>(
    `SELECT rating_k FROM system_settings LIMIT 1`,
  );

  if (settings.rows.length === 0) {
    throw new Error("system settings not found");
  }

  const k = settings.rows[0].rating_k;

  // ★両チームの行をロックしてから読む。ロックしないと、同時に確定した別の試合と
  //   読み書きが交錯して after_rating が上書きされうる。
  //   ID順に並べてロックし、デッドロックを避ける。
  const teams = await tx.queryObject<{ id: string; rating: number }>(
    `SELECT id, rating FROM teams WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
    [[target.winnerTeamId, target.loserTeamId]],
  );

  const winnerRating = teams.rows.find((t) => t.id === target.winnerTeamId)?.rating;
  const loserRating = teams.rows.find((t) => t.id === target.loserTeamId)?.rating;

  if (winnerRating === undefined || loserRating === undefined) {
    throw new Error("team not found for rating update");
  }

  const rating = calculateRating(winnerRating, loserRating, k);

  // 状態遷移と楽観ロックを1文に含める。二重確定はここで弾かれる。
  const updated = await tx.queryObject<{ completed_at: Date }>(
    `UPDATE matches
        SET status = 'COMPLETED',
            completed_at = NOW(),
            approved_at = NOW(),
            approved_by_profile_id = $1,
            auto_approved = $2,
            version = version + 1
      WHERE id = $3 AND version = $4 AND status = 'WINNER_REPORTED'
  RETURNING completed_at`,
    [approvedByProfileId, approvedByProfileId === null, target.matchId, target.version],
  );

  if (updated.rows.length === 0) {
    return null;
  }

  const completedAt = updated.rows[0].completed_at;

  // rating_history は1試合につき2件（08 11章）。k_value を必ず保存する。
  // rating_change はクランプ後の実差である（CHECK: rating_change = after - before）。
  const rows: TeamRatingResult[] = [
    {
      teamId: target.winnerTeamId,
      beforeRating: rating.winnerBefore,
      afterRating: rating.winnerAfter,
      ratingChange: rating.winnerChange,
    },
    {
      teamId: target.loserTeamId,
      beforeRating: rating.loserBefore,
      afterRating: rating.loserAfter,
      ratingChange: rating.loserChange,
    },
  ];

  for (const [index, row] of rows.entries()) {
    await tx.queryObject(
      `INSERT INTO rating_history
         (match_id, team_id, before_rating, after_rating, rating_change, k_value, result, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        target.matchId,
        row.teamId,
        row.beforeRating,
        row.afterRating,
        row.ratingChange,
        k,
        index === 0 ? "WIN" : "LOSE",
        completedAt,
      ],
    );

    await tx.queryObject(`UPDATE teams SET rating = $1 WHERE id = $2`, [
      row.afterRating,
      row.teamId,
    ]);
  }

  await tx.queryObject(
    `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
     VALUES ($1, $2, 'MATCH', $3, $4)`,
    [
      approvedByProfileId,
      approvedByProfileId === null ? "MATCH_AUTO_APPROVED" : "MATCH_APPROVED",
      target.matchId,
      JSON.stringify({ winnerTeamId: target.winnerTeamId, kValue: k }),
    ],
  );

  return {
    completedAt: new Date(completedAt).toISOString(),
    winnerTeamId: target.winnerTeamId,
    ratings: rows,
  };
}
