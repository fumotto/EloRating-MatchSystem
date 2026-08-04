-- Views
--
-- 公開範囲の正本は 03_Database.md 15章である。
--
--   team_ranking_view : 全員（未認証を含む / ADR-018）
--   team_detail_view  : 認証済み
--   match_list_view   : 認証済み
--   match_detail_view : 認証済み
--
-- ★PostgreSQLのViewは既定で「定義者の権限」で実行され、基表のRLSを迂回する。
--   何も指定しないと、認証済み限定であるべき3つのViewを未認証で参照できてしまう。
--   よって認証済み限定の3つには security_invoker を有効化し、基表のRLSを適用させる。
--
-- ★team_ranking_view だけは定義者の権限のままとする。
--   本Viewは rating_history を集計するが、同表のSELECTは認証済みに限定されている（15章）。
--   security_invoker を有効にすると、未認証からは集計元が0件となり、
--   勝敗数と勝率が常に0として表示される。ADR-018の「未認証でもランキングを閲覧できる」を満たせない。
--   本Viewはチーム単位の公開情報のみを返し、プレイヤー個人を特定できる列を含まない（03_Database.md 11.1）。

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

-- 公開範囲の適用（03_Database.md 15章）

-- 認証済み限定の3View：基表のRLSを適用させ、未認証ロールからの参照を取り消す。
ALTER VIEW team_detail_view  SET (security_invoker = on);
ALTER VIEW match_list_view   SET (security_invoker = on);
ALTER VIEW match_detail_view SET (security_invoker = on);

REVOKE ALL ON team_detail_view  FROM anon;
REVOKE ALL ON match_list_view   FROM anon;
REVOKE ALL ON match_detail_view FROM anon;

GRANT SELECT ON team_detail_view  TO authenticated;
GRANT SELECT ON match_list_view   TO authenticated;
GRANT SELECT ON match_detail_view TO authenticated;

-- 公開ランキング：未認証を含む全員へ参照を許可する（ADR-018）。
GRANT SELECT ON team_ranking_view TO anon, authenticated;