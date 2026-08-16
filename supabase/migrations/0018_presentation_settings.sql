-- トップページとルールページの表示設定（Issue #8）。
--
-- 運営が画面から変更できる表示上の設定を system_settings へ追加する。
-- 既存列は数値（期限・上限）だけであったため、文字列列はここが最初である。
--
-- ★匿名でも読めなければならない。トップページとルールページは未ログインで
--   表示する（Issue #8）。しかし system_settings 全体を anon へ公開してはならない。
--   K値や各種期限といった運用上の設定まで読めてしまう。
--   表示に必要な列だけを返す View を作り、そちらを公開する。

ALTER TABLE system_settings
    ADD COLUMN site_title TEXT NOT NULL DEFAULT 'EloRating-MatchSystem',
    ADD COLUMN background_image_path TEXT,
    ADD COLUMN rules_markdown TEXT NOT NULL DEFAULT '';

-- 空文字のタイトルは画面が壊れるため許さない。長さの上限も設ける。
ALTER TABLE system_settings
    ADD CONSTRAINT chk_system_settings_site_title
        CHECK (length(btrim(site_title)) BETWEEN 1 AND 60);

-- ★背景画像は public/ へ直接置き、その相対パスを設定する。
--   アップロード機能も外部URLの指定も持たない。
--   Storage は MVP では使用せず（11_Deployment.md 2章）、外部URLは
--   配信元の可用性・混在コンテンツ・追跡の問題を持ち込むためである。
--
--   運用は「public/ へ画像を置いて commit し、ファイル名を設定する」となる。
--   例：public/bg.jpg を置いて `bg.jpg` と設定する。
--
-- ★絶対URLとディレクトリ遡上を弾く。`//example.com` のようなスキーム相対や
--   `../` を通すと、意図しない配信元を参照させられる。
ALTER TABLE system_settings
    ADD CONSTRAINT chk_system_settings_background_image_path
        CHECK (
            background_image_path IS NULL
            OR (
                background_image_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
                AND background_image_path !~ '\.\.'
                AND background_image_path !~ '//'
                AND length(background_image_path) <= 200
            )
        );

-- ルール本文の上限。無制限にすると匿名へ返す応答が肥大する。
ALTER TABLE system_settings
    ADD CONSTRAINT chk_system_settings_rules_markdown
        CHECK (length(rules_markdown) <= 20000);

-- View: public_settings
--
-- 未認証を含む全員が参照する。表示に必要な列だけを返す。
--
-- ★security_invoker は付けない。基表 system_settings のSELECTは認証済みに
--   限定されており（0013_rls.sql）、付けると匿名から0件になる。
--   team_ranking_view と同じ扱いである（0011_views.sql の方針）。
--   本Viewが返すのは運営が公開を意図した表示設定のみであり、
--   K値・期限・上限といった運用設定は含まない。
CREATE VIEW public_settings AS
SELECT
    site_title,
    background_image_path,
    rules_markdown
  FROM system_settings
 WHERE id = 1;

GRANT SELECT ON public_settings TO anon, authenticated;
