# SetupRunbook.md

# Setup Runbook

Version: 1.2
Status: Active

Last Updated: 2026-08-08

---

# 1. 目的

本書は、**人手でしか実施できない作業**の手順をまとめる。

外部サービス（Discord Developer Portal、GitHub、Supabase クラウド）の設定はアカウント権限を必要とするため、AIが代行できない。それらを1箇所へ集約し、上から順に実施すれば環境が整うようにする。

本書の正本範囲は「**外部サービスにおける人手設定の手順**」に限定する。環境変数の定義・リリース順序・スライスの完了条件は他文書が正本であり、本書は参照するだけである。

| 知りたいこと         | 正本                            |
| -------------- | ----------------------------- |
| 環境変数の一覧と意味     | `docs/design/11_Deployment.md` 4章 |
| ビルド・リリース手順     | `docs/design/11_Deployment.md` 6〜9章 |
| スライスの完了条件      | `docs/project/planning/ImplementationRoadmap.md` |
| 現在の進捗          | `docs/project/status/ProjectStatus.md` |
| Git運用・PR       | `docs/project/governance/ProjectRules.md` 7〜8章 |

---

# 2. 作業一覧

| #  | 作業                            | 時期        | これが無いと何が止まるか                |
| -- | ----------------------------- | --------- | --------------------------- |
| 1  | Discord アプリ作成とクレデンシャル取得       | **今すぐ**   | S1〜S3 の完了確認                 |
| 2  | `.env` の Discord 項目を埋める       | **今すぐ**   | 同上                          |
| 3  | ローカルでの縦貫通確認                   | **今すぐ**   | S1・S2・S3 の完了                |
| 4  | GitHub へ push して CI を確認       | **今すぐ**   | M1 の「CIが正常に動作する」の実証         |
| 5  | Supabase クラウドプロジェクトの作成        | S4 / M5   | クラウド公開                      |
| 6  | `db push` / `secrets set` / `functions deploy` | S4 / M5 | 同上          |
| 7  | GitHub Pages 有効化と Actions 変数登録 | S4 / M5   | 同上                          |

作業1〜4を終えると M1 が実証され、S1〜S3 を完了にできる。作業5〜7は M5 に着手する時点で実施すればよい。

---

# 3. 作業1：Discord アプリ作成とクレデンシャル取得

MVPの認証プロバイダは Discord である（ADR-022）。

## 手順

1. <https://discord.com/developers/applications> を開く
2. 右上の **New Application** を押し、任意の名前（例：`EloRating MatchSystem Local`）で作成する
3. 左メニューの **OAuth2** を開く
4. **Redirects** に以下を追加し、**Save Changes** を押す

   ```text
   http://127.0.0.1:54321/auth/v1/callback
   ```

5. 同じ画面の **Client ID** を控える
6. **Reset Secret** を押して **Client Secret** を生成し、控える

## 注意

**Redirect URL は Vite の `5173` ではなく、Supabase Auth の `54321` である。** ブラウザで最後に戻ってくるのは `5173` だが、Discord が直接呼ぶのは Supabase Auth のコールバックであるため、ここを間違えると `redirect_uri mismatch` で失敗する。

Client Secret は一度しか表示されない。閉じてしまった場合は再度 Reset Secret を押す。

## 完了の判定

Client ID（数字列）と Client Secret（英数字列）が手元にあること。

---

# 4. 作業2：`.env` の Discord 項目を埋める

`.env` はローカル検証用に作成済みで、Discord の2項目のみ空になっている。他の値（Supabase Local の URL と Anon Key）は設定済みである。

## 手順

`.env` を開き、作業1で控えた値を入れる。

```bash
SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID=＜Client ID＞
SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET=＜Client Secret＞
```

`.env` が無い場合はテンプレートから作る。各変数の意味は `11_Deployment.md` 4章を参照する。

```bash
cp .env.example .env
```

`VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` は `supabase status` の出力の `API_URL` と `ANON_KEY` を使う。

## 注意

