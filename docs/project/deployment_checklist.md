# Deployment Checklist for Staging

Version: 1.0
Status: Active
Last Updated: 2026-08-16

---

## 概要

本書は、Staging 環境へのデプロイ前に実施すべき検証項目をまとめる。MVP 完成後の S4 / M5 では、このチェックリストを熟読し、すべての項目を確認してからリリースを実施する。

## チェックリスト

### フェーズ 1: 環境準備（デプロイ前）

- [ ] **Git リポジトリが最新**
  ```bash
  git status  # 作業ディレクトリが clean であること
  git pull origin main
  ```

- [ ] **Pre-commit フックがインストール済み**（ローカル開発者）
  ```bash
  pre-commit install
  pre-commit run --all-files  # 全ファイルが合格すること
  ```

- [ ] **環境変数が正しく設定済み**
  - Staging 用 `.env` ファイルが存在し、`git status` に表示されていないこと
  - Discord 認証が有効か確認（ローカルでログインテスト）

- [ ] **GitHub Secrets が登録済み**（Actions 用）
  ```text
  - SUPABASE_ACCESS_TOKEN
  - SUPABASE_PROJECT_REF (Staging)
  - SUPABASE_DB_PASSWORD
  - SUPABASE_DB_URL (Session mode / 5432)
  ```
  確認: Settings → Secrets and variables → Actions

- [ ] **GitHub Variables が登録済み**（フロントエンド用）
  ```text
  - VITE_SUPABASE_URL (Staging)
  - VITE_SUPABASE_ANON_KEY (Staging)
  - VITE_BASE_PATH (Staging)
  ```
  確認: Settings → Secrets and variables → Actions

### フェーズ 2: ローカル検証（デプロイ前）

- [ ] **ローカルビルドが成功**
  ```bash
  bun install --frozen-lockfile
  bun run lint
  bun run format:check
  bun run typecheck
  bun run build
  ```

- [ ] **ローカル縦貫通が完了**（SetupRunbook 5.4 に従う）
  ```bash
  supabase stop
  supabase start
  supabase functions serve --env-file .env
  bun run dev
  ```
  期待: `/ranking` ログイン前表示 → Discord ログイン → チーム作成 → ランキング更新

- [ ] **ローカルテストが全て成功**
  ```bash
  bun run test:unit          # Vitest
  bun run test:integration   # Deno Test
  bun run test:db            # pgTAP
  ```
  期待: `✓ all tests passed`

### フェーズ 3: CI/CD ワークフロー検証（デプロイ前）

- [ ] **最新の PR / commit が CI で全テスト合格**
  確認: GitHub Actions → 最新の run が全ジョブ緑

  必須ジョブ:
  - [ ] secrets-guard
  - [ ] verify（lint, format, typecheck, unit, integration, db, e2e）

- [ ] **E2E テストが成功している**
  ```bash
  bun x playwright install --with-deps chromium
  bun run test:e2e  # ローカルで実行
  ```
  期待: Playwright レポートに全テスト緑

### フェーズ 4: Deploy ワークフロー実行

**⚠️ 以下は GitHub Actions 上での操作であり、一度実行したら戻せない。必ず上のフェーズをすべて完了してから進める。**

- [ ] **バックアップが取得できることを確認**（初回のみ）
  - Supabase ダッシュボード → Database → Backups で自動バックアップが有効になっている
  - PITR (Point in Time Recovery) が利用可能であることを確認

- [ ] **Deploy ワークフロー実行**
  1. GitHub Actions タブを開く
  2. **Deploy** ワークフローを選択
  3. **Run workflow** を押す
  4. `skip_backend` は **チェックしない**（バックエンドも適用）
  5. **Run workflow** 実行

