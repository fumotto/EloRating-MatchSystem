# Monitoring and Observability Guide

Version: 1.0
Status: Active
Last Updated: 2026-08-16

---

## 概要

本書は、Staging / Production での継続的な監視とロギングの設定方針をまとめる。正常系のメトリクスを把握して異常を早期に検出し、デバッグ時に過去のログから原因を追跡できるように設計する。

## 原則

1. **ログレベルの分け方**
   - `ERROR` / `FATAL`: ユーザーへの影響がある、または対応が必要な状況
   - `WARN`: 推奨されない使い方やリソース枯渇の兆候
   - `INFO`: 業務進行の重要なチェックポイント（ユーザー認証・試合確定など）
   - `DEBUG`: 開発中のデバッグのみ（本番では出力しない）

2. **個人情報の保護**
   - ユーザーID は匿名化またはハッシュ化して記録
   - メール・Discord ID・プロフィール名は出力しない
   - エラーメッセージもユーザーへ露出する内容は避ける

3. **ログの保持と検索**
   - 最低 7 日間のログは検索可能にする
   - 運用中に異常が起きたときは「いつ頃から」を特定するため
   - 法的要件がある場合は 90 日を目安にする

---

## 1. Edge Functions のログ

### 1.1 ロギング方法

Edge Functions（`supabase/functions/`）は `console.log` で出力する。

```typescript
// Good: 業務的に意味のあるチェックポイント
console.log(`[accept-team-invite] User ${hashedUserId} accepted invite from team ${teamId}`);

// Good: エラーとその原因
console.error(`[queue-match] DB error: ${error.message}`);

// Bad: 個人情報をそのまま出力
console.log(`[login] User ${userId} (${email}) logged in`);  // ❌ Email を出力
```

### 1.2 確認方法

**Staging / Production:**

Supabase ダッシュボード → Edge Functions → 函数名 → **Logs** タブ

実時間で関数の呼び出しとエラーが表示される。

**ローカル開発:**

```bash
supabase functions serve --env-file .env
```

ターミナルに `console.log` の出力が直接表示される。

### 1.3 監視対象メトリクス

Supabase の `pg_stat_statements` や外部監視ツールから確認:

| メトリクス | 測定方法 | 正常範囲 | アラート閾値 |
| ------ | ----- | ------ | -------- |
| 関数の呼び出し数 | ログ行数（時間単位） | 用途に応じて | 異常な急増・急減 |
| エラーレート | ERROR 行数 / 総行数 | < 1% | > 5% |
| レスポンスタイム | ログのタイムスタンプから計算 | < 2 sec | > 5 sec |
| 実行時パニック | `panicked`, `panic` を含むログ | 0 | > 0 |

### 1.4 ログ検索クエリ例

Supabase の Logs から検索:

```
# 過去1時間のエラーをすべて表示
function_name: 'queue-match' AND level: 'error' AND timestamp >= 1h ago

# 特定チームのマッチング動作を追跡
function_name: 'queue-match' AND 'team_id_xyz'

# Database errors only
level: 'error' AND 'DB error'
```

---

## 2. Database の監視

### 2.1 接続数

**目的:** Connection Pool が枯渇して新しい接続要求が失敗する状況を検出

```sql
-- Staging / Production の SQL Editor で実行
SELECT 
  sum(numbackends) as total_connections,
  max(numbackends) as max_connections_on_db
FROM pg_stat_database
WHERE datname = current_database();

-- 詳細: 接続ユーザーごと
SELECT usename, count(*) FROM pg_stat_activity GROUP BY usename;
```

**正常範囲:** < 10（ローカル）/ < 上限の 80%（Staging/Prod）

**超過時:** Connection Pool サイズを増加、または接続を長時間保つ処理を検査

### 2.2 クエリパフォーマンス

**目的:** 遅いクエリを検出して最適化の対象にする

```sql
-- 実行時間が長いクエリ TOP 10
SELECT 
  query,
  mean_exec_time,
  calls,
  total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**目安:** 平均実行時間が 1 sec を超えるクエリはログと共にレビュー対象

### 2.3 Cron ジョブの実行状況

**最も重要:** Cron が止まるとマッチが確定せず、ユーザーが動けなくなる

```sql
-- Cron ジョブ一覧（4 ジョブが登録されているはず）
SELECT jobname, schedule, last_successful_run FROM cron.job;

