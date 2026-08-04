-- View: team_ranking_view

CREATE VIEW team_ranking_view AS
SELECT
    t.id   AS team_id,
    t.name AS team_name,
    t.rating,
    RANK() OVER (ORDER BY t.rating DESC)          AS rank,
    COALESCE(h.wins, 0)                            AS wins,
    COALESCE(h.losses, 0)                          AS losses,
    COALESCE(h.wins, 0) + COALESCE(h.losses, 0)    AS matches,
    COALESCE(h.wins, 0)::NUMERIC
      / NULLIF(COALESCE(h.wins, 0) + COALESCE(h.losses, 0), 0) AS win_rate
FROM teams t
LEFT JOIN (
    SELECT
        team_id,
        COUNT(*) FILTER (WHERE result = 'WIN')  AS wins,
        COUNT(*) FILTER (WHERE result = 'LOSE') AS losses
    FROM rating_history
    GROUP BY team_id
) h ON h.team_id = t.id
WHERE t.is_banned = FALSE;

-- View: team_detail_view

CREATE VIEW team_detail_view AS
SELECT
    t.id   AS team_id,
    t.name AS team_name,
    t.rating,
    t.is_banned,
    (SELECT tm.profile_id
       FROM team_members tm
      WHERE tm.team_id = t.id AND tm.role = 'LEADER') AS leader_id,
    (SELECT COUNT(*)
       FROM team_members tm
      WHERE tm.team_id = t.id)                        AS member_count,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',          p.id,
               'displayName', p.display_name,
               'avatarUrl',   p.avatar_url,
               'role',        tm.role
             ) ORDER BY tm.role, tm.joined_at)
        FROM team_members tm
        JOIN profiles p ON p.id = tm.profile_id
       WHERE tm.team_id = t.id
    ), '[]'::jsonb)                                   AS members,
    t.created_at
FROM teams t;

-- View: match_list_view

CREATE VIEW match_list_view AS
SELECT
    m.id,
    m.team_a_id, ta.name AS team_a_name, ta.rating AS team_a_rating,
    m.team_b_id, tb.name AS team_b_name, tb.rating AS team_b_rating,
    m.winner_team_id,
    m.status,
    m.started_at,
    m.completed_at,
    m.created_at
FROM matches m
JOIN teams ta ON ta.id = m.team_a_id
JOIN teams tb ON tb.id = m.team_b_id;

-- View: match_detail_view

CREATE VIEW match_detail_view AS
SELECT
    m.id,
    m.team_a_id, ta.name AS team_a_name, ta.rating AS team_a_rating,
    m.team_b_id, tb.name AS team_b_name, tb.rating AS team_b_rating,
    m.winner_team_id,
    m.status,
    m.started_at,
    m.completed_at,
    m.created_at,
    m.reported_by_profile_id AS reported_by_id,
    rp.display_name          AS reported_by_name,
    m.reported_at,
    m.approved_by_profile_id AS approved_by_id,
    ap.display_name          AS approved_by_name,
    m.approved_at,
    m.auto_approved,
    m.reject_count,
    m.report_deadline_at,
    m.approve_deadline_at,
    m.version
FROM matches m
JOIN teams ta ON ta.id = m.team_a_id
JOIN teams tb ON tb.id = m.team_b_id
LEFT JOIN profiles rp ON rp.id = m.reported_by_profile_id
LEFT JOIN profiles ap ON ap.id = m.approved_by_profile_id;