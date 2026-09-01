-- Database Test：RLS（10_TestSpecification_Part8_Security.md 3章）。
--
-- Edge Functions はDB直結でRLSを迂回するため、RLSが守るのは
-- 「クライアントが anon / authenticated キーで直接叩いた場合」である。
-- ここではその経路を role と request.jwt.claims の切り替えで再現する。
--
-- ★TC-SEC-013（レートの改ざん）と TC-SEC-018（他チームの招待参照）は特に重要である。
--   前者を許すとレートを自由に書き換えられ、後者を許すと招待制が無意味になる。

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(24);

-- ★遮断の「仕組み」ではなく「保証」を検証する。
--
--   本ファイルはかつて `throws_ok(..., '42501')` で「GRANT が無いこと」を確かめていた。
--   しかし Supabase の基盤イメージが更新され、`anon` / `authenticated` へ既定の
--   テーブル GRANT が付くと、遮断は GRANT ではなく RLS が担うようになる。
--   その場合は権限エラーが起きず、「0件が返る」「0行が更新される」に変わる。
--
--   守りたいのは「見えないこと」「書き換えられないこと」であって、どの層が止めるかではない。
--   仕組みを固定すると、保証が保たれているのにテストだけが壊れる（実際に壊れた）。

CREATE OR REPLACE FUNCTION pg_temp.is_hidden(query text) RETURNS boolean AS $fn$
DECLARE
  visible integer;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || query || ') s' INTO visible;
  RETURN visible = 0;
EXCEPTION
  WHEN insufficient_privilege THEN
    -- GRANT の段階で遮断された。見えないことに変わりはない。
    RETURN true;
END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.is_blocked(statement text) RETURNS boolean AS $fn$
DECLARE
  affected integer;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 0;
EXCEPTION
  WHEN insufficient_privilege THEN
    RETURN true;
END;
$fn$ LANGUAGE plpgsql;

INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@example.com');

INSERT INTO profiles (id, auth_provider, provider_user_id, display_name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'discord', 'discord-a', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'discord', 'discord-b', 'Bob');

INSERT INTO teams (id, name, rating)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Team A', 1500),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Team B', 1800);

-- Alice は Team A のリーダー、Bob は Team B のリーダー。
INSERT INTO team_members (team_id, profile_id, role)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'LEADER'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'LEADER');

INSERT INTO team_invites (team_id, invite_code_hash, created_by_profile_id, expires_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash-a',
   '11111111-1111-1111-1111-111111111111', NOW() + INTERVAL '1 day'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hash-b',
   '22222222-2222-2222-2222-222222222222', NOW() + INTERVAL '1 day');

