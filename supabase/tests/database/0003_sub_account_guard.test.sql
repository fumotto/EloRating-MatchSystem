-- Database Test：サブアカウント対策のView（ADR-036 ③④ / Migration 0024）。
--
-- 検証するのは2つである。
--   1. ランキングの掲載条件（異なる対戦相手数）が効き、順位が掲載対象だけで数え直されること
--   2. 疑わしいペアとチームの偏りが、管理者以外には1件も見えないこと
--
-- ★本ファイルは既存データの上で走る。順位の絶対値を断定してはならない。
--   ローカルには E2E の残骸が居る。ここで作ったチームに限定して検証する。

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(15);

-- === フィクスチャ ===
--
-- A×B … 3戦すべてAの勝ち（一方向性 1.0）
-- A×C … 1戦（ペアとしては対象外。Aの対戦相手を2つにするために置く）
-- B×D … 1戦。A×C と時間が重なるため、(A,B) は「同時在席あり」となる
-- E×F … 2戦。両者とも他の対戦を持たないため「同時在席なし」となる

INSERT INTO teams (id, name, rating) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'GUARD_TEST_A', 1600),
  ('a0000000-0000-0000-0000-000000000002', 'GUARD_TEST_B', 1400),
  ('a0000000-0000-0000-0000-000000000003', 'GUARD_TEST_C', 1500),
  ('a0000000-0000-0000-0000-000000000004', 'GUARD_TEST_D', 1500),
  ('a0000000-0000-0000-0000-000000000005', 'GUARD_TEST_E', 1500),
  ('a0000000-0000-0000-0000-000000000006', 'GUARD_TEST_F', 1500);

-- ★approved_by_profile_id ではなく auto_approved を使う。profiles を用意せずに
--   COMPLETED の CHECK制約（0007）を満たすためである。
INSERT INTO matches (
  id, team_a_id, team_b_id, winner_team_id, status,
  started_at, completed_at, approved_at, auto_approved, report_deadline_at
) VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001', 'COMPLETED',
   '2026-08-01 10:00Z', '2026-08-01 10:30Z', '2026-08-01 10:30Z', TRUE, '2026-08-01 11:00Z'),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001', 'COMPLETED',
   '2026-08-01 11:00Z', '2026-08-01 11:30Z', '2026-08-01 11:30Z', TRUE, '2026-08-01 12:00Z'),
  ('b0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001', 'COMPLETED',
   '2026-08-01 12:00Z', '2026-08-01 12:30Z', '2026-08-01 12:30Z', TRUE, '2026-08-01 13:00Z'),
  ('b0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001', 'COMPLETED',
   '2026-08-01 13:00Z', '2026-08-01 13:30Z', '2026-08-01 13:30Z', TRUE, '2026-08-01 14:00Z'),
  ('b0000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000002', 'COMPLETED',
   '2026-08-01 13:10Z', '2026-08-01 13:40Z', '2026-08-01 13:40Z', TRUE, '2026-08-01 14:10Z'),
  ('b0000000-0000-0000-0000-000000000006',
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006',
   'a0000000-0000-0000-0000-000000000005', 'COMPLETED',
   '2026-08-01 14:00Z', '2026-08-01 14:30Z', '2026-08-01 14:30Z', TRUE, '2026-08-01 15:00Z'),
  ('b0000000-0000-0000-0000-000000000007',
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006',
   'a0000000-0000-0000-0000-000000000005', 'COMPLETED',
   '2026-08-01 15:00Z', '2026-08-01 15:30Z', '2026-08-01 15:30Z', TRUE, '2026-08-01 16:00Z');

-- Aは B から 48、C から 8 を得ている（集中 48/56）。
INSERT INTO rating_history
  (match_id, team_id, before_rating, after_rating, rating_change, k_value, result, completed_at)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   1500, 1516, 16, 32, 'WIN',  '2026-08-01 10:30Z'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   1500, 1484, -16, 32, 'LOSE', '2026-08-01 10:30Z'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   1516, 1532, 16, 32, 'WIN',  '2026-08-01 11:30Z'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   1484, 1468, -16, 32, 'LOSE', '2026-08-01 11:30Z'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   1532, 1548, 16, 32, 'WIN',  '2026-08-01 12:30Z'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002',
   1468, 1452, -16, 32, 'LOSE', '2026-08-01 12:30Z'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
   1548, 1556, 8, 32, 'WIN',  '2026-08-01 13:30Z'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003',
   1500, 1492, -8, 32, 'LOSE', '2026-08-01 13:30Z');

-- =====================================================================
-- 1. ランキングの掲載条件（ADR-036 ③）
-- =====================================================================

UPDATE system_settings SET ranking_min_opponents = 2 WHERE id = 1;

