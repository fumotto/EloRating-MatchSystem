-- 運営からのお知らせ（Issue #7）。
--
-- ヘッダーに1行の帯として出す。空なら帯を出さない。
--
-- ★0018 と同じく public_settings を通して匿名にも公開する。
--   お知らせはメンテナンス告知など、未ログインの利用者にも届ける必要がある。

ALTER TABLE system_settings
    ADD COLUMN announcement_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN announcement_level TEXT NOT NULL DEFAULT 'INFO';

-- 帯の色は3種類（Issue #7）。既定は INFO。
ALTER TABLE system_settings
    ADD CONSTRAINT chk_system_settings_announcement_level
        CHECK (announcement_level IN ('INFO', 'WARN', 'ALERT'));

-- 1行の帯であるため長さを絞る。長文はルールページへ書く。
ALTER TABLE system_settings
    ADD CONSTRAINT chk_system_settings_announcement_text
        CHECK (length(announcement_text) <= 200);

-- View を作り直して2列を足す。
--
-- ★CREATE OR REPLACE VIEW は列の追加であっても、既存列の後ろへ足す限り使える。
--   ただし列の型や順序を変える場合は DROP が要る。ここは追加のみである。
CREATE OR REPLACE VIEW public_settings AS
SELECT
    site_title,
    background_image_path,
    rules_markdown,
    announcement_text,
    announcement_level
  FROM system_settings
 WHERE id = 1;

-- CREATE OR REPLACE は権限を引き継ぐが、明示しておく。
GRANT SELECT ON public_settings TO anon, authenticated;
