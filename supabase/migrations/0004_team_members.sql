-- Table: team_members

CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id),
    CONSTRAINT chk_team_members_role CHECK (role IN ('LEADER', 'MEMBER'))
);

-- Unique index for team leader
CREATE UNIQUE INDEX ux_team_members_leader
ON team_members(team_id)
WHERE role = 'LEADER';

-- Indexes
CREATE INDEX ix_team_members_team ON team_members(team_id);

-- Trigger for updated_at
CREATE TRIGGER tr_team_members_update_updated_at
BEFORE UPDATE ON team_members
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();