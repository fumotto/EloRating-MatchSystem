-- ===== 0022_season_cron.sql =====
-- シーズン確定の自動実行（Issue #9）。
--
-- ★猶予の経過を待つ役割である。Edge Function は数分待てないため、
--   定期的に呼び出して「猶予が切れていれば確定する」を繰り返す。
--   猶予中は finalize-season が何もせず戻る。
--
-- ★1分間隔とする。猶予の粒度が分であり、これより粗いと
--   管理者が待たされる時間が読めなくなる。

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'finalize-season';

SELECT cron.schedule(
    'finalize-season',
    '* * * * *',
    $$SELECT invoke_edge_function('finalize-season')$$
);
