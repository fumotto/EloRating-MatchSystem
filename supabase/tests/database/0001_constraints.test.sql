-- Database Test（10_TestSpecification.md 3章 / Part3 3.6・Part5 3.6・Part4 3.5）。
--
-- 制約（UNIQUE・部分UNIQUE・CHECK）は Database Test で検証する。
-- Edge Function 側の検証が破られた場合の最終防御であるため、DBそのものに対して確かめる。

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(38);

-- テスト用データ。auth.users への外部キーがあるため profiles は先に用意する。
INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'c@example.com');

INSERT INTO profiles (id, auth_provider, provider_user_id, display_name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'discord', 'discord-a', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'discord', 'discord-b', 'Bob');

INSERT INTO teams (id, name, rating)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Team A', 1500),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Team B', 1500);

INSERT INTO team_members (team_id, profile_id, role)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111', 'LEADER');

-- === profiles（Part3 3.6）===

-- TC-TEAM-056 プロバイダの値。
-- 許容は 'steam' / 'discord' の2つだけである（03_Database.md 10.1）。
-- MVPの利用は discord のみだが（ADR-022）、制約としては steam も通る点に注意する。
SELECT throws_ok(
  $$INSERT INTO profiles (id, auth_provider, provider_user_id, display_name)
    VALUES ('33333333-3333-3333-3333-333333333333', 'twitter', 'x', 'X')$$,
  '23514',
  NULL,
  'rejects an unsupported auth provider'
);

-- TC-TEAM-057 プロバイダIDの組み合わせ
SELECT throws_ok(
  $$INSERT INTO profiles (id, auth_provider, provider_user_id, display_name)
    VALUES ('33333333-3333-3333-3333-333333333333', 'discord', 'discord-a', 'Dup')$$,
  '23505',
  NULL,
  'rejects a duplicate provider identity'
);

-- === teams ===

SELECT throws_ok(
  $$INSERT INTO teams (name, rating) VALUES ('Team A', 1500)$$,
  '23505', NULL, 'rejects a duplicate team name'
);

SELECT throws_ok(
  $$INSERT INTO teams (name, rating) VALUES ('Too Low', 99)$$,
  '23514', NULL, 'rejects a rating below the lower bound'
);

SELECT throws_ok(
  $$INSERT INTO teams (name) VALUES ('')$$,
  '23514', NULL, 'rejects an empty team name'
);

-- === team_members（Part3 3.6）===

-- TC-TEAM-050 1人1チーム
SELECT throws_ok(
  $$INSERT INTO team_members (team_id, profile_id, role)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '11111111-1111-1111-1111-111111111111', 'MEMBER')$$,
  '23505', NULL, 'rejects a second team membership for the same profile'
);

-- TC-TEAM-051 LEADERの一意性（部分UNIQUEインデックス）
SELECT throws_ok(
  $$INSERT INTO team_members (team_id, profile_id, role)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '22222222-2222-2222-2222-222222222222', 'LEADER')$$,
  '23505', NULL, 'rejects a second leader in the same team'
);

-- TC-TEAM-054 役割の値。OWNER は使用しない（ADR-010）。
SELECT throws_ok(
  $$INSERT INTO team_members (team_id, profile_id, role)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '22222222-2222-2222-2222-222222222222', 'OWNER')$$,
  '23514', NULL, 'rejects a role value outside LEADER and MEMBER'
);

-- === team_invites（Part3 3.6）===

INSERT INTO team_invites (team_id, invite_code_hash, created_by_profile_id, expires_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash-1',
        '11111111-1111-1111-1111-111111111111', NOW() + INTERVAL '1 day');

-- TC-TEAM-052 有効な招待の一意性
SELECT throws_ok(
  $$INSERT INTO team_invites (team_id, invite_code_hash, created_by_profile_id, expires_at)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash-2',
            '11111111-1111-1111-1111-111111111111', NOW() + INTERVAL '1 day')$$,
  '23505', NULL, 'rejects a second active invite for the same team'
);

