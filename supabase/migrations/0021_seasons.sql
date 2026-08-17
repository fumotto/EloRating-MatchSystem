-- ===== 0021_seasons.sql =====
-- シーズン制（Issue #9）。
--
-- ★13_FutureFeatures.md でシーズン制はMVP対象外としていた。本マイグレーションで
--   その判断を覆す。経緯は ADR-023（15_DecisionLog.md）に記録する。
--
-- ★シーズン終了は1回の操作では完結しない。進行中の試合を自然に決着させる猶予が要り、
--   猶予は Edge Function の実行時間を超える。状態をDBに持ち、段階を跨いで進める。
--
--   ACTIVE          通常営業
--     ↓ admin-end-season（マッチングを止め、猶予を開始する）
--   ENDING          猶予中。進行中の試合は申告・承認できる
--     ↓ finalize-season（cron。猶予経過後に自動で確定する）
--   FINALIZED       退避・レートリセット済み。更新操作は禁止のまま
--     ↓ admin-export-season-data → admin-purge-season-data（任意）
--     ↓ admin-resume-season
--   （次シーズンが ACTIVE）

-- ---- 運用状態 ----

ALTER TABLE system_settings
  ADD COLUMN current_season INTEGER NOT NULL DEFAULT 1
    CONSTRAINT system_settings_current_season_positive CHECK (current_season >= 1),
  -- マッチングの受付。シーズン終了の開始で止める。
  ADD COLUMN matchmaking_paused BOOLEAN NOT NULL DEFAULT FALSE,
  -- ★利用者側の更新操作の禁止。確定処理の最中に編成やレートが動くと、
  --   退避した内容と実データが食い違う。
  ADD COLUMN updates_locked BOOLEAN NOT NULL DEFAULT FALSE,
  -- 猶予時間。進行中の試合が自然に決着するのを待つ長さである。
  ADD COLUMN season_grace_minutes INTEGER NOT NULL DEFAULT 10
    CONSTRAINT system_settings_season_grace_range CHECK (season_grace_minutes BETWEEN 1 AND 1440);

-- ---- シーズン ----

CREATE TABLE seasons (
    number       INTEGER PRIMARY KEY CHECK (number >= 1),
    status       TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ENDING', 'FINALIZED')),
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 猶予の期限。ENDING の間だけ意味を持つ。
    grace_until  TIMESTAMPTZ,
    ended_at     TIMESTAMPTZ,
    -- 終了操作時に管理者が選んだ内容。確定は cron が行うため、選択を持ち越す必要がある。
    disband_active_teams BOOLEAN NOT NULL DEFAULT FALSE,
    disband_banned_teams BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ★同時に2つのシーズンが進行してはならない。ACTIVE と ENDING は各1件までとする。
CREATE UNIQUE INDEX ux_seasons_open ON seasons (status) WHERE status IN ('ACTIVE', 'ENDING');

INSERT INTO seasons (number, status) VALUES (1, 'ACTIVE');

-- ---- 退避（シーズン別ランキング）----
--
-- ★チームは総解散で削除されうる（Issue #9）。teams への外部キーを張らず、
--   名前を複製して持つ。参照先が消えても過去のランキングを表示できるようにする。

CREATE TABLE season_rankings (
    season_number INTEGER NOT NULL REFERENCES seasons(number) ON DELETE RESTRICT,
    team_id       UUID    NOT NULL,
    team_name     TEXT    NOT NULL,
    rating        INTEGER NOT NULL,
    rank          INTEGER NOT NULL,
    wins          INTEGER NOT NULL,
    losses        INTEGER NOT NULL,
    matches       INTEGER NOT NULL,
    win_rate      NUMERIC,
    is_banned     BOOLEAN NOT NULL,
    PRIMARY KEY (season_number, team_id)
);

CREATE INDEX ix_season_rankings_rank ON season_rankings (season_number, rank);

CREATE TABLE season_members (
    season_number INTEGER NOT NULL REFERENCES seasons(number) ON DELETE RESTRICT,
    team_id       UUID    NOT NULL,
    profile_id    UUID    NOT NULL,
    display_name  TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('LEADER', 'MEMBER')),
    PRIMARY KEY (season_number, team_id, profile_id)
);