- [ ] **Deploy ログを監視**
  ```text
  verify → backend → health-check → frontend
  ```
  各ステップが緑になるまで待つ。**赤くなったら即座に停止する**

  特に以下に注意:
  - [ ] `Capture pre-migration schema`: migration 前のスキーマ保存
  - [ ] `Apply migrations`: DB 更新が成功
  - [ ] `Deploy Edge Functions`: 全 Function がビルド・デプロイされた
  - [ ] `Post-migration health check`: `scripts/health-check.sql` が成功
  - [ ] フロントエンド成果物がアップロード

### フェーズ 5: Staging での事前検証

**⚠️ ユーザーが利用する前の、最後の実地テストである。実装が仕様通りに動くことを確認する。**

- [ ] **ランキング画面の表示（ログインなし）**
  - URL: `https://<staging-url>/ranking`
  - 期待: チーム一覧が表示される

- [ ] **ログイン・プロフィール生成**
  - Discord でログイン
  - 期待: `/dashboard` へ遷移、プロフィールが自動生成される

- [ ] **チーム作成**
  - ダッシュボードからチーム作成
  - 期待: チーム名・初期レート表示

- [ ] **チーム招待**
  - リーダーが「招待コードを発行」を押し、表示された26文字を控える
  - **コードは発行時にしか表示されない。**再表示はできない（04 9.3）
  - 別の Discord アカウントでログインし、「招待コード」欄へ貼って「チームに参加」
  - 期待: 参加でき、役割が MEMBER になる

- [ ] **マッチング・レート更新**

  **⚠️ 各チームが必須人数を満たしている必要がある。** 必須人数は
  `system_settings.team_max_members`（初期値3）と等しい（09 4.1）。
  満たないチームは開始ボタンが非活性になり、待機に入れない。
  **検証には最低6アカウント（3人×2チーム）が要る。**
  人数を用意できない場合は、管理画面で上限を一時的に下げる。

  - 2チームのリーダーがそれぞれ「マッチングを開始」
  - 勝者チームの誰かが「自チームの勝利を申告」
  - 敗者チームの誰かが「承認する」
  - 期待: 試合が「確定」になり、両チームのレートが更新される

  **スコアの入力は無い。** 勝敗のみを記録する仕組みである。

- [ ] **ランキング反映確認**
  - `/ranking` ページを再読み込み
  - 期待: 新しいレート順で表示

### フェーズ 6: 監視・ログ確認

- [ ] **Edge Functions が正常に動作**
  - Supabase ダッシュボード → Edge Functions → 各 Function のログ
  - エラーが無いこと

- [ ] **Cron が Edge Function を実際に呼んでいる**

  **⚠️ `cron.job_run_details` の `succeeded` を判定に使ってはならない。** Vault 未登録でも、
  鍵が誤って 403 が返っていても `succeeded` になる（Issue #3）。HTTP 応答で判定する。

  ```sql
  SELECT status_code, left(content, 120) AS body, created
    FROM net._http_response ORDER BY created DESC LIMIT 10;
  ```
  - 期待: `200`。`403` なら Vault の鍵が誤り、行が無ければ Vault 未登録（SetupRunbook 8.1）

- [ ] **Cron ジョブが4本登録されている**
  ```sql
  SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
  ```
  - 期待: `matchmaker` / `auto-resolve-matches` / `cleanup-matching-queue` / `cleanup-expired-invites`

- [ ] **待機列と滞留が正常**
  ```sql
  SELECT COUNT(*) AS waiting_teams, MIN(queued_at) AS oldest FROM matching_queue;

  SELECT COUNT(*) FILTER (
           WHERE status = 'PLAYING' AND report_deadline_at < NOW() - INTERVAL '5 minutes'
         ) AS overdue_report,
         COUNT(*) FILTER (
           WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < NOW() - INTERVAL '5 minutes'
         ) AS overdue_approve
    FROM matches;
  ```
  - 期待: 滞留は 0 に近い。増え続ける場合は自動解決が動いていない（R-004）

