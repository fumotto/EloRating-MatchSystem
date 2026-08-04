-- RLS policies for profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_profiles_select ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY p_profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- RLS policies for teams table
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_teams_select ON teams FOR SELECT USING (true);
CREATE POLICY p_teams_insert ON teams FOR INSERT WITH CHECK (false); -- Only by Edge Functions
CREATE POLICY p_teams_update ON teams FOR UPDATE WITH CHECK (false); -- Only by Edge Functions

-- RLS policies for team_members table
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_team_members_select ON team_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_team_members_insert ON team_members FOR INSERT WITH CHECK (false); -- Only by Edge Functions
CREATE POLICY p_team_members_update ON team_members FOR UPDATE WITH CHECK (false); -- Only by Edge Functions
CREATE POLICY p_team_members_delete ON team_members FOR DELETE WITH CHECK (false); -- Only by Edge Functions

-- RLS policies for team_invites table
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_team_invites_select ON team_invites FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = team_invites.team_id
          AND tm.profile_id = auth.uid()
    )
);
CREATE POLICY p_team_invites_insert ON team_invites FOR INSERT WITH CHECK (false); -- Only by Edge Functions
CREATE POLICY p_team_invites_update ON team_invites FOR UPDATE WITH CHECK (false); -- Only by Edge Functions

-- RLS policies for matching_queue table
ALTER TABLE matching_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_matching_queue_select ON matching_queue FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = matching_queue.team_id
          AND tm.profile_id = auth.uid()
    )
);
CREATE POLICY p_matching_queue_insert ON matching_queue FOR INSERT WITH CHECK (false); -- Only by Edge Functions
CREATE POLICY p_matching_queue_update ON matching_queue FOR UPDATE WITH CHECK (false); -- Only by Edge Functions

-- RLS policies for matches table
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_matches_select ON matches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_matches_insert ON matches FOR INSERT WITH CHECK (false); -- Only by Edge Functions
CREATE POLICY p_matches_update ON matches FOR UPDATE WITH CHECK (false); -- Only by Edge Functions

-- RLS policies for rating_history table
ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_rating_history_select ON rating_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_rating_history_insert ON rating_history FOR INSERT WITH CHECK (false); -- Only by Edge Functions
CREATE POLICY p_rating_history_update ON rating_history FOR UPDATE WITH CHECK (false); -- Only by Edge Functions

-- RLS policies for system_settings table
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_system_settings_select ON system_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_system_settings_update ON system_settings FOR UPDATE WITH CHECK (false); -- Only by Edge Functions

-- RLS policies for audit_logs table
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_audit_logs_select ON audit_logs FOR SELECT USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
CREATE POLICY p_audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (false); -- Only by Edge Functions