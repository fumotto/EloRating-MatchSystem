-- Table: matches

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_a_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    team_b_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    winner_team_id UUID REFERENCES teams(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'PLAYING',
    reported_by_profile_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    reported_at TIMESTAMPTZ,
    approved_by_profile_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
    reject_count INTEGER NOT NULL DEFAULT 0,
    report_deadline_at TIMESTAMPTZ NOT NULL,
    approve_deadline_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_matches_status CHECK (status IN ('PLAYING', 'WINNER_REPORTED', 'COMPLETED', 'DRAWN')),
    CONSTRAINT chk_matches_teams_different CHECK (team_a_id <> team_b_id),
    CONSTRAINT chk_matches_winner_team_id CHECK (
        winner_team_id IS NULL
        OR winner_team_id IN (team_a_id, team_b_id)
    ),
    CONSTRAINT chk_matches_version CHECK (version >= 1),
    CONSTRAINT chk_matches_reject_count CHECK (reject_count >= 0),
    -- WINNER_REPORTED では申告情報が揃っていること
    CONSTRAINT chk_matches_winner_reported CHECK (
        status <> 'WINNER_REPORTED' OR (
            winner_team_id IS NOT NULL AND
            reported_by_profile_id IS NOT NULL AND
            reported_at IS NOT NULL AND
            approve_deadline_at IS NOT NULL
        )
    ),
    -- COMPLETED では勝者と確定情報が揃っていること
    CONSTRAINT chk_matches_completed CHECK (
        status <> 'COMPLETED' OR (
            winner_team_id IS NOT NULL AND
            completed_at IS NOT NULL AND
            approved_at IS NOT NULL AND
            (approved_by_profile_id IS NOT NULL OR auto_approved = TRUE)
        )
    ),
    -- DRAWN では勝者が存在しないこと
    CONSTRAINT chk_matches_drawn CHECK (
        status <> 'DRAWN' OR (
            winner_team_id IS NULL AND
            completed_at IS NOT NULL
        )
    ),
    -- PLAYING では申告情報が存在しないこと
    CONSTRAINT chk_matches_playing CHECK (
        status <> 'PLAYING' OR (
            winner_team_id IS NULL AND
            reported_by_profile_id IS NULL AND
            reported_at IS NULL
        )
    )
);

-- Unique indexes for active matches per team
CREATE UNIQUE INDEX ux_matches_active_team_a ON matches(team_a_id) WHERE status NOT IN ('COMPLETED', 'DRAWN');
CREATE UNIQUE INDEX ux_matches_active_team_b ON matches(team_b_id) WHERE status NOT IN ('COMPLETED', 'DRAWN');

-- Indexes
CREATE INDEX ix_matches_created ON matches(created_at DESC);
CREATE INDEX ix_matches_status ON matches(status);
CREATE INDEX ix_matches_team_a ON matches(team_a_id);
CREATE INDEX ix_matches_team_b ON matches(team_b_id);

-- Partial indexes for batch jobs
CREATE INDEX ix_matches_report_deadline ON matches(report_deadline_at) WHERE status = 'PLAYING';
CREATE INDEX ix_matches_approve_deadline ON matches(approve_deadline_at) WHERE status = 'WINNER_REPORTED';