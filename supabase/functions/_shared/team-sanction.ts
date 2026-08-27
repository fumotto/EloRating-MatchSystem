// チームへの措置（ADR-032 ④ / ADR-033 ③）。
//
// `admin-ban-team` と `admin-resolve-abuse-report` が同じ処理を使う。
// BANは待機列からの削除を伴うため、二箇所に書くと必ずずれる（`_shared/match-completion.ts` と同じ方針 / ADR-021）。
import type { PoolClient } from "./db.ts";

// クールダウンを課す。誤魔化す経路の代償は**レートではなく時間**で払わせる（ADR-032 ④）。
//
// ★既に将来の期限が入っている場合は延ばさない（GREATEST を取らない）。
//   複数の理由が重なったときに際限なく積み上がるのを防ぐ。上書きで十分である。
export async function applyCooldown(
  tx: PoolClient,
  teamIds: string[],
  minutes: number,
): Promise<void> {
  if (teamIds.length === 0 || minutes <= 0) return;

  await tx.queryObject(
    `UPDATE teams
        SET queue_cooldown_until = GREATEST(
              COALESCE(queue_cooldown_until, NOW()),
              NOW()
            ) + ($2 || ' minutes')::interval
      WHERE id = ANY($1)`,
    [teamIds, String(minutes)],
  );
}

// 設定値からクールダウンの長さを引く。呼び出し側でハードコードしない。
export async function getCooldownMinutes(tx: PoolClient): Promise<number> {
  const result = await tx.queryObject<{ queue_cooldown_minutes: number }>(
    `SELECT queue_cooldown_minutes FROM system_settings LIMIT 1`,
  );
  if (result.rows.length === 0) throw new Error("system settings not found");
  return result.rows[0].queue_cooldown_minutes;
}

// チームをBANする。`admin-ban-team` の処理そのものである。
//
// ★進行中の試合は中断しない。試合終了後にBANの効果が現れる（04 12.1）。
// ★既にBAN済みでも成功として扱う（06_ErrorCode.md 15章の冪等な操作）。
//
// 対象が存在しない場合は false を返す。呼び出し側がエラーコードを決める。
export async function banTeam(
  tx: PoolClient,
  teamId: string,
  actorProfileId: string,
  reason: string,
): Promise<boolean> {
  const updated = await tx.queryObject<{ id: string }>(
    `UPDATE teams SET is_banned = TRUE WHERE id = $1 RETURNING id`,
    [teamId],
  );

  if (updated.rows.length === 0) return false;

  // 待機中のまま残すとBANチームがマッチしうる。
  await tx.queryObject(`DELETE FROM matching_queue WHERE team_id = $1`, [teamId]);

  await tx.queryObject(
    `INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id, payload)
     VALUES ($1, 'TEAM_BANNED', 'TEAM', $2, $3)`,
    [actorProfileId, teamId, JSON.stringify({ reason })],
  );

  return true;
}
