-- 勝敗報告の確定方式の再設計（ADR-032 / ADR-033 / ADR-034 / ADR-035）
--
-- 正本は 03_Database.md 18.10 である。
--
-- ★本Migrationを分割してはならない。中間状態（例：拒否を廃止したが投了が無い）は、
--   敗者が結果を確定させる手段を持たない不整合な仕様となる。

-- =====================================================================
-- 1. teams : クールダウン（ADR-032 ④）
-- =====================================================================

ALTER TABLE teams
  ADD COLUMN queue_cooldown_until TIMESTAMPTZ;

COMMENT ON COLUMN teams.queue_cooldown_until IS
  '待機列へ入れない期限。判定は > NOW() のみ。NULLと過去日時は同義（ADR-032 ④）';

-- =====================================================================
-- 2. matches : 反対申告・不成立の申請・DRAWNの理由（ADR-032 ⑦⑧⑩ / ADR-034 ①）
-- =====================================================================

ALTER TABLE matches
  ADD COLUMN no_contest_reason TEXT,
  ADD COLUMN counter_claim_team_id UUID REFERENCES teams(id) ON DELETE RESTRICT,
  ADD COLUMN counter_claimed_at TIMESTAMPTZ,
  ADD COLUMN report_extension_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN no_contest_requested_by_team_id UUID REFERENCES teams(id) ON DELETE RESTRICT,
  ADD COLUMN no_contest_requested_at TIMESTAMPTZ,
  ADD COLUMN no_contest_reason_code TEXT,
  ADD COLUMN no_contest_request_count INTEGER NOT NULL DEFAULT 0;

-- 既存の DRAWN 行を埋める。当時 DRAWN へ至る経路は報告期限切れと拒否上限の2つであり、
-- 後者は reject_count > 0 で判別できる。
-- ★拒否上限に専用の値を与えない。廃止した経路であり、値を増やすと新しい仕様に
--   存在しない状態を将来のコードが扱わねばならなくなる（03_Database.md 18.10）。
UPDATE matches
   SET no_contest_reason = 'REPORT_TIMEOUT'
 WHERE status = 'DRAWN' AND no_contest_reason IS NULL;

-- 既存の chk_matches_* は編集せず、新しい制約として足す。
ALTER TABLE matches
  ADD CONSTRAINT chk_matches_no_contest_reason CHECK (
    no_contest_reason IS NULL
    OR no_contest_reason IN ('REPORT_TIMEOUT', 'NO_SHOW', 'MUTUAL', 'CONFLICT', 'ADMIN_VOID')
  ),
  ADD CONSTRAINT chk_matches_drawn_reason CHECK (
    (status = 'DRAWN') = (no_contest_reason IS NOT NULL)
  ),
  ADD CONSTRAINT chk_matches_counter_claim_team CHECK (
    counter_claim_team_id IS NULL
    OR counter_claim_team_id IN (team_a_id, team_b_id)
  ),
  ADD CONSTRAINT chk_matches_counter_claim_pair CHECK (
    (counter_claim_team_id IS NULL) = (counter_claimed_at IS NULL)
  ),
  ADD CONSTRAINT chk_matches_no_contest_team CHECK (
    no_contest_requested_by_team_id IS NULL
    OR no_contest_requested_by_team_id IN (team_a_id, team_b_id)
  ),
  ADD CONSTRAINT chk_matches_no_contest_pair CHECK (
    (no_contest_requested_by_team_id IS NULL) = (no_contest_requested_at IS NULL)
  ),
  ADD CONSTRAINT chk_matches_no_contest_reason_code CHECK (
    no_contest_reason_code IS NULL
    OR no_contest_reason_code IN ('CONNECTION', 'GAME_ISSUE', 'NO_RESPONSE', 'OTHER')
  ),
  ADD CONSTRAINT chk_matches_report_extension_count CHECK (report_extension_count >= 0),
  ADD CONSTRAINT chk_matches_no_contest_request_count CHECK (no_contest_request_count >= 0);

-- 保留中の申請を拾うための部分インデックス（auto-resolve-matches が使う）。
CREATE INDEX ix_matches_no_contest_pending
  ON matches (no_contest_requested_at)
  WHERE status = 'PLAYING' AND no_contest_requested_at IS NOT NULL;

-- =====================================================================
-- 3. 同時参加の制約を削除する（ADR-035 ③）
-- =====================================================================
--
-- ★2本の部分UNIQUEインデックスは列ごとに独立しており、「あるチームが片方の試合で
--   team_a、別の試合で team_b」という状態を防げなかった。すなわち意図した不変条件を
--   保証しておらず、保証していた内容（同じスロットに2回現れない）は誰も要求していない。
--
-- ★保証はアプリ層のみで行う。判定箇所は queue-match と runMatchmaking の2つである。
--   参照性能は ix_matches_team_a / ix_matches_team_b が引き続き担う。

