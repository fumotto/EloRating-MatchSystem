-- Table: team_invites

CREATE TABLE team_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    invite_code_hash TEXT NOT NULL,
    created_by_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by_profile_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (invite_code_hash),
    CONSTRAINT chk_team_invites_status CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED')),
    CONSTRAINT chk_team_invites_expires_at CHECK (expires_at > created_at),
    CONSTRAINT chk_team_invites_used_at CHECK ((status = 'USED') = (used_at IS NOT NULL))
);

-- Unique index for active invite per team
CREATE UNIQUE INDEX ux_team_invites_active
ON team_invites(team_id)
WHERE status = 'ACTIVE';

-- Indexes
CREATE INDEX ix_team_invites_expires_at ON team_invites(expires_at) WHERE status = 'ACTIVE';