-- TC-TEAM-053 招待コードの一意性
SELECT throws_ok(
  $$INSERT INTO team_invites (team_id, invite_code_hash, created_by_profile_id, expires_at, status)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hash-1',
            '11111111-1111-1111-1111-111111111111', NOW() + INTERVAL '1 day', 'REVOKED')$$,
  '23505', NULL, 'rejects a duplicate invite code hash'
);

-- TC-TEAM-055 招待の期限
SELECT throws_ok(
  $$INSERT INTO team_invites (team_id, invite_code_hash, created_by_profile_id, expires_at, status)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hash-3',
            '11111111-1111-1111-1111-111111111111', NOW() - INTERVAL '1 day', 'REVOKED')$$,
  '23514', NULL, 'rejects an invite expiring before it was created'
);

-- USED と used_at は同時でなければならない。
SELECT throws_ok(
  $$UPDATE team_invites SET status = 'USED' WHERE invite_code_hash = 'hash-1'$$,
  '23514', NULL, 'requires used_at when the invite is marked USED'
);

-- === matches（Part5 3.6）===

INSERT INTO matches (id, team_a_id, team_b_id, report_deadline_at)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        NOW() + INTERVAL '1 hour');

-- TC-MATCH-005 version の初期値
SELECT is(
  (SELECT version FROM matches WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  'initialises the optimistic lock version to 1'
);

-- TC-MATCH-002 初期状態
SELECT is(
  (SELECT status FROM matches WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'PLAYING',
  'starts the match in the PLAYING state'
);

-- TC-MATCH-062 状態値の制限。MATCHED は存在しない（ADR-008）。
SELECT throws_ok(
  $$UPDATE matches SET status = 'MATCHED'
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '23514', NULL, 'rejects a status value outside the four allowed states'
);

-- TC-MATCH-063 同一チーム対戦の禁止
SELECT throws_ok(
  $$INSERT INTO matches (team_a_id, team_b_id, report_deadline_at)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW())$$,
  '23514', NULL, 'rejects a match between a team and itself'
);

-- TC-QUEUE-040 同一チームで2件目の試合（部分UNIQUEインデックス・最終防御）
SELECT throws_ok(
  $$INSERT INTO matches (team_a_id, team_b_id, report_deadline_at)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NOW())$$,
  '23505', NULL, 'rejects a second active match for the same team'
);

-- TC-MATCH-065 WINNER_REPORTED の必須項目
SELECT throws_ok(
  $$UPDATE matches SET status = 'WINNER_REPORTED'
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '23514', NULL, 'requires report fields in the WINNER_REPORTED state'
);

-- TC-MATCH-066 COMPLETED の必須項目
SELECT throws_ok(
  $$UPDATE matches
       SET status = 'COMPLETED', winner_team_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '23514', NULL, 'requires completed_at in the COMPLETED state'
);

-- TC-MATCH-068 自動承認では承認者がNULLでよい
SELECT lives_ok(
  $$UPDATE matches
       SET status = 'COMPLETED',
           winner_team_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
           completed_at = NOW(), approved_at = NOW(), auto_approved = TRUE
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'allows a null approver when auto-approved'
);

-- TC-MATCH-069 DRAWN の勝者
SELECT throws_ok(
  $$UPDATE matches SET status = 'DRAWN'
     WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '23514', NULL, 'rejects a winner on a drawn match'
);

-- === rating_history（Part5 3.6）===

INSERT INTO rating_history
  (match_id, team_id, before_rating, after_rating, rating_change, k_value, result, completed_at)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1500, 1516, 16, 32, 'WIN', NOW());

-- TC-MATCH-071 履歴の一意性
SELECT throws_ok(
  $$INSERT INTO rating_history
      (match_id, team_id, before_rating, after_rating, rating_change, k_value, result, completed_at)
    VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1500, 1516, 16, 32, 'WIN', NOW())$$,
  '23505', NULL, 'rejects duplicate rating history for the same team'
);

