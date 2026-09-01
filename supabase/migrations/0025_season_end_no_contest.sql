-- シーズン終了による打ち切りを不成立の理由として区別する（ADR-038）
--
-- 正本は 03_Database.md 18.12 である。
--
-- ★本Migrationは不具合の修正である。Migration 0023 が
--   `chk_matches_drawn_reason`（`(status = 'DRAWN') = (no_contest_reason IS NOT NULL)`）を
--   追加した際、`finalize-season` の強制引き分けが更新されなかった。同関数は
--   `no_contest_reason` を設定しないまま `status = 'DRAWN'` を書くため、猶予切れの時点で
--   進行中の試合が1件でも残っていると制約違反で失敗し、**シーズンが確定できなくなる**。
--
-- ★既定値では普通に踏む。猶予は10分、申告期限は60分であり、シーズン終了時に
--   進行中の試合があれば、猶予切れの時点でその試合はまだ PLAYING である。

-- =====================================================================
-- 1. 理由に SEASON_END を追加する（ADR-038 ①）
-- =====================================================================
--
-- ★ADMIN_VOID を流用しない。ADR-034 ④ の ADMIN_VOID は `admin-void-matches` に結び付いた
--   値であり、理由の入力と `MATCH_VOIDED` の監査ログを伴う。`finalize-season` はどちらも
--   持たないため、流用すると「管理者が無効化した」という起きていない事実が記録に残る。
--   試合詳細の説明文も嘘になる（05_Frontend.md 14.x）。
--
-- ★適用済みMigrationは編集しない。0023 の制約を落として作り直す。

ALTER TABLE matches DROP CONSTRAINT chk_matches_no_contest_reason;

ALTER TABLE matches
  ADD CONSTRAINT chk_matches_no_contest_reason CHECK (
    no_contest_reason IS NULL
    OR no_contest_reason IN (
      'REPORT_TIMEOUT', 'NO_SHOW', 'MUTUAL', 'CONFLICT', 'ADMIN_VOID', 'SEASON_END'
    )
  );

COMMENT ON COLUMN matches.no_contest_reason IS
  'DRAWN の理由。SEASON_END はシーズン終了による打ち切り（ADR-038 ①）';

-- =====================================================================
-- 2. 既存の DRAWN 行は触らない
-- =====================================================================
--
-- ★過去にシーズン終了で打ち切られた行を SEASON_END へ書き換えない。
--   0023 以降、`finalize-season` はそもそも成功していない（制約違反で落ちる）。
--   0023 より前に打ち切られた行は 0023 の UPDATE で REPORT_TIMEOUT が入っており、
--   当時の記録としてそのまま残す。遡って書き換えると、確定率の集計が過去に向かって変わる。

-- =====================================================================
-- 3. team_ranking_view は変更しない
-- =====================================================================
--
-- ★SEASON_END は不戦（`no_contests`）にも不成立数（`void_count`）にも計上しない。
--   0024 の集計は REPORT_TIMEOUT / CONFLICT / NO_SHOW を不戦、MUTUAL を不成立数と
--   しており、SEASON_END はどちらの FILTER にも当たらない。**View の変更は不要である。**
--
--   計上しないのは運営起因だからである。シーズンを打ち切ったのは運営であり、
--   当事者は対戦の最中でありえた。ADR-034 ④ の「運営起因・外部起因の不成立は、
--   当事者にいかなる不利益も伴わせない」をそのまま適用する。

-- =====================================================================
-- 4. public_settings へ maintenance_paused を追加する（ADR-038 ③）
-- =====================================================================
--
-- ★シーズンによる停止（`matchmaking_paused`）は 0021 で既に公開している。
--   保守による停止だけを隠す理由が無い。隠したままだと、
--   　・管理画面のシーズン画面が「マッチング：受付中」と表示しながら QUEUE-007 を返す
--   　・マッチング画面が「押してからエラーにしない」という原則（Issue #9）を守れない
--   という食い違いが残る。実際に両方とも起きていた。
--
-- ★列の追加のみであるため CREATE OR REPLACE で足りる（0019・0021 の注記と同じ）。
--   ただし既存の列順は変えられない。末尾へ足す。

CREATE OR REPLACE VIEW public_settings AS
SELECT
    site_title,
    background_image_path,
    rules_markdown,
    announcement_text,
    announcement_level,
    current_season,
    matchmaking_paused,
    updates_locked,
    maintenance_paused
  FROM system_settings
 WHERE id = 1;

GRANT SELECT ON public_settings TO anon, authenticated;
