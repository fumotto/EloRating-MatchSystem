-- Seed data for system_settings table
--
-- Seedは Migration に含める（03_Database.md 18章の作成順序、11_Deployment.md 8章）。
-- 値の正本は 03_Database.md 17章である。
--
-- 投入対象は system_settings のみである。
-- 管理者は auth.users.raw_app_meta_data へ設定するものであり、Seedの対象ではない（ADR-020）。

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