DROP INDEX IF EXISTS ux_matches_active_team_a;
DROP INDEX IF EXISTS ux_matches_active_team_b;

-- =====================================================================
-- 4. system_settings（ADR-032 ④⑦⑧⑨ / ADR-034 ②③⑤）
-- =====================================================================

ALTER TABLE system_settings
  ADD COLUMN queue_cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN report_extension_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN max_report_extensions INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN no_show_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN no_show_response_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN max_no_contest_requests INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN mutual_no_contest_daily_limit INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN avoidance_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN max_avoidance_entries INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN maintenance_paused BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE system_settings
  ADD CONSTRAINT chk_system_settings_queue_cooldown_minutes CHECK (queue_cooldown_minutes > 0),
  ADD CONSTRAINT chk_system_settings_report_extension_minutes CHECK (report_extension_minutes > 0),
  ADD CONSTRAINT chk_system_settings_max_report_extensions CHECK (max_report_extensions >= 0),
  ADD CONSTRAINT chk_system_settings_no_show_minutes CHECK (no_show_minutes > 0),
  ADD CONSTRAINT chk_system_settings_no_show_response_minutes CHECK (no_show_response_minutes > 0),
  ADD CONSTRAINT chk_system_settings_max_no_contest_requests CHECK (max_no_contest_requests >= 0),
  ADD CONSTRAINT chk_system_settings_mutual_daily_limit CHECK (mutual_no_contest_daily_limit >= 0),
  ADD CONSTRAINT chk_system_settings_avoidance_days CHECK (avoidance_days > 0),
  ADD CONSTRAINT chk_system_settings_max_avoidance_entries CHECK (max_avoidance_entries >= 0);

-- 承認期限を 10 → 60 へ（ADR-032 ⑨）。
-- ★DEFAULT の変更は既存行に反映されないため、既存の1行も更新する。
ALTER TABLE system_settings ALTER COLUMN approve_timeout_minutes SET DEFAULT 60;
UPDATE system_settings SET approve_timeout_minutes = 60 WHERE id = 1;

-- max_reject_count は廃止した（ADR-032 ③）。列は残し、更新も参照もしない。
COMMENT ON COLUMN system_settings.max_reject_count IS
  '廃止（ADR-032 ③）。参照してはならない。列は Migration を編集しないために残す';
COMMENT ON COLUMN matches.reject_count IS
  '廃止（ADR-032 ③）。更新してはならない。過去の拒否記録を保つために残す';

-- =====================================================================
-- 5. abuse_reports : 通報（ADR-033）
-- =====================================================================
--
-- ★テーブル名は abuse_reports とし reports としない。勝敗の申告が report-match であり、
--   同じ語が別の概念を指すと読み違えるためである（14_Glossary 3.1）。

CREATE TABLE abuse_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    reporter_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    reporter_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    reason_code TEXT NOT NULL,
    detail TEXT NOT NULL,
    evidence_urls TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'OPEN',
    resolved_by_profile_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_abuse_reports_reason_code CHECK (
        reason_code IN ('FALSE_REPORT', 'NO_SHOW', 'HARASSMENT', 'CHEATING', 'OTHER')
    ),
    CONSTRAINT chk_abuse_reports_status CHECK (
        status IN ('OPEN', 'NO_ACTION', 'WARNED', 'COOLDOWN', 'BANNED', 'WITHDRAWN')
    ),
    CONSTRAINT chk_abuse_reports_detail CHECK (char_length(detail) BETWEEN 10 AND 1000),
    CONSTRAINT chk_abuse_reports_evidence CHECK (
        coalesce(array_length(evidence_urls, 1), 0) <= 3
    ),
    -- 自チームは通報できない。無所属（NULL）は妨げない。
    CONSTRAINT chk_abuse_reports_not_self CHECK (
        reporter_team_id IS DISTINCT FROM target_team_id
    ),
    CONSTRAINT chk_abuse_reports_resolved CHECK (
        (status = 'OPEN') = (resolved_at IS NULL)
    ),
    -- 取り下げ（WITHDRAWN）は通報者が行うため resolved_by_profile_id を持たない。
    CONSTRAINT chk_abuse_reports_resolver CHECK (
        status NOT IN ('NO_ACTION', 'WARNED', 'COOLDOWN', 'BANNED')
        OR resolved_by_profile_id IS NOT NULL
    )
);

-- 同一の試合について、同一チームから同一対象への通報を1件に限定する。
-- ★取り下げた通報は対象外。誤って出した通報を取り下げたあと出し直せるようにする。
CREATE UNIQUE INDEX ux_abuse_reports_dup
  ON abuse_reports (reporter_team_id, target_team_id, match_id)
  WHERE match_id IS NOT NULL AND status <> 'WITHDRAWN';

