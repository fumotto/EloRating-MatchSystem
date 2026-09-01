-- サブアカウント対策（ADR-036）
--
-- 正本は 03_Database.md 18.11 である。
--
-- ★本Migrationは「同定」を一切行わない。IPアドレスも端末情報も収集しない。
--   目的はサブアカウントの発見ではなく、**サブアカウントを持っていても得をしないこと**である。
--   同定に依存しないため、VPN・回線の使い分けはここに何一つ効かない（ADR-036 理由）。

-- =====================================================================
-- 1. system_settings（ADR-036 ①③）
-- =====================================================================

ALTER TABLE system_settings
  ADD COLUMN rematch_cooldown_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN ranking_min_opponents INTEGER NOT NULL DEFAULT 3;

ALTER TABLE system_settings
  ADD CONSTRAINT chk_system_settings_rematch_cooldown_hours CHECK (rematch_cooldown_hours >= 0),
  ADD CONSTRAINT chk_system_settings_ranking_min_opponents CHECK (ranking_min_opponents >= 0);

COMMENT ON COLUMN system_settings.rematch_cooldown_hours IS
  '確定した試合の相手と再び当たれない長さ。0 で無効（ADR-036 ①）';
COMMENT ON COLUMN system_settings.ranking_min_opponents IS
  'ランキングへ掲載する最低の異なる対戦相手数。0 で無効（ADR-036 ③）';

-- =====================================================================
-- 2. team_ranking_view の再作成（ADR-036 ③）
-- =====================================================================
--
-- ★CREATE OR REPLACE VIEW は列の追加に使えないため DROP → CREATE で行う（0023 と同じ）。
--
-- ★掲載しないチームを本Viewから消さない。`rank` を NULL にして残す。
--   消すと「自分がなぜ載らないのか」を画面から説明できない。掲載の抑止であって
--   隠蔽ではない（ADR-036 備考）。
--
-- ★RANK() は掲載対象だけで数え直す。掲載しないチームを含めて数えると順位に穴が空く。
--   PARTITION BY listed により、掲載対象の区画の中だけで 1 から並ぶ。

DROP VIEW IF EXISTS team_ranking_view;

CREATE VIEW team_ranking_view AS
WITH opponents AS (
    -- 異なる対戦相手数。★DRAWN は数えない。対戦相手の広さを見る指標であり、
    --   決着しなかった試合を数えると身代わりを立てて不成立にするだけで満たせてしまう。
    SELECT team_id, COUNT(DISTINCT opponent_id) AS distinct_opponents
    FROM (
        SELECT team_a_id AS team_id, team_b_id AS opponent_id
          FROM matches WHERE status = 'COMPLETED'
        UNION ALL
        SELECT team_b_id AS team_id, team_a_id AS opponent_id
          FROM matches WHERE status = 'COMPLETED'
    ) o
    GROUP BY team_id
),
base AS (
    SELECT
        t.id   AS team_id,
        t.name AS team_name,
        t.rating,
        COALESCE(h.wins, 0)                            AS wins,
        COALESCE(h.losses, 0)                          AS losses,
        COALESCE(h.wins, 0) + COALESCE(h.losses, 0)    AS matches,
        COALESCE(h.wins, 0)::NUMERIC
          / NULLIF(COALESCE(h.wins, 0) + COALESCE(h.losses, 0), 0) AS win_rate,
        COALESCE(n.no_contests, 0)                     AS no_contests,
        (COALESCE(h.wins, 0) + COALESCE(h.losses, 0))::NUMERIC
          / NULLIF(COALESCE(h.wins, 0) + COALESCE(h.losses, 0) + COALESCE(n.no_contests, 0), 0)
                                                       AS settle_rate,
        COALESCE(n.void_count, 0)                      AS void_count,
        COALESCE(o.distinct_opponents, 0)              AS distinct_opponents,
        COALESCE(o.distinct_opponents, 0)
          >= (SELECT s.ranking_min_opponents FROM system_settings s WHERE s.id = 1) AS listed
    FROM teams t
    LEFT JOIN (
        SELECT
            team_id,
            COUNT(*) FILTER (WHERE result = 'WIN')  AS wins,
            COUNT(*) FILTER (WHERE result = 'LOSE') AS losses
        FROM rating_history
        GROUP BY team_id
    ) h ON h.team_id = t.id
    LEFT JOIN (
        -- 当事者に帰責する DRAWN のみを不戦として数える（0023 から変更なし）。
        SELECT
            team_id,
            COUNT(*) FILTER (
                WHERE no_contest_reason IN ('REPORT_TIMEOUT', 'CONFLICT')
                   OR (no_contest_reason = 'NO_SHOW' AND team_id <> no_contest_requested_by_team_id)
            ) AS no_contests,
            COUNT(*) FILTER (WHERE no_contest_reason = 'MUTUAL') AS void_count
        FROM (
            SELECT team_a_id AS team_id, no_contest_reason, no_contest_requested_by_team_id
              FROM matches WHERE status = 'DRAWN'
            UNION ALL
            SELECT team_b_id AS team_id, no_contest_reason, no_contest_requested_by_team_id
              FROM matches WHERE status = 'DRAWN'
        ) d
        GROUP BY team_id
    ) n ON n.team_id = t.id
    LEFT JOIN opponents o ON o.team_id = t.id
    WHERE t.is_banned = FALSE
)
SELECT
    b.team_id,
    b.team_name,
    b.rating,
    CASE WHEN b.listed
         THEN RANK() OVER (PARTITION BY b.listed ORDER BY b.rating DESC)
    END AS rank,
    b.wins,
    b.losses,
    b.matches,
    b.win_rate,
    b.no_contests,
    b.settle_rate,
    b.void_count,
    b.distinct_opponents,
    b.listed