-- ---- 持ち出しの記録 ----
--
-- ★audit_logs とは別の表にする。ログの削除は本機能の対象であり（Issue #9）、
--   持ち出しの記録を audit_logs に置くと、ログを消した時点で
--   「ダウンロード済み」の証跡ごと消える。削除の可否を判断できなくなる。

CREATE TABLE season_exports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_number     INTEGER NOT NULL REFERENCES seasons(number) ON DELETE RESTRICT,
    kind              TEXT NOT NULL CHECK (kind IN ('MATCHES', 'LOGS')),
    actor_profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    row_count         INTEGER NOT NULL,
    exported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_season_exports_lookup ON season_exports (season_number, kind);

-- ---- 公開 ----
--
-- ★シーズン別ランキングは未認証にも見せる。現行ランキングと同じ扱いである（ADR-018）。
--   本Viewはチーム単位の情報のみを返す。

CREATE VIEW season_ranking_view AS
SELECT
    r.season_number,
    r.team_id,
    r.team_name,
    r.rating,
    r.rank,
    r.wins,
    r.losses,
    r.matches,
    r.win_rate,
    r.is_banned,
    s.ended_at
FROM season_rankings r
JOIN seasons s ON s.number = r.season_number
WHERE s.status = 'FINALIZED';

-- ★メンバーの退避は認証済み限定とする。現行のメンバー一覧（team_detail_view）と
--   同じ扱いである。未認証へ全プレイヤーの表示名を晒さない。
CREATE VIEW season_member_view AS
SELECT
    m.season_number,
    m.team_id,
    m.profile_id,
    m.display_name,
    m.role
FROM season_members m
JOIN seasons s ON s.number = m.season_number
WHERE s.status = 'FINALIZED';

ALTER VIEW season_member_view SET (security_invoker = true);

CREATE VIEW season_list_view AS
SELECT number, status, started_at, ended_at
FROM seasons
WHERE status = 'FINALIZED';

-- ---- RLS ----

ALTER TABLE seasons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_exports  ENABLE ROW LEVEL SECURITY;

-- 更新はすべて Edge Functions が直接接続で行う（ADR-016）。
CREATE POLICY p_seasons_select         ON seasons         FOR SELECT USING (TRUE);
CREATE POLICY p_season_rankings_select ON season_rankings FOR SELECT USING (TRUE);
CREATE POLICY p_season_members_select  ON season_members  FOR SELECT USING (auth.uid() IS NOT NULL);
-- 持ち出しの記録は管理者のみが扱う。Edge Function 経由でしか読ませない。
CREATE POLICY p_season_exports_select  ON season_exports  FOR SELECT USING (FALSE);

GRANT SELECT ON seasons         TO anon, authenticated;
GRANT SELECT ON season_rankings TO anon, authenticated;
GRANT SELECT ON season_members  TO authenticated;

GRANT SELECT ON season_ranking_view TO anon, authenticated;
GRANT SELECT ON season_list_view    TO anon, authenticated;
GRANT SELECT ON season_member_view  TO authenticated;

-- ---- 運用状態の公開 ----
--
-- ★シーズン番号と停止状態は画面の案内に要る。未認証にも見せる。
--   「マッチングが止まっている」ことを伝えられないと、
--   利用者は不具合と区別できない。
--
-- ★列の追加のみであるため CREATE OR REPLACE で足りる（0019 の注記と同じ）。

CREATE OR REPLACE VIEW public_settings AS
SELECT
    site_title,
    background_image_path,
    rules_markdown,
    announcement_text,
    announcement_level,
    current_season,
    matchmaking_paused,
    updates_locked
  FROM system_settings
 WHERE id = 1;

GRANT SELECT ON public_settings TO anon, authenticated;