CREATE INDEX ix_abuse_reports_target ON abuse_reports (target_team_id, created_at DESC);
CREATE INDEX ix_abuse_reports_open ON abuse_reports (created_at) WHERE status = 'OPEN';
CREATE INDEX ix_abuse_reports_reporter ON abuse_reports (reporter_profile_id, created_at DESC);

-- =====================================================================
-- 6. match_avoidance : ペアの再マッチ抑止（ADR-034 ③）
-- =====================================================================

CREATE TABLE match_avoidance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_low_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    team_high_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ★ペアは順序を持たない。(A,B) と (B,A) が別行になると除外が片方向にしか効かない。
    CONSTRAINT chk_match_avoidance_order CHECK (team_low_id < team_high_id),
    CONSTRAINT chk_match_avoidance_expires CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX ux_match_avoidance_pair ON match_avoidance (team_low_id, team_high_id);
CREATE INDEX ix_match_avoidance_expires ON match_avoidance (expires_at);

-- =====================================================================
-- 7. RLS（03_Database.md 15章）
-- =====================================================================

-- abuse_reports : SELECT 管理者または通報者本人 / それ以外は Edge Functions
--
-- ★通報対象のチームは、自分が通報されたことを参照できない。
--   通報は誰でも無償で出せるため、可視にすると通報を浴びせるだけで評判を落とせる。
ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_abuse_reports_select ON abuse_reports FOR SELECT USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR reporter_profile_id = auth.uid()
);
CREATE POLICY p_abuse_reports_insert ON abuse_reports FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_abuse_reports_update ON abuse_reports FOR UPDATE USING (false); -- Edge Functions
CREATE POLICY p_abuse_reports_delete ON abuse_reports FOR DELETE USING (false); -- 禁止

-- match_avoidance : SELECT 認証済み / それ以外は Edge Functions
-- 登録内容はチーム詳細で公開する。隠すと、当たらない理由が利用者に分からなくなる。
ALTER TABLE match_avoidance ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_match_avoidance_select ON match_avoidance FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY p_match_avoidance_insert ON match_avoidance FOR INSERT WITH CHECK (false); -- Edge Functions
CREATE POLICY p_match_avoidance_update ON match_avoidance FOR UPDATE USING (false); -- Edge Functions
CREATE POLICY p_match_avoidance_delete ON match_avoidance FOR DELETE USING (false); -- Edge Functions

GRANT SELECT ON abuse_reports   TO authenticated;
GRANT SELECT ON match_avoidance TO authenticated;

-- =====================================================================
-- 8. View の再作成（ADR-032 ⑥ / ADR-033 ④）
-- =====================================================================
--
-- ★CREATE OR REPLACE VIEW は列の追加に使えないため DROP → CREATE で行う。

DROP VIEW IF EXISTS team_ranking_view;

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
      / NULLIF(COALESCE(h.wins, 0) + COALESCE(h.losses, 0), 0) AS win_rate,
    -- 信頼度。★集計元は rating_history ではなく matches である。
    --   DRAWN は rating_history を作らないため、既存の集計元では不戦を数えられない。
    COALESCE(n.no_contests, 0)                     AS no_contests,
    (COALESCE(h.wins, 0) + COALESCE(h.losses, 0))::NUMERIC
      / NULLIF(COALESCE(h.wins, 0) + COALESCE(h.losses, 0) + COALESCE(n.no_contests, 0), 0)
                                                   AS settle_rate,
    COALESCE(n.void_count, 0)                      AS void_count
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
    -- 当事者に帰責する DRAWN のみを不戦として数える。
    --   REPORT_TIMEOUT / CONFLICT … 両チーム
    --   NO_SHOW                  … 無応答側のみ（申請側は被害者であり計上しない）
    --   MUTUAL / ADMIN_VOID      … 計上しない（対戦が成立していない）
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
WHERE t.is_banned = FALSE;

GRANT SELECT ON team_ranking_view TO anon, authenticated;

-- 通報の累積（ADR-033 ④）。管理画面専用。
--
-- ★reporter_team_count（m）が判断の主材料である。report_count（n）は1チームから
--   何度でも増やせるため、単独では信号にならない。
-- ★無所属の通報者は n にのみ計上し、m には計上しない（COUNT(DISTINCT) は NULL を数えない）。
CREATE VIEW abuse_report_aggregate_view
WITH (security_invoker = true) AS
SELECT
    target_team_id,
    COUNT(*)                                AS report_count,
    COUNT(DISTINCT reporter_team_id)        AS reporter_team_count,
    COUNT(*) FILTER (WHERE status IN ('COOLDOWN', 'BANNED')) AS sanction_count,
    MAX(created_at)                         AS last_reported_at
FROM abuse_reports
WHERE status <> 'WITHDRAWN'
GROUP BY target_team_id;

GRANT SELECT ON abuse_report_aggregate_view TO authenticated;
