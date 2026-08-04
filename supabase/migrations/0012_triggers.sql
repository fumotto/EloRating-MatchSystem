-- Triggers for update_updated_at function on tables

CREATE TRIGGER tr_profiles_update_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_teams_update_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_team_members_update_updated_at
BEFORE UPDATE ON team_members
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_system_settings_update_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();