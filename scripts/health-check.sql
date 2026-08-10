-- 健全性確認（11_Deployment.md 13章）。
--
-- デプロイ直後に CI から実行し、運用中は手動でも実行する。
-- 監視項目の正本は 13.1 である。本スクリプトはそれを機械で確かめられる形にしたものである。
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/health-check.sql
--
-- ★異常を「表示する」だけでは見落とす。致命的なものは RAISE EXCEPTION で落とす。
--   ON_ERROR_STOP=1 と組み合わせることで、CI が赤くなる。

\set ON_ERROR_STOP on

-- === 1. スキーマが揃っているか =============================================
--
-- Migration の適用漏れをここで検出する。9テーブル・4ビューが 03_Database.md の定義である。

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(expected, ', ')
      INTO missing
      FROM unnest(ARRAY[
        'profiles', 'teams', 'team_members', 'team_invites', 'matching_queue',
        'matches', 'rating_history', 'system_settings', 'audit_logs'
      ]) AS expected
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = expected
     );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'テーブルが不足している: %', missing;
    END IF;

    SELECT string_agg(expected, ', ')
      INTO missing
      FROM unnest(ARRAY[
        'team_ranking_view', 'team_detail_view', 'match_list_view', 'match_detail_view'
      ]) AS expected
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = expected
     );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'ビューが不足している: %', missing;
    END IF;
END;
$$;

-- === 2. 初期設定が1件あるか ================================================
--
-- system_settings が空だと create-team も approve-match も SYSTEM-001 で落ちる。

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM system_settings WHERE id = 1) <> 1 THEN
        RAISE EXCEPTION 'system_settings の初期行が存在しない（Seed の適用漏れ）';
    END IF;
END;
$$;

-- === 3. RLS が有効か ========================================================
--
-- ★RLS が落ちている状態は、気付かないまま全データが読み書きされうる最悪の事故である。

DO $$
DECLARE
    unprotected TEXT;
BEGIN
    SELECT string_agg(c.relname, ', ')
      INTO unprotected
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity = FALSE;

    IF unprotected IS NOT NULL THEN
        RAISE EXCEPTION 'RLS が無効なテーブルがある: %', unprotected;
    END IF;
END;
$$;

-- === 4. Cron が登録されているか ============================================
--
-- ★自動解決バッチが止まると試合が確定せず、両チームが以後マッチングできなくなる（R-004）。
--   13.1 が最優先の監視対象としている項目である。

DO $$
DECLARE
    missing TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE EXCEPTION 'pg_cron が有効になっていない（0015_cron.sql の適用漏れ）';
    END IF;

    SELECT string_agg(expected, ', ')
      INTO missing
      FROM unnest(ARRAY[
        'matchmaker', 'auto-resolve-matches',
        'cleanup-matching-queue', 'cleanup-expired-invites'
      ]) AS expected
     WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = expected);

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Cron ジョブが登録されていない: %', missing;
    END IF;
END;
$$;

-- === 5. Cron の呼び出し先が設定されているか ================================
--
-- ★invoke_edge_function は Vault が未登録なら黙って何もしない（0015_cron.sql）。
--   毎分エラーを積まないための設計だが、そのぶん「登録し忘れ」に気付けない。
--   ここで明示的に警告する。ローカルでは未登録が正常なので、落とさず警告に留める。

DO $$
BEGIN
    IF get_vault_secret('edge_function_base_url') IS NULL
       OR get_vault_secret('service_role_key') IS NULL THEN
        RAISE WARNING 'Vault が未登録のため Cron は何も呼び出さない（SetupRunbook 8.1）';
    END IF;
END;
$$;

-- === 6. 運用状態の可視化 ====================================================
--
-- 以下は落とさず表示する。13.1 の「異常の兆候」を数値で見るためのものである。

\echo ''
\echo '--- Cron の直近の実行結果（失敗が続いていないか）---'
-- job_run_details が持つのは jobid だけである。名前は cron.job から引く。
SELECT j.jobname,
       d.status,
       COUNT(*) AS runs,
       MAX(d.start_time) AS last_run
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE d.start_time > NOW() - INTERVAL '1 hour'
 GROUP BY j.jobname, d.status
 ORDER BY j.jobname, d.status;

\echo ''
\echo '--- 滞留した待機（24時間以上・通常は0件）---'
SELECT COUNT(*) AS stale_queue_entries
  FROM matching_queue
 WHERE queued_at < NOW() - INTERVAL '24 hours';

\echo ''
\echo '--- 期限を過ぎたまま残る試合（自動解決が動いていれば0件に近い）---'
SELECT COUNT(*) FILTER (
         WHERE status = 'PLAYING' AND report_deadline_at < NOW() - INTERVAL '5 minutes'
       ) AS overdue_report,
       COUNT(*) FILTER (
         WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW() - INTERVAL '5 minutes'
       ) AS overdue_approve
  FROM matches;

\echo ''
\echo '--- 直近24時間の決着内訳（DRAWN の急増は期限が短すぎる兆候）---'
SELECT status, COUNT(*) AS matches
  FROM matches
 WHERE completed_at > NOW() - INTERVAL '24 hours'
 GROUP BY status
 ORDER BY status;

\echo ''
\echo '--- DB接続数（Pooler の枯渇はEdge Functionsの同時実行失敗として現れる）---'
SELECT COUNT(*) AS connections,
       (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
  FROM pg_stat_activity;

\echo ''
\echo 'health-check: OK'
