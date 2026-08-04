-- Triggers for update_updated_at function on tables
--
-- 本ファイルを updated_at トリガの唯一の定義箇所とする（03_Database.md 18章の作成順序）。
-- 各テーブルのMigration側で重複して定義してはならない。
--
-- 対象は 03_Database.md 14.1 に定める profiles / teams / system_settings の3テーブルのみである。
-- team_members は updated_at 列を持たないため対象外とする。
-- （対象外のテーブルへ張ると UPDATE 時に "record new has no field updated_at" で失敗する）

CREATE TRIGGER tr_profiles_update_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_teams_update_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_system_settings_update_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
