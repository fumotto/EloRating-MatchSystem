# Monitoring and Observability Guide

Version: 2.0
Status: Active
Last Updated: 2026-08-16

---

# 1. 目的

本書は、Staging / Production での継続的な監視手順をまとめる。

**本書は正本ではない。** 監視項目の定義は `docs/design/11_Deployment.md` 13章、リスクとその対策は
`docs/project/governance/RiskManagement.md` が正本である。本書はそれらを「実際に打つコマンド」へ
翻訳したものである。

## 1.1 掲載する SQL の条件

**本書の SQL は、実スキーマに対して実行できることを確認したものだけを載せる。**

動かないクエリを載せると、異常時に「クエリが通らない」ことの調査から始まり、
本来の障害対応が遅れる。列名やテーブル名を変更した場合は本書も併せて更新すること。

主要な識別子は次のとおりである。誤りやすいものを挙げる。

| 誤 | 正 | 備考 |
| --- | --- | --- |
| `matches.result_status` | `matches.status` | 値は `PLAYING` / `WINNER_REPORTED` / `COMPLETED` / `DRAWN`（ADR-008） |
| `matches.updated_at` | `matches.completed_at` ほか | `matches` に `updated_at` は無い |
| `matching_queue.status` | （列が無い） | 待機列に載っていること自体が待機状態である |
| `matching_queue.created_at` | `matching_queue.queued_at` | |
| `team_rating_history` | `rating_history` | |
| `auth_logs` / `rating_queue` | （存在しない） | 認証ログは Supabase Auth 側にある |
| `cron.job.last_successful_run` | （列が無い） | `cron.job_run_details` から引く |
| `cron.job_run_details.error_message` | `return_message` | |
| `cron.job_run_details.jobname` | （列が無い） | `cron.job` と `jobid` で結合する |

---

# 2. 最優先で見る指標

## 2.1 自動処理が実際に動いているか（R-004）

**本システムで最も重要な監視項目である。** 自動解決が止まると期限切れの試合が確定せず、
1チーム同時1試合の制約により、当事者は以後まったくマッチングできなくなる。

### ★`cron.job_run_details` の `succeeded` を信用してはならない

`status` が示すのは「SQL を実行できたこと」だけである。次のいずれでも `succeeded` になる。

* Vault 未登録で、Edge Function を一度も呼んでいない
* 鍵が誤っており、Function が 403 を返している

いずれも「Cron は正常」に見えたまま、業務は一切進まない。実際に本番で発生した
（Issue #3）。判定は次の2つで行う。

### 判定1：HTTP 応答を見る

```sql
SELECT status_code, left(content, 120) AS body, created
  FROM net._http_response
 ORDER BY created DESC
 LIMIT 10;
```

| status_code | 意味 |
| ----------- | ---------------------------------------- |
| `200`       | 正常 |
| `403`       | Vault の鍵が誤っている（`sb_secret_` 形式か確認する） |
| `401`       | Vault の値が空、または Bearer の形式不正 |
| 行が無い     | Vault 未登録。Cron が呼んでいない |

### 判定2：期限超過の滞留件数を見る

こちらが最終的な判定基準である（RiskManagement R-004）。

```sql
SELECT COUNT(*) FILTER (
         WHERE status = 'PLAYING' AND report_deadline_at < NOW() - INTERVAL '5 minutes'
       ) AS overdue_report,
       COUNT(*) FILTER (
         WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW() - INTERVAL '5 minutes'
       ) AS overdue_approve
  FROM matches;
```

**正常：どちらも 0 に近い。** 増え続けている場合、自動解決は動いていない。

`scripts/health-check.sql` が同じ内容を含む。デプロイ時は `deploy.yml` が自動実行する。
手動実行は次のとおり。

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/health-check.sql
```

## 2.2 Cron ジョブの登録状況

4本が登録されていること。`cron.job` に `last_successful_run` 列は無いため、
実行履歴は `cron.job_run_details` を `jobid` で結合して引く。

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

SELECT j.jobname,
       d.status,
       d.return_message,
       d.start_time
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 ORDER BY d.start_time DESC
 LIMIT 20;
```

