-- Table: rating_history

CREATE TABLE rating_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    before_rating INTEGER NOT NULL,
    after_rating INTEGER NOT NULL,
    rating_change INTEGER NOT NULL,
    k_value INTEGER NOT NULL,
    result TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, team_id),
    CONSTRAINT chk_rating_history_result CHECK (result IN ('WIN', 'LOSE')),
    CONSTRAINT chk_rating_history_after_rating CHECK (after_rating >= 100),
    CONSTRAINT chk_rating_history_rating_change CHECK (rating_change = after_rating - before_rating),
    CONSTRAINT chk_rating_history_k_value CHECK (k_value > 0)
);

-- Indexes
CREATE INDEX ix_rating_history_match_team ON rating_history(match_id, team_id);
CREATE INDEX ix_rating_history_team_completed ON rating_history(team_id, completed_at DESC);
CREATE INDEX ix_rating_history_match ON rating_history(match_id);
CREATE INDEX ix_rating_history_completed ON rating_history(completed_at DESC);