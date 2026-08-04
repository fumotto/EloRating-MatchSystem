-- Seed data for system_settings table

INSERT INTO system_settings (
    id,
    team_max_members,
    initial_rating,
    rating_k,
    match_rating_range,
    invite_expiration_hours,
    report_timeout_minutes,
    approve_timeout_minutes,
    max_reject_count
)
VALUES (
    1,
    3,
    1500,
    32,
    400,
    24,
    60,
    10,
    2
);