-- 直近の実行履歴（最後の 20 行）
SELECT 
  jobname, 
  start_time, 
  status, 
  CASE WHEN status = 'failed' THEN error_message ELSE '' END as error
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

**正常:** すべてのジョブが 成功 status、最後の実行が 3 分以内

**異常:** status が failed、または直近 1 時間に実行記録がない → SetupRunbook 10.4 の Vault 登録を確認

### 2.4 インデックスの監視

**目的:** インデックスが効いていないまたは不足しているクエリを検出

```sql
-- 未使用のインデックスを表示
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY tablename;

-- インデックス効率（テーブルスキャンが多いか）
SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables
ORDER BY n_tup_upd DESC;
```

異常が見つかったら、Design ドキュメントと照らし合わせて インデックス追加を検討

### 2.5 ディスク使用量

**目的:** ディスク枯渇を事前に検出

```sql
-- テーブル size 一覧（大きい順）
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**目安:** 合計が割り当てストレージの 75% を超えたらバックアップと履歴削除を検討

### 2.6 スロー クエリログ

**Staging / Production setup:**

```sql
-- ログを有効化（1 sec 以上のクエリを記録）
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- ログを確認（pg_dump から）
```

---

## 3. マッチングシステムの監視

### 3.1 キュー状態

マッチングの最初のステップ。キューに積まれたまま確定しない試合がないか監視

```sql
-- 待機中のキュー
SELECT 
  COUNT(*) as waiting_teams,
  MIN(created_at) as oldest_waiting
FROM matching_queue
WHERE status = 'waiting';

-- 異常: 30 分以上待機しているキューがあれば、マッチメイカー Cron を確認
```

**正常:** 待機時間 < 2 分

### 3.2 未確定マッチ

```sql
-- 確定待ちの試合
SELECT COUNT(*) FROM matches WHERE result_status = 'pending';

-- 期限を超過しているマッチ（1 時間以上確定していない）
SELECT id, created_at, updated_at
FROM matches
WHERE result_status = 'pending' 
  AND updated_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at ASC;
```

**正常:** pending が 0、または最大でも < 10

**異常:** pending が増え続ける → Cron が止まっている可能性が高い

### 3.3 レート更新の遅延

```sql
-- 直近1時間のマッチ成立数
SELECT COUNT(*) FROM matches WHERE created_at > NOW() - INTERVAL '1 hour';

-- 直近1時間のレート更新（ランキング更新）
SELECT COUNT(*) FROM team_rating_history 
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**期待:** 試合成立数 > レート更新数（同期はありえても追い抜くことはないはず）

---

## 4. API レスポンスタイムと エラーレート

### 4.1 レスポンスタイムの測定

ローカルまたは Staging で Playwright テストの実行時間を記録:

```typescript
// Playwright: レスポンスタイムをログに出す
test('match flow timing', async ({ page }) => {
  const startTime = Date.now();
  await page.goto('http://localhost:5173/dashboard');
  const navigationTime = Date.now() - startTime;
  
  console.log(`Dashboard load: ${navigationTime}ms`);
  expect(navigationTime).toBeLessThan(3000);  // 3 sec 以下
});
```

### 4.2 エラー率

GitHub Actions CI でテスト実行時に E2E エラー数を追跡:

```bash
# Playwright レポートのサマリー
bun run test:e2e 2>&1 | grep -E "passed|failed|skipped"
```

期待値: `failed: 0`

---

## 5. 外部サービスの監視

### 5.1 Discord 認証

エラー率:
```sql
-- 過去1時間の Discord ログイン試行回数と失敗
SELECT 
  COUNT(*) as total_attempts,
  COUNT(CASE WHEN error IS NOT NULL THEN 1 END) as failures
FROM auth_logs
WHERE provider = 'discord' AND created_at > NOW() - INTERVAL '1 hour';
```

### 5.2 Webhook（マッチ確定通知）

Supabase ダッシュボード → Database → Webhooks

