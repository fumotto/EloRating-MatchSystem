// シーズン運用の関門（Issue #9 / 06_ErrorCode.md 13.1）。
//
// ★確定処理の最中に利用者側の更新が通ると、退避した内容と実データが食い違う。
//   ランキングを退避した後にレートが動けば、シーズン別ランキングは
//   その瞬間のどこでもない値を記録することになる。
//
// ★ログインは妨げない。ensure-profile へは本関門を置かない。
//   締切中に閉め出されると、利用者は何が起きているのかを画面で確かめられない。
import { businessError } from "./response.ts";
import type { PoolClient } from "./db.ts";

export async function assertUpdatesAllowed(tx: PoolClient): Promise<void> {
  const result = await tx.queryObject<{ updates_locked: boolean }>(
    `SELECT updates_locked FROM system_settings LIMIT 1`,
  );

  if (result.rows[0]?.updates_locked) {
    throw businessError("SEASON-001", "Updates are locked during the season change.", 409);
  }
}

// ★マッチングだけは猶予の開始と同時に止める。進行中の試合は決着させたいが、
//   新しい試合が始まると猶予がいつまでも終わらない。
export async function assertMatchmakingAllowed(tx: PoolClient): Promise<void> {
  const result = await tx.queryObject<{ matchmaking_paused: boolean }>(
    `SELECT matchmaking_paused FROM system_settings LIMIT 1`,
  );

  if (result.rows[0]?.matchmaking_paused) {
    throw businessError("SEASON-002", "Matchmaking is paused.", 409);
  }
}