**`.env` を Git へコミットしてはならない**（`11_Deployment.md` 14章）。`.gitignore` に登録済みであるが、`git status` に `.env` が現れないことを一度確認しておくとよい。

`VITE_` 接頭辞の変数はビルド成果物に埋め込まれ公開される。ここに Service Role Key を入れてはならない。

## 完了の判定

```bash
git status --porcelain | grep '\.env$'
```

何も出力されないこと（＝追跡対象になっていない）。

---

# 5. 作業3：ローカルでの縦貫通確認

「ログイン → プロフィール生成 → チーム作成 → ランキング表示」が通ることを確認する。これが S1・S2・S3 の完了条件である（`ImplementationRoadmap.md` S3）。

## 5.1 Supabase Local を再起動する

```bash
supabase stop
supabase start
```

**再起動が必要である。** `config.toml` の `client_id = "env(...)"` は起動時にしか評価されないため、`.env` を書いただけでは Discord 設定が反映されない。

起動後、警告が消えていることを確認する。

```bash
supabase status
```

`environment variable is unset: SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` という警告が出なくなっていれば成功である。

## 5.2 Edge Functions を起動する

別のターミナルで実行する。

```bash
supabase functions serve --env-file .env
```

### ★よくある失敗：`SUPABASE_DB_URL is not set` / DBに接続できない

`_shared/db.ts` は `SUPABASE_DB_URL` を使って PostgreSQL へ直接接続する（ADR-016）。ここには**コンテナ名を使う**。

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@supabase_db_EloRating-MatchSystem:5432/postgres
```

`supabase status` が表示する `postgresql://postgres:postgres@127.0.0.1:54322/postgres` は **WSL のホストから見たアドレス**である。Edge Function はコンテナの中で動くため、`127.0.0.1` はコンテナ自身を指してしまい DB に届かない。

## 5.3 フロントエンドを起動する

さらに別のターミナルで実行する。

```bash
bun run dev
```

## 5.4 確認する

| # | 確認内容                                     | 期待                                |
| - | ---------------------------------------- | --------------------------------- |
| 1 | ブラウザで <http://localhost:5173/ranking> を開く | **ログインせずに**ランキング画面が表示される（ADR-018） |
| 2 | `/login` から Discord でログインする              | Discord の認可画面へ遷移し、戻ってくる           |
| 3 | ログイン後                                    | `/dashboard` へ遷移する                |
| 4 | ダッシュボードでチームを作成する                         | エラーにならず、チーム名とレートが表示される            |
| 5 | `/ranking` を開き直す                         | 作成したチームが一覧に現れる                    |

## 5.5 ★B-009 の実地確認（重要）

ログイン後、`profiles` に入った値を確認する。

```bash
docker exec supabase_db_EloRating-MatchSystem \
  psql -U postgres -d postgres \
  -c "SELECT id, auth_provider, provider_user_id, display_name FROM profiles;"
```

| 列                  | 期待                              |
| ------------------ | ------------------------------- |
| `auth_provider`    | `discord`（`steam` ではない）         |
| `provider_user_id` | **Discord のユーザーID**（`id` 列と異なる値） |

`provider_user_id` が `id` と同じ値になっていたら、B-009 の修正が実環境で効いていない。その場合は JWT の `user_metadata` に `provider_id` が入っていないことを意味するので、報告してほしい。

**現在のテストはすべてモックであり、実際の Discord JWT の中身は未検証である。** ここが唯一の実証点になる。

## 完了の判定

5.4 の5項目と 5.5 が期待どおりであること。確認できたら教えてほしい。`ProjectStatus.md` の S1〜S3 を ✅ に更新する。

---

# 6. 作業4：GitHub へ push して CI を確認

CI は `.github/workflows/ci.yml` に作成済みだが、**GitHub Actions 上での実行は未確認**である。M1 の完了条件「CIが正常に動作する」を実証するには実際に動かす必要がある。

## 手順

ブランチを切る（命名は `ProjectRules.md` 7章に従う）。

```bash
git switch -c feature/frontend-init
git add -A
git commit -m "feat: フロントエンド初期化とCI新設"
git push -u origin feature/frontend-init
```