- [ ] Webhook の送信履歴を確認
- [ ] 失敗率が < 5% であること
- [ ] Retry が成功していること

---

## 6. アラート設定

### 6.1 推奨アラート（メール / Slack 通知）

| 項目 | 閾値 | 重大度 | 対応 |
| --- | --- | --- | --- |
| Edge Functions エラーレート | > 5% | **Critical** | 即座に対応 |
| DB 接続数 | > 上限の 90% | **Critical** | Connection Pool 拡張 |
| Cron 実行失敗 | > 0 | **Critical** | Vault / 接続文字列を確認 |
| マッチング待機時間 | > 5 min | **Warning** | マッチメイカーロジックを確認 |
| API レスポンスタイム (p95) | > 5 sec | **Warning** | クエリ最適化を検討 |
| ディスク使用量 | > 80% | **Warning** | バックアップと履歴削除 |

### 6.2 Datadog / Prometheus / Grafana の導入（中長期）

現在、Supabase ネイティブのメトリクスと PostgreSQL の view で監視している。

将来的には、以下の導入を検討:

- **Prometheus:** DB メトリクスと Edge Functions のカスタムメトリクスを集約
- **Grafana:** ダッシュボード可視化
- **Datadog / New Relic:** マネージドサービス（運用負荷を軽減）

---

## 7. ログの保持と分析

### 7.1 ログレベル別の保持期間

| レベル | 保持期間 | 検索対象 |
| --- | ------ | ------ |
| ERROR / FATAL | 90 日 | Supabase Logs + S3 アーカイブ |
| WARN | 30 日 | Supabase Logs |
| INFO | 7 日 | Supabase Logs |
| DEBUG | 1 日 | ローカルのみ |

### 7.2 ログ検索コマンド例

```bash
# grep 相当の検索（Supabase CLI）
supabase functions logs --follow [function-name]

# jq で JSON 解析（ログ JSON 形式の場合）
curl -s https://<project>.supabase.co/functions/v1/logs \
  -H "Authorization: Bearer $ANON_KEY" \
  | jq '.[] | select(.level == "error")'
```

---

## 8. インシデント対応時のログ活用

### 8.1 「ユーザーがマッチできない」場合

1. **ユーザーの操作ログを追跡**
   ```sql
   SELECT * FROM matching_queue WHERE user_id = <user> ORDER BY created_at DESC;
   SELECT * FROM matches WHERE team_a_id = <team> OR team_b_id = <team> ORDER BY created_at DESC;
   ```

2. **マッチメイカーの実行ログを確認**
   ```sql
   SELECT start_time, status, error_message 
   FROM cron.job_run_details 
   WHERE jobname LIKE '%matchmaker%' 
   ORDER BY start_time DESC LIMIT 10;
   ```

3. **Edge Function ログ**
   - Supabase Logs から過去 24 時間の `queue-match` と `matchmaker` エラーを検索

### 8.2 「レートが更新されない」場合

1. **試合の状態確認**
   ```sql
   SELECT id, result_status, updated_at FROM matches WHERE id = <match> LIMIT 1;
   ```

2. **Cron 実行確認**
   ```sql
   SELECT * FROM cron.job_run_details WHERE jobname = 'auto-resolve-matches' ORDER BY start_time DESC LIMIT 5;
   ```

3. **rating_queue の確認**（あれば）
   ```sql
   SELECT * FROM rating_queue WHERE match_id = <match>;
   ```

---

## 9. 本番運用チェックリスト

本番運用を開始したら、以下を毎日確認する:

- [ ] エラーレート ( Edge Functions )
- [ ] Cron 実行履歴（失敗がないか）
- [ ] マッチング待機時間
- [ ] DB 接続数
- [ ] ディスク使用量

メトリクスをダッシュボード化して実時間監視が理想的。

---

## 参考資料

- Supabase ドキュメント: https://supabase.com/docs/guides/database/log-in-logs
- PostgreSQL Performance Tips: https://www.postgresql.org/docs/current/runtime-config-logging.html
- `docs/design/11_Deployment.md` — 本番運用方針
- `docs/project/SetupRunbook.md` — インシデント対応手順