FROM base b;

GRANT SELECT ON team_ranking_view TO anon, authenticated;

-- =====================================================================
-- 3. 疑わしいペア（ADR-036 ④）
-- =====================================================================
--
-- ★本Viewは判定しない。管理者へ材料を渡すだけである。自動の措置は一切結び付けない。
--   ADR-033 ④ が通報の累積を管理画面に出すに留めたのと同じ位置づけである。
--
-- ★管理者以外には1件も返さない。基表 matches は認証済みなら誰でも読めるため、
--   security_invoker だけでは絞れない。auth.jwt() の app_metadata.role で明示的に閉じる
--   （audit_logs のRLSと同じ出所。user_metadata を見てはならない / ADR-020）。
--
-- ★Edge Function からは参照しない。DB直結では auth.jwt() が NULL であり0件になる。
--   本Viewは PostgREST 経由の管理画面専用である。

CREATE VIEW suspicious_pair_view
WITH (security_invoker = true) AS
WITH settled AS (
    SELECT
        LEAST(m.team_a_id, m.team_b_id)    AS team_low_id,
        GREATEST(m.team_a_id, m.team_b_id) AS team_high_id,
        m.winner_team_id,
        m.started_at,
        m.completed_at,
        -- 投了で終わったか。★matches に投了の列は無いため audit_logs から導く
        --   （concede-match は MATCH_CONCEDED を残す）。target_id は TEXT である。
        EXISTS (
            SELECT 1 FROM audit_logs a
             WHERE a.target_id = m.id::TEXT AND a.action = 'MATCH_CONCEDED'
        ) AS conceded
    FROM matches m
    WHERE m.status = 'COMPLETED'
),
pair AS (
    SELECT
        s.team_low_id,
        s.team_high_id,
        COUNT(*)::INTEGER AS match_count,
        COUNT(*) FILTER (WHERE s.winner_team_id = s.team_low_id)::INTEGER  AS low_wins,
        COUNT(*) FILTER (WHERE s.winner_team_id = s.team_high_id)::INTEGER AS high_wins,
        COUNT(*) FILTER (WHERE s.conceded)::INTEGER AS concede_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 60)::NUMERIC, 1)
            AS avg_settle_minutes,
        MAX(s.completed_at) AS last_completed_at
    FROM settled s
    GROUP BY s.team_low_id, s.team_high_id
)
SELECT
    p.team_low_id,
    p.team_high_id,
    p.match_count,
    p.low_wins,
    p.high_wins,
    p.concede_count,
    p.avg_settle_minutes,
    p.last_completed_at,
    -- 一方向性。0.5 が互角、1.0 は一度も逆向きの結果が出ていない。
    GREATEST(p.low_wins, p.high_wins)::NUMERIC / p.match_count AS one_sided_ratio,
    -- 同時在席の欠如。両チームが**同じ時刻に別々の試合へ出たことが一度も無い**。
    -- 人は2つのチームを同時に操作できないため、VPNでも回線の使い分けでも消せない。
    --
    -- ★これは疑いであって証拠ではない。片方が新参で他の対戦を持たない場合も真になる。
    -- ★当該ペア同士の試合は重なりに数えない。数えると常に偽になる。
    -- ★総当たりの比較になるため、対象を match_count >= 2 のペアに絞ってから評価する。
    NOT EXISTS (
        SELECT 1
          FROM matches ma
          JOIN matches mb ON mb.id <> ma.id
         WHERE (ma.team_a_id = p.team_low_id  OR ma.team_b_id = p.team_low_id)
           AND (mb.team_a_id = p.team_high_id OR mb.team_b_id = p.team_high_id)
           AND NOT (ma.team_a_id IN (p.team_low_id, p.team_high_id)
                AND ma.team_b_id IN (p.team_low_id, p.team_high_id))
           AND NOT (mb.team_a_id IN (p.team_low_id, p.team_high_id)
                AND mb.team_b_id IN (p.team_low_id, p.team_high_id))
           AND ma.started_at < COALESCE(mb.completed_at, NOW())
           AND mb.started_at < COALESCE(ma.completed_at, NOW())
    ) AS never_concurrent
