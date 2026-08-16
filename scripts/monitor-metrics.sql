-- 監視用のメトリクス出力（11_Deployment.md 13章 / R-004 / Issue #3）。
--
-- `.github/workflows/monitor.yml` から定期実行し、出力を判定へ使う。
--
--   psql "$SUPABASE_DB_URL" -qtAX -f scripts/monitor-metrics.sql
--
-- ★health-check.sql とは目的が異なる。あちらは人が読む前提で、異常があれば
--   RAISE EXCEPTION で落とす。こちらは落とさず、値を `key=value` の1行1組で出す。
--   ワークフロー側が値を読んで閾値判定するためである。落としてしまうと
--   「どの指標がいくつだったか」を通知本文へ載せられない。
--
-- ★psql のオプションは -qtAX を前提とする（見出し・整形・改行を出さない）。

-- 期限を過ぎたまま残る試合。R-004 の判定基準である。
-- 自動解決は1分間隔のため、正常なら5分以内に解消する。
SELECT 'overdue_report=' || COUNT(*) FILTER (
         WHERE status = 'PLAYING' AND report_deadline_at < NOW() - INTERVAL '5 minutes'
       )
  FROM matches;

SELECT 'overdue_approve=' || COUNT(*) FILTER (
         WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW() - INTERVAL '5 minutes'
       )
  FROM matches;

-- Cron が Edge Function を実際に呼べているか。
--
-- ★cron.job_run_details の succeeded は判定に使えない。Vault 未登録でも、
--   鍵が誤って 403 が返っていても succeeded になる（Issue #3）。
--   直近1時間の HTTP 応答で 200 以外の件数を数える。
SELECT 'cron_http_error=' || COALESCE((
         SELECT COUNT(*)
           FROM net._http_response
          WHERE created > NOW() - INTERVAL '1 hour'
            AND (status_code IS NULL OR status_code <> 200)
       ), 0);

-- 直近1時間に呼び出しが1件も無ければ、Cron が動いていないか Vault 未登録である。
-- matchmaker と auto-resolve-matches は毎分実行のため、正常なら数十件ある。
SELECT 'cron_http_total=' || COALESCE((
         SELECT COUNT(*)
           FROM net._http_response
          WHERE created > NOW() - INTERVAL '1 hour'
       ), 0);

-- Vault の登録状況。未登録なら Cron は何も呼ばない。
SELECT 'vault_configured=' || CASE
         WHEN get_vault_secret('edge_function_base_url') IS NULL
           OR get_vault_secret('service_role_key') IS NULL THEN 'no'
         ELSE 'yes'
       END;

-- DB接続数。Pooler の枯渇は Edge Functions の同時実行失敗として現れる。
SELECT 'connections=' || COUNT(*) FROM pg_stat_activity;
SELECT 'max_connections=' || setting FROM pg_settings WHERE name = 'max_connections';

-- 待機列。相手が居ないだけの待機は異常ではないため、閾値判定には使わない。
-- 週次のハートビートで状況を伝えるために出す。
SELECT 'waiting_teams=' || COUNT(*) FROM matching_queue;

-- 直近7日の決着内訳。ハートビート本文に載せる。
SELECT 'completed_7d=' || COUNT(*) FILTER (WHERE status = 'COMPLETED')
  FROM matches WHERE completed_at > NOW() - INTERVAL '7 days';

SELECT 'drawn_7d=' || COUNT(*) FILTER (WHERE status = 'DRAWN')
  FROM matches WHERE completed_at > NOW() - INTERVAL '7 days';

SELECT 'teams=' || COUNT(*) FROM teams;