`status` が `failed` の場合は `return_message` に理由が入る。
`succeeded` でも安心してはならない理由は 2.1 のとおりである。

---

# 3. マッチングと試合の状態

## 3.1 待機列

`matching_queue` に状態列は無い。**行が存在することが待機中である。**

```sql
SELECT COUNT(*) AS waiting_teams,
       MIN(queued_at) AS oldest_waiting
  FROM matching_queue;
```

**正常：** 相手が居れば数秒で解消する。1チームしか待機していない場合は
待ち続けるのが正常であり、異常ではない（`09_MatchmakingSpecification.md` 4章）。

**異常の兆候：** 2チーム以上が長時間待機したまま。レート差が
`system_settings.match_rating_range` を超えていないかを確認する。

```sql
SELECT t.name, t.rating, q.queued_at
  FROM matching_queue q
  JOIN teams t ON t.id = q.team_id
 ORDER BY q.queued_at;
```

## 3.2 進行中の試合

```sql
SELECT status, COUNT(*)
  FROM matches
 WHERE status IN ('PLAYING', 'WINNER_REPORTED')
 GROUP BY status;
```

期限を過ぎたまま残っているものは 2.1 の滞留件数で見る。

## 3.3 決着の内訳

`DRAWN` の急増は、申告期限・承認期限が短すぎる兆候である。

```sql
SELECT status, COUNT(*)
  FROM matches
 WHERE completed_at > NOW() - INTERVAL '24 hours'
 GROUP BY status;
```

`DRAWN` が `COMPLETED` を上回る状態が続く場合、`system_settings` の
`report_timeout_minutes` / `approve_timeout_minutes` の見直しを検討する。

## 3.4 レート更新の追跡

レート履歴は `rating_history` である（`team_rating_history` ではない）。

```sql
SELECT COUNT(*) AS rating_updates
  FROM rating_history
 WHERE created_at > NOW() - INTERVAL '24 hours';
```

**確定した試合1件につき2行**が入る（勝者と敗者）。`COMPLETED` の件数の2倍に
なっていなければ、レート更新のどこかで失敗している。

引き分け（`DRAWN`）ではレートを更新しないため、`rating_history` へ行は入らない
（`08_RatingSpecification.md` 4章）。

---

# 4. データベース

## 4.1 接続数

Edge Functions は Function ごとに別プロセスで動くため、接続が積み上がりやすい。
上限に達すると Auth（GoTrue）まで巻き添えで落ちる。

```sql
SELECT COUNT(*) AS connections,
       (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
  FROM pg_stat_activity;
```

**正常：** 上限の 80% 未満。

**超過時：** Edge Functions が Connection Pooler を経由しているかを確認する
（`APP_DB_POOL_URL` / `11_Deployment.md` 5.1）。直接接続では上限に張り付く。

## 4.2 遅いクエリ

```sql
SELECT calls, round(mean_exec_time::numeric, 1) AS mean_ms, left(query, 80) AS query
  FROM pg_stat_statements
 ORDER BY mean_exec_time DESC
 LIMIT 10;
```

平均実行時間が 1 秒を超えるものはインデックスの追加を検討する。

## 4.3 テーブルサイズ

```sql
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_stat_user_tables
 ORDER BY pg_total_relation_size(relid) DESC
 LIMIT 10;
```

`audit_logs` と `rating_history` は追記のみで増え続ける。
無料枠の上限に近づいた場合、まずこの2つを確認する。

---

# 5. Edge Functions のログ

## 5.1 出力方法

`console.log` / `console.error` で出力する。Supabase ダッシュボードの
**Edge Functions → 関数名 → Logs** で確認できる。ローカルでは
`supabase functions serve` のターミナルへ直接出る。

## 5.2 ★個人情報を出力してはならない

メールアドレス、Discord のユーザーID、表示名をログへ出さない。

```typescript
// 良い例：業務上の区切りが分かる
console.log(`[queue-match] queued team=${teamId}`);

// 悪い例：個人が特定できる
console.log(`[login] ${email} logged in`);
```