-- TC-MATCH-072 rating_change の整合
SELECT throws_ok(
  $$INSERT INTO rating_history
      (match_id, team_id, before_rating, after_rating, rating_change, k_value, result, completed_at)
    VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1500, 1484, -10, 32, 'LOSE', NOW())$$,
  '23514', NULL, 'rejects an inconsistent rating change'
);

-- TC-RATING-016 の対。下限を下回る after_rating は保存できない。
SELECT throws_ok(
  $$INSERT INTO rating_history
      (match_id, team_id, before_rating, after_rating, rating_change, k_value, result, completed_at)
    VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 105, 89, -16, 32, 'LOSE', NOW())$$,
  '23514', NULL, 'rejects a rating below the lower bound in the history'
);

-- === system_settings（TC-ADMIN-037）===

SELECT throws_ok(
  $$UPDATE system_settings SET rating_k = 129 WHERE id = 1$$,
  '23514', NULL, 'rejects invalid settings at the database level'
);

-- チーム人数上限の下限は 1 である（Issue #4 / Migration 0017）。
-- 0009 では 2 以上を要求していた。1人チームでの運用を許すため緩めた境界であり、
-- Migration の適用漏れをここで検出する。
SELECT lives_ok(
  $$UPDATE system_settings SET team_max_members = 1 WHERE id = 1$$,
  'allows a one-person team as the member limit'
);

SELECT throws_ok(
  $$UPDATE system_settings SET team_max_members = 0 WHERE id = 1$$,
  '23514', NULL, 'rejects a member limit below one'
);

-- ===== profiles.avatar_url の許可リスト（Migration 0020）=====
--
-- ★本カラムは他の利用者の画面で <img src> に載る。profiles は本人が
--   クライアントから直接UPDATEできる（03_Database.md 19章）ため、
--   Edge Function を通らない経路がある。DBが最終の関門である。

SELECT lives_ok(
  $$UPDATE profiles SET avatar_url = 'https://cdn.discordapp.com/avatars/1/abc.png'
     WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  'Discord CDN のアイコンURLを受け入れる'
);

SELECT lives_ok(
  $$UPDATE profiles SET avatar_url = NULL
     WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  'アイコン未設定（NULL）を受け入れる'
);

SELECT throws_ok(
  $$UPDATE profiles SET avatar_url = 'https://evil.example.com/track.png'
     WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  '許可リスト外のホストを拒否する'
);

SELECT throws_ok(
  $$UPDATE profiles SET avatar_url = 'https://cdn.discordapp.com.evil.example/a.png'
     WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  '許可ホスト名で始まるだけの別ホストを拒否する'
);

SELECT throws_ok(
  $$UPDATE profiles SET avatar_url = 'https://x@cdn.discordapp.com/avatars/1/a.png'
     WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  'URLに埋め込んだ資格情報を拒否する'
);

SELECT throws_ok(
  $$UPDATE profiles SET avatar_url = 'http://cdn.discordapp.com/avatars/1/a.png'
     WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  'https 以外を拒否する'
);

-- ===== シーズン（Migration 0021 / ADR-030）=====

SELECT throws_ok(
  $$INSERT INTO seasons (number, status) VALUES (99, 'UNKNOWN')$$,
  '23514',
  NULL,
  'シーズンの状態は3種類に限る'
);

-- ★同時に2つのシーズンが進行してはならない。
SELECT throws_ok(
  $$INSERT INTO seasons (number, status) VALUES (99, 'ACTIVE')$$,
  '23505',
  NULL,
  'ACTIVE なシーズンは1件までとする'
);

SELECT lives_ok(
  $$INSERT INTO seasons (number, status, ended_at) VALUES (99, 'FINALIZED', NOW())$$,
  'FINALIZED は複数あってよい'
);

SELECT throws_ok(
  $$UPDATE system_settings SET season_grace_minutes = 0$$,
  '23514',
  NULL,
  '猶予時間は1分未満にできない'
);

SELECT throws_ok(
  $$UPDATE system_settings SET current_season = 0$$,
  '23514',
  NULL,
  'シーズン番号は1未満にできない'
);

SELECT * FROM finish();

ROLLBACK;