GitHub で Pull Request を作成する。記載事項は `ProjectRules.md` 8章に従う（目的・変更内容・関連ADR・更新した設計書・テスト結果・残課題）。

## 確認する

リポジトリの **Actions** タブで、以下のステップがすべて緑になること。

```text
Install → Lint → Format Check → Type Check → Supabase Local 起動 → Migration 適用
  → Unit Test → Integration Test → Database Test（pgTAP）→ Build → Verify SPA fallback
  → Edge Functions 起動 → E2E Test（Playwright）
```

S5 / S6 で pgTAP と Playwright を追加したため、予約状態だったステップはすべて有効化してある（`11_Deployment.md` 11.3.2）。

## 完了の判定

Actions が緑になること。**この時点で M1 の完了条件4つがすべて実証される。**

---

# 7. 作業5：Supabase クラウドプロジェクトの作成

ここから先は S4 / M5 の作業である。M1 の完了には不要なので、後回しでよい。

## 手順

1. <https://supabase.com/dashboard> でプロジェクトを作成する
2. **Staging と Production で別プロジェクトを作る**（`11_Deployment.md` 3章）。同一プロジェクトを複数環境で共有してはならない
3. 各プロジェクトの以下を控える
   - Project URL
   - Anon Key
   - Service Role Key
   - Connection Pooler の接続文字列（**Transaction mode**）
4. Authentication → Providers → Discord を有効化し、作業1のクレデンシャルを設定する
   - 本番用に別の Discord アプリを作ることを推奨する
5. Discord Developer Portal に**本番のコールバック URL を追加登録**する

   ```text
   https://＜project-ref＞.supabase.co/auth/v1/callback
   ```

   ローカル用の `127.0.0.1:54321` とは別に必要である。

## 完了の判定

ダッシュボードでプロジェクトが2つ（Staging / Production）作成され、Discord プロバイダが有効になっていること。

---

# 8. 作業6：クラウドへの適用

**順序が重要である。** バックエンドを先に適用する（`11_Deployment.md` 9章）。フロントエンドを先に公開してはならない。

## 手順

```bash
supabase link --project-ref ＜project-ref＞
supabase db push
```

### ★この `db push` の意味

**この push をもって Migration `0001`〜`0014` が確定する。** 以後 ADR-024 が認めていた「未適用 Migration の直接修正」は禁止となり、追加方式（新しい Migration を足す）へ戻る（`11_Deployment.md` 10.1）。

push 前に Migration の内容を確定させておくこと。

続いて Secret を設定する。

```bash
supabase secrets set SUPABASE_DB_URL='＜Connection Pooler の接続文字列＞'
```

Connection Pooler は **Transaction mode** を使い、**prepared statement を無効化**する（`11_Deployment.md` 5.1）。Transaction mode では prepared statement がセッションをまたいで再利用できないためである。

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で注入するため、通常は設定不要である。

最後に Edge Functions をデプロイする。

```bash
supabase functions deploy
```

## 8.1 Cron 用の Vault シークレット登録

内部処理の Edge Function（`matchmaker` / `auto-resolve-matches` / `cleanup-*`）は pg_cron から
HTTP で呼ばれる（Migration `0015_cron.sql`）。呼び出しには**環境ごとに異なる2つの値**が要る。

**Migration には書けない。** URL は環境ごとに異なり、Service Role Key は秘匿情報だからである。
Supabase ダッシュボードの SQL Editor で以下を実行し、Vault へ登録する。

```sql
SELECT vault.create_secret(
  'https://＜project-ref＞.supabase.co/functions/v1',
  'edge_function_base_url'
);
SELECT vault.create_secret('＜Service Role Key＞', 'service_role_key');
```

**登録するまで Cron は何もしない。** 未登録を失敗にすると毎分エラーが積まれるため、
`invoke_edge_function` は値が無ければ黙って戻る設計にしてある。したがって
「登録し忘れても気付けない」点に注意する。登録後に下の確認を必ず行う。

