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
  - 別の Discord アカウントでログイン
  - チーム招待を送信
  - 期待: 招待が届き、受諾できる

- [ ] **マッチング・レート更新**
  - 2チームでマッチングキューに参加
  - マッチ成立 → 承認 → スコア入力 → 試合確定
  - 期待: 両チームのレート・成績が更新される

- [ ] **ランキング反映確認**
  - `/ranking` ページを再読み込み
  - 期待: 新しいレート順で表示

### フェーズ 6: 監視・ログ確認

- [ ] **Edge Functions が正常に動作**
  - Supabase ダッシュボード → Edge Functions → 各 Function のログ
  - エラーが無いこと

- [ ] **Cron ジョブが実行されている**
  - SQL Editor で実行（Staging Supabase ダッシュボード）：
    ```sql
    SELECT jobname, schedule, last_run_success FROM cron.job;
    SELECT jobname, start_time, status 
      FROM cron.job_run_details 
      ORDER BY start_time DESC LIMIT 10;
    ```
  - 期待: 4 ジョブが登録済み、直近の実行がすべて成功

- [ ] **マッチングキューが正常**
  ```sql
  SELECT COUNT(*) FROM matching_queue WHERE status = 'waiting';
  SELECT COUNT(*) FROM matches WHERE result_status = 'pending';
  ```
  - 期待: 異常な積み上がりがない

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
| `Post-migration health check` が失敗 | Cron が起動していない、または Vault の登録漏れ | SetupRunbook 8.1、10.4 を確認 |
| ログイン後に 403 エラー | Edge Function に Service Role Key が無い | Supabase secrets が登録済みか確認 |
| マッチングが止まる | Cron が止まっている | `cron.job_run_details` を確認、Vault 登録確認 |

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
