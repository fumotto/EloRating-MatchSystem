-- チーム人数上限の下限を 1 へ緩める（Issue #4）。
--
-- 0009 では `team_max_members > 1` としていたが、これは「チームは2人以上で組むもの」
-- という前提を制約へ埋め込んでいた。1人チームでの運用を許すため `>= 1` とする。
--
-- ★適用済みの 0009 は編集しない（11_Deployment.md 10.1 の追加方式）。
--   制約を張り替える Migration をここへ足す。
--
-- 1 を許すことによる業務上の影響は次のとおりで、いずれも既存の実装のまま成立する。
--   * マッチング必須人数も 1 になる（09_MatchmakingSpecification.md 4.1）。
--     必須人数は team_max_members と等しいため、1人チームがそのまま待機に入れる。
--   * 招待は発行できなくなる。create-team-invite は定員到達で TEAM-004 を返すため、
--     1人在籍かつ上限1のチームは既に定員である。
--   * 既存チームからメンバーを強制脱退させることはしない（04_BackendInterface.md 12.3）。
--     上限を下げても、超過している既存チームはそのまま残る。

ALTER TABLE system_settings
    DROP CONSTRAINT IF EXISTS chk_system_settings_team_max_members;

ALTER TABLE system_settings
    ADD CONSTRAINT chk_system_settings_team_max_members CHECK (team_max_members >= 1);