```sql
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
SELECT jobname, status, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

ローカル開発では登録しなくてよい。Cron は登録されるが何も呼ばない。

**Cron が止まると試合が確定せず、両チームが以後マッチングできなくなる**（R-004）。
運用開始後は `cron.job_run_details` を監視対象に含めること。

## 完了の判定

ダッシュボードの Table Editor に9テーブル・4ビューが見えること。Edge Functions に仕様どおりの
Function が並ぶこと。`cron.job` に4件のジョブが登録され、`cron.job_run_details` が成功していること。

---

# 9. 作業7：GitHub Pages 有効化と Actions 変数登録

## 手順

1. リポジトリの **Settings → Pages** を開く
2. **Source** を **GitHub Actions** にする
3. **Settings → Secrets and variables → Actions** を開き、以下を登録する

| 名前                       | 種別        | 値                            |
| ------------------------ | --------- | ---------------------------- |
| `VITE_SUPABASE_URL`      | Variable  | 本番の Project URL              |
| `VITE_SUPABASE_ANON_KEY` | Variable  | 本番の Anon Key                 |
| `VITE_BASE_PATH`         | Variable  | `/EloRating-MatchSystem/`    |

いずれも Secret ではなく **Variable** でよい。`VITE_` 接頭辞の変数はビルド成果物に埋め込まれ公開されるため、そもそも秘密にできない（`11_Deployment.md` 4.1）。

### ★`VITE_BASE_PATH` に注意

GitHub Pages はサブパス（`https://＜user＞.github.io/EloRating-MatchSystem/`）で配信されるため、末尾のスラッシュを含めて `/EloRating-MatchSystem/` とする。

**設定を誤ると本番でのみアセットが404になる**（`11_Deployment.md` 6章）。ローカルでは `/` で動くため気付けない。

## 9.1 デプロイ用の Secrets

公開は `.github/workflows/deploy.yml` が行う。**Actions タブから手動で実行する**
（`workflow_dispatch`）。push では動かない。誤って公開しないためである。

バックエンドの適用に以下の Secret が要る。**Variable ではなく Secret とする。**

| 名前                      | 種別     | 値                              |
| ----------------------- | ------ | ------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | Secret | Supabase のアクセストークン（アカウント設定で発行） |
| `SUPABASE_PROJECT_REF`  | Secret | 本番プロジェクトの project-ref          |
| `SUPABASE_DB_PASSWORD`  | Secret | 本番プロジェクトのDBパスワード               |

`production` という名前の Environment を作り、そこへ登録する。deploy.yml が参照する。

## 9.2 実行順序

deploy.yml は **backend → frontend の順に依存させてある**（`11_Deployment.md` 9章）。
新しいフロントエンドが旧スキーマを参照する時間帯を作らないためである。ジョブの順序を入れ替えてはならない。

フロントエンドのみを再公開したい場合は、実行時に `skip_backend` を有効にする。

---

# 10. 困ったときの確認先

| 症状                                   | 確認先                                |
| ------------------------------------ | ---------------------------------- |
| Discord ログインで `redirect_uri mismatch` | 作業1の Redirect URL。ポートは `54321`      |
| `environment variable is unset` の警告   | `.env` を書いた後に `supabase stop`/`start` したか |
| Edge Function が DB に繋がらない             | 5.2 の `SUPABASE_DB_URL`。コンテナ名を使う    |
| Edge Function が常に 401                 | `supabase functions serve` を `--env-file .env` 付きで起動したか |
| 本番でのみアセットが404                        | 作業7の `VITE_BASE_PATH`               |
| `/ranking` へ直リンクすると404               | `dist/404.html`。`bun run build` が生成する（`11_Deployment.md` 7章） |
| 環境変数の意味が分からない                        | `11_Deployment.md` 4章              |
| なぜその設計なのか                            | `docs/design/15_DecisionLog.md`     |

---

# 11. 更新ルール

本書は手順の正本である。外部サービスの画面変更などで手順が実態と合わなくなった場合は本書を修正する。

環境変数の値・リリース順序・完了条件を本書へ書き写してはならない。それらは1章の表に示した文書が正本である。
