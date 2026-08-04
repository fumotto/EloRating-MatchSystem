-- Row Level Security
--
-- 本ファイルは 03_Database.md 15章のRLS一覧を実装したものである。同表を正本とする。
--
-- ★「Edge Functions」と「禁止」は、いずれもクライアントロール（anon / authenticated）からは拒否である。
--   Edge Functions は DB へ直接接続し RLS を迂回するため（ADR-016）、RLSで許可を与える必要がない。
--   両者を区別するのはコメントのみであり、ポリシーの式はどちらも false となる。
--   したがってEdge Function内での認可チェックが必須である（R-003 / 04_BackendInterface.md 2.1）。
--
-- ★RLSは既定で拒否である。ポリシーを書かなくても操作は拒否される。
--   それでも全操作へ明示的にポリシーを定義するのは、15章の表と1対1で突き合わせられるようにするためである。
--
-- ★UPDATE と DELETE の拒否は WITH CHECK ではなく USING で表現する。
--   DELETE は WITH CHECK を受け付けない（構文エラーになる）。
--   UPDATE は USING を省略すると既定で true となり、対象行が読めてしまう。

-- profiles : SELECT 認証済み / INSERT 本人 / UPDATE 本人 / DELETE 禁止
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_profiles_select ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY p_profiles_update ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY p_profiles_delete ON profiles FOR DELETE USING (false); -- 禁止

-- teams : SELECT 全員（未認証を含む / ADR-018）/ INSERT・UPDATE Edge Functions / DELETE 禁止
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_teams_select ON teams FOR SELECT USING (true);
CREATE POLICY p_teams_insert ON teams FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_teams_update ON teams FOR UPDATE USING (false); -- Edge Functions
CREATE POLICY p_teams_delete ON teams FOR DELETE USING (false); -- 禁止

-- team_members : SELECT 認証済み / INSERT・UPDATE・DELETE Edge Functions
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_team_members_select ON team_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_team_members_insert ON team_members FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_team_members_update ON team_members FOR UPDATE USING (false); -- Edge Functions
CREATE POLICY p_team_members_delete ON team_members FOR DELETE USING (false); -- Edge Functions

-- team_invites : SELECT 自チームのメンバー / INSERT・UPDATE Edge Functions / DELETE 禁止
-- 招待コードの漏洩を防ぐため、参照を自チームに限定する（R-007）。
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_team_invites_select ON team_invites FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = team_invites.team_id
          AND tm.profile_id = auth.uid()
    )
);
CREATE POLICY p_team_invites_insert ON team_invites FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_team_invites_update ON team_invites FOR UPDATE USING (false); -- Edge Functions
CREATE POLICY p_team_invites_delete ON team_invites FOR DELETE USING (false); -- 禁止

-- matching_queue : SELECT 自チームのメンバー / INSERT・DELETE Edge Functions / UPDATE 禁止
-- 待ち伏せを防ぐため、参照を自チームに限定する（03_Database.md 9章）。
ALTER TABLE matching_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_matching_queue_select ON matching_queue FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = matching_queue.team_id
          AND tm.profile_id = auth.uid()
    )
);
CREATE POLICY p_matching_queue_insert ON matching_queue FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_matching_queue_update ON matching_queue FOR UPDATE USING (false); -- 禁止
CREATE POLICY p_matching_queue_delete ON matching_queue FOR DELETE USING (false); -- Edge Functions

-- matches : SELECT 認証済み / INSERT・UPDATE Edge Functions / DELETE 禁止
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_matches_select ON matches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_matches_insert ON matches FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_matches_update ON matches FOR UPDATE USING (false); -- Edge Functions
CREATE POLICY p_matches_delete ON matches FOR DELETE USING (false); -- 禁止

-- rating_history : SELECT 認証済み / INSERT Edge Functions / UPDATE・DELETE 禁止
ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_rating_history_select ON rating_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_rating_history_insert ON rating_history FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_rating_history_update ON rating_history FOR UPDATE USING (false); -- 禁止
CREATE POLICY p_rating_history_delete ON rating_history FOR DELETE USING (false); -- 禁止

-- system_settings : SELECT 認証済み / UPDATE Edge Functions / INSERT・DELETE 禁止
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_system_settings_select ON system_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_system_settings_insert ON system_settings FOR INSERT WITH CHECK (false); -- 禁止
CREATE POLICY p_system_settings_update ON system_settings FOR UPDATE USING (false); -- Edge Functions
CREATE POLICY p_system_settings_delete ON system_settings FOR DELETE USING (false); -- 禁止

-- audit_logs : SELECT 管理者 / INSERT Edge Functions / UPDATE・DELETE 禁止
-- 追記専用テーブルである（ADR-017）。管理者判定はJWTのクレームで行う（ADR-020）。
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_audit_logs_select ON audit_logs FOR SELECT USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
CREATE POLICY p_audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_audit_logs_update ON audit_logs FOR UPDATE USING (false); -- 禁止
CREATE POLICY p_audit_logs_delete ON audit_logs FOR DELETE USING (false); -- 禁止


-- ---------------------------------------------------------------------------
-- テーブル権限（GRANT）
--
-- ★RLSポリシーだけでは参照できない。テーブル権限とRLSは別の関門であり、両方を通す必要がある。
--   Supabase の既定では、新規テーブルに対して anon / authenticated へ付与されるのは
--   TRUNCATE / REFERENCES / TRIGGER / MAINTAIN のみであり、SELECT は付与されない。
--   GRANT を書かないとポリシーが許可していても PostgREST は 401 を返す。
--
-- ★付与対象はクライアントロール（anon / authenticated）のみである。
--   Edge Functions は DB へ直接接続し、RLSも権限も迂回するため付与を必要としない（ADR-016）。
--
-- 付与範囲の正本は 03_Database.md 15章である。
-- ---------------------------------------------------------------------------

-- SELECT : 未認証を含む全員（ADR-018）
GRANT SELECT ON teams TO anon, authenticated;

-- SELECT : 認証済み
-- team_invites / matching_queue は行の絞り込みをRLSで行う（自チームのみ）。
-- audit_logs も同様に、RLSで管理者のみへ絞り込む。
GRANT SELECT ON profiles        TO authenticated;
GRANT SELECT ON team_members    TO authenticated;
GRANT SELECT ON team_invites    TO authenticated;
GRANT SELECT ON matching_queue  TO authenticated;
GRANT SELECT ON matches         TO authenticated;
GRANT SELECT ON rating_history  TO authenticated;
GRANT SELECT ON system_settings TO authenticated;
GRANT SELECT ON audit_logs      TO authenticated;

-- INSERT / UPDATE : 本人（profiles のみ。行の制限はRLSで行う）
GRANT INSERT, UPDATE ON profiles TO authenticated;

-- 上記以外の更新系は付与しない。すべて Edge Functions 経由とする。

-- 既定で付与される TRUNCATE を取り消す。
-- TRUNCATE にはRLSが適用されないため、権限が残っていると削除禁止の方針（03_Database.md 2.4）を迂回できる。
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
