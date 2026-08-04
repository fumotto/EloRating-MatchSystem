-- Table: profiles

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auth_provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_profiles_auth_provider CHECK (auth_provider IN ('steam', 'discord')),
    CONSTRAINT chk_profiles_display_name CHECK (length(display_name) BETWEEN 1 AND 50),
    UNIQUE (auth_provider, provider_user_id)
);

-- Trigger for updated_at
CREATE TRIGGER tr_profiles_update_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();