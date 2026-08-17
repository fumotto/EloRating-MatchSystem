-- ===== 0020_avatar_url_allowlist.sql =====
-- profiles.avatar_url の配信元を限定する。
--
-- ★本カラムは他の利用者の画面で <img src> に載る（チーム詳細・マイチーム）。
--   任意のURLを許すと、チーム画面を開いただけで閲覧者のIPとUAが
--   指定先のサーバへ渡る。プレイヤー同士の追跡に使えてしまう。
--
-- ★Edge Function 側の検証だけでは足りない。profiles は本人がクライアントから
--   直接UPDATEできる（03_Database.md 19章）ため、Edge Function を通らない経路がある。
--   DB側を最終の関門とする。
--
-- ★規則は supabase/functions/_shared/avatarUrl.ts と同じである。
--   どちらかだけを変えてはならない。

-- 既存の値のうち、規則に合わないものを落とす。
-- 制約を追加する前に片付けないと、既存行が違反して ALTER が失敗する。
UPDATE profiles
   SET avatar_url = NULL
 WHERE avatar_url IS NOT NULL
   AND avatar_url !~ '^https://(cdn\.discordapp\.com|media\.discordapp\.net|avatars\.steamstatic\.com|avatars\.(akamai|cloudflare)\.steamstatic\.com)/[A-Za-z0-9._~/-]+(\?[A-Za-z0-9._~=&%-]*)?$';

UPDATE profiles
   SET avatar_url = NULL
 WHERE avatar_url IS NOT NULL
   AND LENGTH(avatar_url) > 500;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_avatar_url_allowlist
  CHECK (
    avatar_url IS NULL
    OR (
      LENGTH(avatar_url) <= 500
      AND avatar_url ~ '^https://(cdn\.discordapp\.com|media\.discordapp\.net|avatars\.steamstatic\.com|avatars\.(akamai|cloudflare)\.steamstatic\.com)/[A-Za-z0-9._~/-]+(\?[A-Za-z0-9._~=&%-]*)?$'
    )
  );