FROM pair p
WHERE p.match_count >= 2
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';

GRANT SELECT ON suspicious_pair_view TO authenticated;

-- =====================================================================
-- 4. チーム単位の偏り（ADR-036 ④）
-- =====================================================================
--
-- ★集計元は rating_history であり、シーズンの削除（admin-purge-season-data）で消える。
--   本Viewはシーズン内の偏りしか見ない。跨いだ観測が要るなら退避先を先に決めること。

CREATE VIEW team_integrity_view
WITH (security_invoker = true) AS
WITH per_match AS (
    SELECT
        rh.team_id,
        CASE WHEN m.team_a_id = rh.team_id THEN m.team_b_id ELSE m.team_a_id END AS opponent_id,
        rh.rating_change
    FROM rating_history rh
    JOIN matches m ON m.id = rh.match_id
),
per_opponent AS (
    SELECT
        team_id,
        opponent_id,
        COUNT(*)::INTEGER AS matches,
        -- 獲得のみを数える。負けた分を差し引くと「稼ぎ先の集中」が見えなくなる。
        SUM(GREATEST(rating_change, 0))::INTEGER AS gained
    FROM per_match
    GROUP BY team_id, opponent_id
),
totals AS (
    SELECT
        team_id,
        SUM(matches)::INTEGER AS settled_matches,
        COUNT(*)::INTEGER     AS distinct_opponents,
        SUM(gained)::INTEGER  AS gained_total
    FROM per_opponent
    GROUP BY team_id
),
top AS (
    -- 最も稼がせてくれた相手。同点は試合数、さらに同点はIDで決めて結果を一意にする。
    SELECT DISTINCT ON (team_id) team_id, opponent_id, matches, gained
    FROM per_opponent
    ORDER BY team_id, gained DESC, matches DESC, opponent_id
)
SELECT
    tt.team_id,
    tt.settled_matches,
    tt.distinct_opponents,
    tt.gained_total,
    tp.opponent_id AS top_opponent_id,
    tp.matches     AS top_opponent_matches,
    tp.gained      AS top_opponent_gained,
    -- 獲得の集中。1.0 に近いほど、稼ぎが単一の相手から来ている。
    tp.gained::NUMERIC / NULLIF(tt.gained_total, 0) AS top_opponent_gain_share
FROM totals tt
JOIN top tp ON tp.team_id = tt.team_id
WHERE (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';

GRANT SELECT ON team_integrity_view TO authenticated;