INSERT INTO matching_queue (team_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id)
VALUES ('11111111-1111-1111-1111-111111111111', 'TEAM_CREATED', 'TEAM',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- === 未認証（anon）===

SET LOCAL ROLE anon;

-- TC-SEC-030 / ADR-018：ランキングは未認証でも閲覧できる。
--
-- ★件数の全体値で判定してはならない。E2E など他のテストが残したデータで簡単に崩れる。
--   本テストが用意した行が見えるかどうかで判定する。
SELECT ok(
  (SELECT COUNT(*) FROM team_ranking_view
    WHERE team_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) = 2,
  'rls: lets anonymous visitors read the ranking view'
);

SELECT ok(
  (SELECT COUNT(*) FROM teams
    WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) = 2,
  'rls: lets anonymous visitors read teams'
);

-- TC-SEC-019 招待は未認証から見えない。
-- GRANT が無ければ権限エラー、あれば RLS が空集合にする。どちらでも見えない（0013_rls.sql）。
SELECT ok(
  pg_temp.is_hidden($$
  SELECT id FROM team_invites
  $$),
  'rls: hides invites from anonymous visitors'
);

-- profiles は認証済み限定である。
SELECT ok(
  pg_temp.is_hidden($$
  SELECT id FROM profiles
  $$),
  'rls: hides profiles from anonymous visitors'
);

SELECT ok(
  pg_temp.is_blocked($$
  INSERT INTO teams (name) VALUES ('Anon Team')
  $$),
  'rls: blocks team creation by anonymous visitors'
);

RESET ROLE;

-- === Alice（Team A のリーダー）===

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- TC-SEC-017 自チームの招待は見える。
SELECT ok(
  (SELECT COUNT(*) FROM team_invites
    WHERE team_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1,
  'rls: lets a member read their own team invites'
);

-- TC-SEC-018 ★他チームの招待は見えない。
SELECT is_empty(
  $$SELECT id FROM team_invites
     WHERE team_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'rls: hides invites of other teams'
);

-- TC-SEC-026 ★他チームの待機状況は見えない。見えると待ち伏せが可能になる。
SELECT is_empty(
  $$SELECT team_id FROM matching_queue
     WHERE team_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'rls: hides queue entries of other teams'
);

-- TC-SEC-013 ★レートの改ざん。リーダーであっても teams を更新できない。
--   GRANT が無ければ権限エラー、あれば RLS が 0 行に落とす。どちらでも書き換わらない。
SELECT ok(
  pg_temp.is_blocked($$
  UPDATE teams SET rating = 9999
  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  $$),
  'rls: blocks a leader from editing the rating'
);

RESET ROLE;

-- 実際に値が変わっていないことも確かめる。
SELECT is(
  (SELECT rating FROM teams WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1500,
  'rls: leaves the rating untouched after a blocked update'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- TC-SEC-014 直接作成の禁止
SELECT ok(
  pg_temp.is_blocked($$
  INSERT INTO teams (name) VALUES ('Direct Team')
  $$),
  'rls: blocks direct team creation'
);

-- TC-SEC-016 メンバーの直接操作
SELECT ok(
  pg_temp.is_blocked($$
  INSERT INTO team_members (team_id, profile_id, role)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111', 'MEMBER')
  $$),
  'rls: blocks direct membership changes'
);

-- TC-QUEUE-047 待機の直接登録
SELECT ok(
  pg_temp.is_blocked($$
  INSERT INTO matching_queue (team_id)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  $$),
  'rls: rejects a direct insert from the client'
);

-- 招待の直接作成
SELECT ok(
  pg_temp.is_blocked($$
  INSERT INTO team_invites (team_id, invite_code_hash, created_by_profile_id, expires_at)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash-x',
  '11111111-1111-1111-1111-111111111111', NOW() + INTERVAL '1 day')
  $$),
  'rls: blocks direct invite creation'
);

-- 試合の直接作成
SELECT ok(
  pg_temp.is_blocked($$
  INSERT INTO matches (team_a_id, team_b_id, report_deadline_at)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NOW())
  $$),
  'rls: blocks direct match creation'
);

-- レート履歴の直接作成
SELECT ok(
  pg_temp.is_blocked($$
  INSERT INTO rating_history
  (match_id, team_id, before_rating, after_rating, rating_change, k_value, result, completed_at)
  VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  1500, 1600, 100, 32, 'WIN', NOW())
  $$),
  'rls: blocks direct rating history creation'
);

-- TC-ADMIN-054 一般利用者は監査ログを参照できない。
SELECT is_empty(
  $$SELECT id FROM audit_logs
     WHERE target_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'rls: hides the audit log from regular users'
);

-- システム設定は認証済みなら参照できる（TC-ADMIN-017）。人数上限・期限の表示に必要である。
SELECT ok(
  (SELECT COUNT(*) FROM system_settings) = 1,
  'rls: lets any authenticated user read the settings'
);

-- 設定の直接変更は禁止。変更は admin-update-system-settings 経由だけである。
SELECT ok(
  pg_temp.is_blocked($$
  UPDATE system_settings SET rating_k = 128 WHERE id = 1
  $$),
  'rls: blocks a direct system settings update'
);

RESET ROLE;

SELECT is(
  (SELECT rating_k FROM system_settings WHERE id = 1),
  32,
  'rls: leaves the settings untouched after a blocked update'
);

-- === 管理者（app_metadata.role = admin）===

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}';

-- TC-ADMIN-053 管理者は監査ログを参照できる。
SELECT ok(
  (SELECT COUNT(*) FROM audit_logs
    WHERE target_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1,
  'rls: lets an administrator read the audit log'
);

-- TC-ADMIN-055 / TC-ADMIN-056 監査ログは追記専用である（ADR-017）。
-- 管理者であっても書き換えられない。書き換えられる監査ログには証拠能力が無い。
SELECT ok(
  pg_temp.is_blocked($$
  UPDATE audit_logs SET action = 'TAMPERED'
  $$),
  'rls: rejects updates to the audit log'
);

SELECT ok(
  pg_temp.is_blocked($$
  DELETE FROM audit_logs
  $$),
  'rls: rejects deletes from the audit log'
);

RESET ROLE;

SELECT is(
  (SELECT action FROM audit_logs
    WHERE target_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'TEAM_CREATED',
  'rls: keeps the audit log entry intact'
);

SELECT * FROM finish();

ROLLBACK;
