// 試合操作の共通ガード（ADR-032 / ADR-035）。
//
// 勝敗確定系の Edge Function が同じ前提を繰り返し確認するため、ここへ集約する。
import { businessError } from "./response.ts";
import type { PoolClient } from "./db.ts";

export interface MatchRow {
  id: string;
  team_a_id: string;
  team_b_id: string;
  winner_team_id: string | null;
  status: string;
  version: number;
  counter_claim_team_id: string | null;
  no_contest_requested_by_team_id: string | null;
  no_contest_request_count: number;
  report_extension_count: number;
}

const MATCH_COLUMNS = `id, team_a_id, team_b_id, winner_team_id, status, version,
       counter_claim_team_id, no_contest_requested_by_team_id,
       no_contest_request_count, report_extension_count`;

export async function loadMatch(tx: PoolClient, matchId: string): Promise<MatchRow> {
  const result = await tx.queryObject<MatchRow>(
    `SELECT ${MATCH_COLUMNS} FROM matches WHERE id = $1`,
    [matchId],
  );
  if (result.rows.length === 0) {
    throw businessError("MATCH-001", "Match not found.", 404);
  }
  return result.rows[0];
}

// 呼び出しユーザーが属するチームを、当該試合の参加チームの中から特定する。
//
// ★`team_members` は UNIQUE (profile_id) を持つため所属チームは一意である（03 10.3）。
//   クライアントから teamId を受け取ってはならない。詐称できる。
export async function resolveOwnTeam(
  tx: PoolClient,
  profileId: string,
  match: MatchRow,
): Promise<string> {
  const result = await tx.queryObject<{ team_id: string }>(
    `SELECT team_id FROM team_members
      WHERE profile_id = $1 AND team_id = ANY($2)`,
    [profileId, [match.team_a_id, match.team_b_id]],
  );
  if (result.rows.length === 0) {
    throw businessError("MATCH-005", "Not allowed to operate this match.", 403);
  }
  return result.rows[0].team_id;
}

export function opponentOf(match: MatchRow, teamId: string): string {
  return teamId === match.team_a_id ? match.team_b_id : match.team_a_id;
}

// 終端状態への操作を弾く。
export function assertNotFinished(match: MatchRow): void {
  if (match.status === "COMPLETED" || match.status === "DRAWN") {
    throw businessError("MATCH-002", "Match already finished.", 409);
  }
}

// PLAYING 限定の操作（延長・不成立の申請）に用いる。
export function assertPlaying(match: MatchRow): void {
  assertNotFinished(match);
  if (match.status !== "PLAYING") {
    throw businessError("MATCH-003", "Winner already reported.", 409);
  }
}

// 保留中の不成立申請をクリアする。
//
// ★勝利申告・投了・延長はいずれも「応答」とみなす（ADR-032 ⑧）。
//   相手は1回の操作で申請を無効化できる。
export async function clearNoContestRequest(tx: PoolClient, matchId: string): Promise<void> {
  await tx.queryObject(
    `UPDATE matches
        SET no_contest_requested_by_team_id = NULL,
            no_contest_requested_at = NULL,
            no_contest_reason_code = NULL
      WHERE id = $1 AND no_contest_requested_by_team_id IS NOT NULL`,
    [matchId],
  );
}
