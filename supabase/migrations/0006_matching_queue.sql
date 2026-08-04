-- Table: matching_queue

CREATE TABLE matching_queue (
    team_id UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX ix_matching_queue_queued_at ON matching_queue(queued_at);