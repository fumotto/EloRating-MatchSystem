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

-- team_members は updated_at 列を持たない。
-- 03_Database.md 14.1 の update_updated_at() 対象は profiles / teams / system_settings のみであり、
-- 10.3 にも Trigger の定義は無い。したがって本テーブルへ更新トリガを張ってはならない。
