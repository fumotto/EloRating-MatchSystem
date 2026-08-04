-- Table: teams

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 1500,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_teams_rating CHECK (rating >= 100),
    CONSTRAINT chk_teams_name CHECK (length(name) BETWEEN 1 AND 30),
    UNIQUE (name)
);

-- Indexes
CREATE INDEX ix_teams_rating_desc ON teams(rating DESC);
CREATE INDEX ix_teams_is_banned ON teams(is_banned) WHERE is_banned = TRUE;

-- Trigger for updated_at
CREATE TRIGGER tr_teams_update_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();