-- A（相手2チーム）と B（相手2チーム）は載る。C・D・E・F（相手1チーム）は載らない。
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM team_ranking_view
    WHERE team_id::TEXT LIKE 'a0000000-%' AND rank IS NOT NULL),
  2,
  'ranking: lists only the teams that met the distinct-opponent threshold'
);

SELECT is(
  (SELECT distinct_opponents::INTEGER FROM team_ranking_view
    WHERE team_id = 'a0000000-0000-0000-0000-000000000001'),
  2,
  'ranking: counts distinct opponents from completed matches'
);

-- ★掲載しないチームもViewには残る。消すと「なぜ載らないか」を画面から説明できない。
SELECT ok(
  EXISTS (SELECT 1 FROM team_ranking_view
           WHERE team_id = 'a0000000-0000-0000-0000-000000000003'),
  'ranking: keeps an unlisted team in the view'
);

SELECT ok(
  (SELECT rank FROM team_ranking_view
    WHERE team_id = 'a0000000-0000-0000-0000-000000000003') IS NULL,
  'ranking: gives an unlisted team no rank'
);

SELECT ok(
  (SELECT listed FROM team_ranking_view
    WHERE team_id = 'a0000000-0000-0000-0000-000000000003') = FALSE,
  'ranking: marks an unlisted team as not listed'
);

-- ★順位は掲載対象だけで数え直す。除外したチームを含めて数えると穴が空く。
--   レート1500の C・D・E・F は A(1600) と B(1400) の間に居るが、順位を分断しない。
SELECT ok(
  (SELECT rank FROM team_ranking_view WHERE team_id = 'a0000000-0000-0000-0000-000000000002')
  = (SELECT rank FROM team_ranking_view WHERE team_id = 'a0000000-0000-0000-0000-000000000001') + 1,
  'ranking: renumbers ranks among listed teams only'
);

-- 0 は無効を表す。検証環境はこの状態で動かす（ADR-036 ⑤）。
UPDATE system_settings SET ranking_min_opponents = 0 WHERE id = 1;

SELECT is(
  (SELECT COUNT(*)::INTEGER FROM team_ranking_view
    WHERE team_id::TEXT LIKE 'a0000000-%' AND rank IS NOT NULL),
  6,
  'ranking: lists every team when the threshold is disabled'
);

-- =====================================================================
-- 2. 疑わしいペア（ADR-036 ④）
-- =====================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ★管理者以外には1件も返さない。疑いを全員に晒すと、機構がそのまま公開の告発になる。
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM suspicious_pair_view),
  0,
  'integrity: hides the suspicious pairs from a non-administrator'
);

SELECT is(
  (SELECT COUNT(*)::INTEGER FROM team_integrity_view),
  0,
  'integrity: hides the team bias figures from a non-administrator'
);

SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}';

-- 2戦以上のペアのみが対象である。A×C と B×D（各1戦）は現れない。
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM suspicious_pair_view
    WHERE team_low_id::TEXT LIKE 'a0000000-%'),
  2,
  'integrity: reports only the pairs that met twice or more'
);

SELECT is(
  (SELECT one_sided_ratio FROM suspicious_pair_view
    WHERE team_low_id = 'a0000000-0000-0000-0000-000000000001'
      AND team_high_id = 'a0000000-0000-0000-0000-000000000002'),
  1.0::NUMERIC,
  'integrity: scores a pair with no reversed result as fully one-sided'
);

-- ★同時在席の欠如。B は A×C と重なる時間に D と対戦しているため、重なりは有る。
SELECT ok(
  (SELECT never_concurrent FROM suspicious_pair_view
    WHERE team_low_id = 'a0000000-0000-0000-0000-000000000001'
      AND team_high_id = 'a0000000-0000-0000-0000-000000000002') = FALSE,
  'integrity: does not flag a pair whose matches overlapped in time'
);

-- E と F は互いとしか対戦していない。人はふたつのチームを同時に操作できない。
SELECT ok(
  (SELECT never_concurrent FROM suspicious_pair_view
    WHERE team_low_id = 'a0000000-0000-0000-0000-000000000005'
      AND team_high_id = 'a0000000-0000-0000-0000-000000000006') = TRUE,
  'integrity: flags a pair that was never online at the same time'
);

-- チーム単位の偏り。A の稼ぎは 48/56 が B から来ている。
SELECT is(
  (SELECT top_opponent_id FROM team_integrity_view
    WHERE team_id = 'a0000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000002'::UUID,
  'integrity: names the opponent that supplied the most rating'
);

SELECT is(
  ROUND((SELECT top_opponent_gain_share FROM team_integrity_view
          WHERE team_id = 'a0000000-0000-0000-0000-000000000001'), 3),
  0.857::NUMERIC,
  'integrity: measures how concentrated the rating gain is'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
