-- Table: audit_logs

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_profile_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_audit_logs_target_type CHECK (target_type IN ('TEAM', 'MATCH', 'PROFILE', 'INVITE', 'SETTINGS', 'AUTH'))
);

-- Indexes
CREATE INDEX ix_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX ix_audit_logs_actor ON audit_logs(actor_profile_id);
CREATE INDEX ix_audit_logs_target ON audit_logs(target_type, target_id);