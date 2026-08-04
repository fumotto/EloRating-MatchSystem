-- Table: system_settings

CREATE TABLE system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    team_max_members INTEGER NOT NULL DEFAULT 3,
    initial_rating INTEGER NOT NULL DEFAULT 1500,
    rating_k INTEGER NOT NULL DEFAULT 32,
    match_rating_range INTEGER NOT NULL DEFAULT 400,
    invite_expiration_hours INTEGER NOT NULL DEFAULT 24,
    report_timeout_minutes INTEGER NOT NULL DEFAULT 60,
    approve_timeout_minutes INTEGER NOT NULL DEFAULT 10,
    max_reject_count INTEGER NOT NULL DEFAULT 2,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_system_settings_id CHECK (id = 1),
    CONSTRAINT chk_system_settings_team_max_members CHECK (team_max_members > 1),
    CONSTRAINT chk_system_settings_initial_rating CHECK (initial_rating >= 100),
    CONSTRAINT chk_system_settings_rating_k CHECK (rating_k BETWEEN 1 AND 128),
    CONSTRAINT chk_system_settings_match_rating_range CHECK (match_rating_range > 0),
    CONSTRAINT chk_system_settings_invite_expiration_hours CHECK (invite_expiration_hours > 0),
    CONSTRAINT chk_system_settings_report_timeout_minutes CHECK (report_timeout_minutes > 0),
    CONSTRAINT chk_system_settings_approve_timeout_minutes CHECK (approve_timeout_minutes > 0),
    CONSTRAINT chk_system_settings_max_reject_count CHECK (max_reject_count >= 0)
);

-- Trigger for updated_at
CREATE TRIGGER tr_system_settings_update_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();