利用者IDを出す必要がある場合は `profiles.id`（UUID）に留める。
これは Discord 側の識別子ではないため、外部と突き合わせられない。

## 5.3 保持期間

**ログの保持期間は Supabase のプラン依存であり、本プロジェクトで制御していない。**
無料プランでは概ね1日である。長期保存が必要になった時点でプランの変更を検討する。

外部ストレージへのアーカイブは**行っていない**。Storage は MVP では使用しない
（`11_Deployment.md` 2章）。

---

# 6. 監視していないもの

**実装していない機能を監視項目に挙げない。** 存在しない仕組みを確認しようとして
時間を失うためである。

| 項目 | 状況 |
| --- | --- |
| Database Webhooks | **使用しない。** Realtime は Broadcast 方式であり、Edge Function がコミット後に明示送信する（`0016_realtime.sql`） |
| Storage / S3 | **使用しない**（`11_Deployment.md` 2章） |
| 認証ログのテーブル | アプリ側に持たない。Supabase ダッシュボードの Authentication → Logs で見る |
| APM（Datadog / New Relic 等） | 未導入 |
| p95 レスポンスタイム | 測定基盤が無い。導入する場合は外部監視から測る |

---

# 7. アラート

`.github/workflows/monitor.yml` が自動実行する（ADR-029）。

## 7.1 仕組み

| 項目 | 内容 |
| --- | --- |
| 実行場所 | GitHub Actions |
| 間隔 | 30分 |
| 取得 | `scripts/monitor-metrics.sql`（`key=value` 形式で出力する） |
| 通知先 | Discord Webhook（Secret `DISCORD_WEBHOOK_URL`） |
| 予備の通知 | 異常時はワークフローも失敗させ、GitHub の失敗通知メールを別経路とする |

### ★DB内（pg_cron）へ置かない

アラート機構を pg_cron / pg_net / Vault の上に載せると、**監視対象が壊れる原因で
アラートも同時に黙る。** Issue #3 で実際に起きた形がこれである。監視は対象から
独立させる。

## 7.2 判定条件

| 条件 | 意味 |
| --- | --- |
| `overdue_report + overdue_approve > 0` | 自動解決が止まっている（R-004） |
| `vault_configured = no` | Cron が何も呼んでいない |
| `cron_http_total = 0`（直近1時間） | 毎分実行が2本あるため、0件は異常 |
| `cron_http_error / cron_http_total >= 20%` | 鍵の誤りなどで呼び出しが失敗している |
| `connections / max_connections >= 80%` | Pooler の枯渇が近い |

**`cron.job_run_details.status` は判定に使わない。** 「処理が行われなかったこと」を
区別できないためである（RiskManagement 6.1.1）。

### ★呼び出しの失敗は「率」で見る

件数が1件でも警報にすると、一過性の通信失敗で鳴り続ける。導入直後に
`1/127`（0.8%）で誤検知した。

**鳴り続ける警報は無視されるようになり、本当の異常を見落とす。** 通知設計としては
これが最も避けたい結果である。

閾値 20% は次の観測から決めている。

| 状況 | 失敗率 | 判定 |
| --- | --- | --- |
| 一過性の通信失敗 | 1% 前後 | 鳴らさない |
| 1本のジョブが恒常的に失敗 | 47%（60/127） | 鳴らす |
| 鍵の誤りで全滅 | 100% | 鳴らす |

なお**本命の検知経路は滞留件数**である。ここを取りこぼしても、自動解決が止まれば
滞留が増えて必ず捕捉できる。失敗率は早期の兆候にすぎない。

## 7.3 週次ハートビート

毎週月曜 09:00（JST）に、異常が無くても Discord へ投稿する。

```text
✅ EloRating: 今週も正常です（週次のお知らせ）

・期限切れの試合：なし
・チーム数：9
・待機中：0 チーム
・直近7日の試合：確定 3 件 / 引き分け 1 件
・DB接続：18 / 60

★このお知らせが届かない週があれば、監視そのものが止まっています。
```

### ★なぜ正常時にも送るのか

**「異常時だけ通知する」設計は、通知機構自体が死ぬと無音になる。** 正常と区別が付かない。

