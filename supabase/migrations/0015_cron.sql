-- Cron: 内部処理 Edge Functions の定期実行
--
-- 間隔の正本は 04_BackendInterface.md 11章である。
--   matchmaker              1分間隔（09 5章の救済実行）
--   auto-resolve-matches    1分間隔（ADR-014）
--   cleanup-matching-queue  10分間隔
--   cleanup-expired-invites 1時間間隔
--   finalize-season         1分間隔（Issue #9。登録は 0022_season_cron.sql）
--
-- 起動方式は pg_cron ＋ pg_net とする。Edge Function を HTTP で呼ぶため、
-- 呼び出し先URLと Service Role Key が必要になる。
--
-- ★これらを Migration へ直接書いてはならない。環境ごとに異なり、かつ Service Role Key は
--   秘匿情報である。Vault（`vault.create_secret`）へ登録し、実行時に読み出す。
--   登録手順は docs/project/SetupRunbook.md にある（人手作業）。
--
-- 秘密が未登録の環境（ローカル開発など）では呼び出しを行わず何もしない。
-- 未登録を失敗にすると `supabase db reset` のたびにCronがエラーを積む。

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Vault から値を1件取り出す。未登録なら NULL を返す。
CREATE OR REPLACE FUNCTION get_vault_secret(secret_name TEXT)
RETURNS TEXT AS $$
DECLARE
    secret_value TEXT;
BEGIN
    SELECT decrypted_secret INTO secret_value
      FROM vault.decrypted_secrets
     WHERE name = secret_name
     LIMIT 1;
    RETURN secret_value;
EXCEPTION
    -- Vault拡張が無い環境でも Migration を通す。
    WHEN undefined_table THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 内部処理 Edge Function を非同期に呼ぶ。
-- 認可は Service Role Key で行う（_shared/auth.ts の isServiceRole）。
CREATE OR REPLACE FUNCTION invoke_edge_function(function_name TEXT)
RETURNS VOID AS $$
DECLARE
    base_url TEXT := get_vault_secret('edge_function_base_url');
    service_key TEXT := get_vault_secret('service_role_key');
BEGIN
    IF base_url IS NULL OR service_key IS NULL THEN
        -- 未設定の環境では何もしない。ログも出さない（毎分の実行で埋まるため）。
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := base_url || '/' || function_name,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
        ),
        body := '{}'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 再実行できるよう、既存のジョブを外してから登録する。
SELECT cron.unschedule(jobname)
  FROM cron.job
 WHERE jobname IN (
    'matchmaker',
    'auto-resolve-matches',
    'cleanup-matching-queue',
    'cleanup-expired-invites'
 );

SELECT cron.schedule('matchmaker', '* * * * *', $$SELECT invoke_edge_function('matchmaker')$$);

SELECT cron.schedule(
    'auto-resolve-matches',
    '* * * * *',
    $$SELECT invoke_edge_function('auto-resolve-matches')$$
);

SELECT cron.schedule(
    'cleanup-matching-queue',
    '*/10 * * * *',
    $$SELECT invoke_edge_function('cleanup-matching-queue')$$
);

SELECT cron.schedule(
    'cleanup-expired-invites',
    '0 * * * *',
    $$SELECT invoke_edge_function('cleanup-expired-invites')$$
);

-- ★R-004（自動解決バッチの停止）への備え。
--   cron.job_run_details に失敗が積まれるため、運用時はここを監視する。
--   Cron が止まると試合が確定せず、両チームが以後マッチングできなくなる。