- [ ] **DB 接続が正常**
  - Connection Pool の接続数が上限の 80% を超えていない
  - Staging ダッシュボード → Settings → Database → Connections を確認

### フェーズ 7: 本番移行の準備

**Staging での検証が完全に完了してから、以下に進む。**

- [ ] **本番用 GitHub Secrets を確認**
  - `SUPABASE_PROJECT_REF` が本番プロジェクトの値であることを再確認
  - 本番環境へのリリース日時をスケジュール

- [ ] **本番 Supabase プロジェクトで Backups が有効**
  - Supabase ダッシュボード（本番）→ Database → Backups
  - PITR が有効であることを確認

- [ ] **本番デプロイのリハーサル手順を確認**
  - SetupRunbook 14 章を再読
  - 実行手順とロールバック手順を理解

---

## トラブルシューティング

| 症状 | 原因 | 対応 |
| --- | --- | --- |
| `secrets-guard` ジョブが失敗 | `.env` が誤ってコミットされている | `.env` を `.gitignore` に追加し、`git rm --cached .env` |
| `verify` ジョブが失敗（typecheck） | TypeScript/Deno の型エラー | ログを確認し、型エラーを修正 |
| `Apply migrations` が失敗 | Migration 構文エラーまたは既存スキーマとの衝突 | `pre-migration-schema-<run_id>` を確認、forward fix を検討 |
| `Deploy Edge Functions` が失敗 | ビルドエラーまたは鍵の欠落 | ビルドログを確認、secrets を再登録 |
| `Post-migration health check` が失敗 | `SUPABASE_DB_URL` が Pooler の文字列でない | ホスト名が `.pooler.supabase.com` か確認（直接接続は IPv6 のみでランナーから到達不可） |
| health check に `Vault が未登録` の警告 | Cron 用 Vault の登録漏れ | SetupRunbook 8.1 |
| Cron から 403 が返る | Vault の鍵が Legacy の `service_role` になっている | `sb_secret_` 形式へ差し替える（SetupRunbook 8.1） |
| 更新操作が CORS エラー | `verify_jwt` が有効なまま、または CORS 未対応 | `supabase/config.toml` と `_shared/cors.ts`（11_Deployment.md 6章） |
| 更新操作が `内部エラー`（SYSTEM-001） | Edge Function が DB へ接続できない | `APP_DB_POOL_URL` を確認（Transaction mode / 6543） |
| マッチングが止まる | Cron が実際には呼ばれていない | **`succeeded` ではなく `net._http_response` を見る**（フェーズ6） |

---

## 完了の判定

以下のすべてが満たされていること：

1. ✅ ローカルテスト（Unit / Integration / E2E）が全成功
2. ✅ CI ワークフローが全テスト合格
3. ✅ Deploy ワークフローが全ステップ成功
4. ✅ Staging での E2E 検証（7項目）が全成功
5. ✅ 監視・ログ確認が問題なし
6. ✅ ロールバック手順が文書化済み

本チェックリストのすべてが完了した段階で、本番へのリリースが実施可能である。

---

## デプロイ後の対応

### リリース直後（1 時間）

- [ ] ダッシュボードでメトリクスを監視
  - API エラーレート
  - DB 接続数
  - Cron 実行状況
  - ユーザー数

### リリース後（1 日）

- [ ] ユーザーからのレポートを収集
- [ ] エラーログを確認
- [ ] パフォーマンスメトリクスを分析

### ロールバックが必要な場合

- [ ] SetupRunbook 10.2（復元手順）に従い、バックアップから復元
- [ ] 復旧確認後、ユーザーへ通知
- [ ] 原因分析と修正を実施

---

## 参考資料

- `docs/design/11_Deployment.md` — デプロイ仕様の正本
- `docs/project/SetupRunbook.md` — 外部サービス設定と復旧手順
- `docs/design/10_TestSpecification.md` — テスト方針
- `.github/workflows/ci.yml` — CI/CD の自動化定義
