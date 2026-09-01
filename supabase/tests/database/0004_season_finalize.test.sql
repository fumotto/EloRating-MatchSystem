-- Database Test：シーズン確定時の強制引き分け（ADR-038 / Migration 0025）。
--
-- ★本ファイルは不具合の再発防止が目的である。
--
--   Migration 0023 が `chk_matches_drawn_reason` を追加した際、`finalize-season` の
--   強制引き分けが更新されず、`no_contest_reason` を設定しないまま `status = 'DRAWN'` を
--   書いていた。猶予切れの時点で進行中の試合が1件でも残っていると制約違反で失敗し、
--   **シーズンが永久に確定できない**状態だった。既定値（猶予10分・申告期限60分）では
--   シーズン終了時に対戦中の試合があれば必ず踏む。
--
-- ★Integration Test では捕まえられない。あちらはモックDBを使うため CHECK制約が働かない。
--   だからここで、実物のDBに対して `finalize-season` と同じ形の UPDATE を流す。
--
-- ★本ファイルを消してはならない。消すと、同じ取りこぼしが再び通る。

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(7);

INSERT INTO teams (id, name, rating) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'FINALIZE_TEST_A', 1500),
  ('c1000000-0000-0000-0000-000000000002', 'FINALIZE_TEST_B', 1500);

-- 猶予切れの時点でまだ決着していない試合。申告期限はまだ先である点が要である。
-- 猶予（既定10分）は申告期限（既定60分）より短いため、これが通常の状態になる。
INSERT INTO matches (id, team_a_id, team_b_id, status, started_at, report_deadline_at)
VALUES
  ('d1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002',
   'PLAYING', NOW(), NOW() + interval '60 minutes');

-- =====================================================================
-- 1. 理由を設定しない引き分けは拒まれる（不具合そのもの）
-- =====================================================================

SELECT throws_ok(
  $$
  UPDATE matches
     SET status = 'DRAWN', winner_team_id = NULL, completed_at = NOW(), version = version + 1
   WHERE id = 'd1000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  NULL,
  'finalize: rejects a drawn match without a no-contest reason'
);

-- =====================================================================
-- 2. finalize-season と同じ形の UPDATE が通る
-- =====================================================================
--
-- ★WHERE 句まで実物と揃える。`status NOT IN ('COMPLETED','DRAWN')` である。

SELECT lives_ok(
  $$
  UPDATE matches
     SET status = 'DRAWN',
         winner_team_id = NULL,
         no_contest_reason = 'SEASON_END',
         completed_at = NOW(),
         version = version + 1
   WHERE status NOT IN ('COMPLETED', 'DRAWN')
  $$,
  'finalize: cuts off the remaining matches when the season ends'
);

SELECT is(
  (SELECT no_contest_reason FROM matches
    WHERE id = 'd1000000-0000-0000-0000-000000000001'),
  'SEASON_END',
  'finalize: records why the match was cut off'
);

SELECT is(
  (SELECT winner_team_id FROM matches
    WHERE id = 'd1000000-0000-0000-0000-000000000001'),
  NULL::UUID,
  'finalize: leaves no winner on a cut-off match'
);

-- =====================================================================
-- 3. SEASON_END は当事者に不利益を与えない（ADR-038 ②）
-- =====================================================================
--
-- ★打ち切ったのは運営である。当事者は対戦の最中でありえた。
--   不戦に数えると、運営の都合で確定率が下がる。

SELECT is(
  (SELECT no_contests::INTEGER FROM team_ranking_view
    WHERE team_id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'finalize: never counts a season cutoff as a no-show'
);

SELECT is(
  (SELECT void_count::INTEGER FROM team_ranking_view
    WHERE team_id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'finalize: keeps a season cutoff out of the mutual no-contest count'
);

-- =====================================================================
-- 4. 理由の許可値（Migration 0025）
-- =====================================================================

SELECT throws_ok(
  $$
  UPDATE matches
     SET no_contest_reason = 'WHATEVER'
   WHERE id = 'd1000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  NULL,
  'finalize: still rejects an unknown no-contest reason'
);

SELECT * FROM finish();

ROLLBACK;