GitHub は**60日間リポジトリに活動が無いと schedule を自動停止する。** 停止しても
誰にも通知されない。定期的な「正常」の便りを出しておけば、**沈黙そのものが異常の合図**
になる。

管理者は「毎週月曜に連絡が来る。来なかったらおかしい」とだけ覚えればよい。

## 7.4 通知経路の確認

Actions タブ → **Monitor** → **Run workflow** で手動実行できる。
`send_heartbeat` を有効にしたまま実行すると、正常でもハートビートが送られる。

**Webhook を登録し直したときは必ず実行する。** 通知が届かないことに障害時まで
気付けないためである。

---

# 8. 障害時の調べ方

## 8.1 「マッチングできない」

順に確認する。**上から順に、頻度の高い原因から並べてある。**

1. **自動処理が動いているか**（最も多い原因）

   2.1 の判定1・判定2を実行する。

2. **そのチームが待機列に入っているか**

   ```sql
   SELECT q.queued_at
     FROM matching_queue q
     JOIN teams t ON t.id = q.team_id
    WHERE t.name = '＜チーム名＞';
   ```

3. **進行中の試合を持っていないか**

   1チーム同時1試合である。進行中があれば待機に入れない。

   ```sql
   SELECT id, status, report_deadline_at
     FROM matches
    WHERE (team_a_id = (SELECT id FROM teams WHERE name = '＜チーム名＞')
        OR team_b_id = (SELECT id FROM teams WHERE name = '＜チーム名＞'))
      AND status NOT IN ('COMPLETED', 'DRAWN');
   ```

4. **人数が必須人数に達しているか**

   必須人数は `system_settings.team_max_members` と等しい（`09` 4.1）。

   ```sql
   SELECT s.team_max_members,
          (SELECT COUNT(*) FROM team_members m
            JOIN teams t ON t.id = m.team_id WHERE t.name = '＜チーム名＞') AS members
     FROM system_settings s;
   ```

5. **BAN されていないか**

   ```sql
   SELECT name, is_banned FROM teams WHERE name = '＜チーム名＞';
   ```

## 8.2 「レートが更新されない」

1. **試合の状態を見る**

   ```sql
   SELECT id, status, winner_team_id, reported_at, approved_at, completed_at
     FROM matches
    WHERE id = '＜match id＞';
   ```

   `WINNER_REPORTED` のままであれば、相手が承認していない。正常な待ち状態である。

2. **確定しているのに履歴が無い場合**

   ```sql
   SELECT * FROM rating_history WHERE match_id = '＜match id＞';
   ```

   `COMPLETED` なのに0行であれば、確定処理の途中で失敗している。
   Edge Functions のログ（`approve-match` / `auto-resolve-matches`）を確認する。

3. **引き分けの場合**

   `DRAWN` ではレートを更新しない。履歴が無いのが正しい。

## 8.3 監査ログから追う

誰が何をしたかは `audit_logs` に残る。`actor_profile_id` が NULL のものは
システム（定期処理）による操作である。

```sql
SELECT action, target_type, target_id,
       COALESCE(actor_profile_id::text, 'システム') AS actor,
       created_at
  FROM audit_logs
 ORDER BY created_at DESC
 LIMIT 30;
```

---

# 9. 日次で見る項目

本書のうち、毎日確認するのは次の3つで足りる。

| 項目 | 節 | 異常の判定 |
| --- | --- | --- |
| 期限超過の滞留件数 | 2.1 | 0 より大きい状態が続く |
| DB 接続数 | 4.1 | 上限の 80% を超える |
| 直近24時間の決着内訳 | 3.3 | `DRAWN` が `COMPLETED` を上回る |

`scripts/health-check.sql` はこの3つを含む。1本実行すれば足りる。

---

# 10. 参考

* `docs/design/11_Deployment.md` 13章 — 監視項目の正本
* `docs/project/governance/RiskManagement.md` — R-004 とその判定基準
* `docs/project/SetupRunbook.md` 8.1 — Vault 登録手順
* `scripts/health-check.sql` — 本書の主要クエリをまとめたもの
