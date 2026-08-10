# 11_Deployment.md

# Deployment Specification

Version: 2.0
Status: Active
Last Updated: 2026-08-03
準拠ADR: ADR-012, ADR-015, ADR-016, ADR-018, ADR-019

---

# 1. 目的

本書は、本システムの開発環境・本番環境・デプロイ方法・運用方法を定義する。

本書に従うことで、同一の実行環境を再現できることを目的とする。

本書は環境定義・環境変数・CI/CD・リリース手順・監視の正本である。

---

# 2. システム構成

## フロントエンド

GitHub Pages で配信する静的ファイル（React SPA）。ビルドは Bun ＋ Vite。

## バックエンド

Supabase（PostgreSQL、Auth、Realtime、Edge Functions）。

Storage はMVPでは使用しない。

---

# 3. 環境

| 環境          | フロントエンド                     | Supabaseプロジェクト        | 用途        |
| ----------- | --------------------------- | --------------------- | --------- |
| Local       | Vite Dev Server（localhost）  | Supabase Local（Docker） | ローカル開発・テスト |
| Staging     | GitHub Pages（`staging` ブランチ） | Staging用プロジェクト         | 結合確認      |
| Production  | GitHub Pages（`main` ブランチ）   | 本番プロジェクト              | 本番        |

Supabase プロジェクトは環境ごとに分離する。同一プロジェクトを複数環境で共有してはならない。

GitHub Pages は1リポジトリにつき1サイトであるため、Staging は別リポジトリまたは別パスへ配信する。

---

# 4. 環境変数

## 4.1 フロントエンド（ビルド時に埋め込まれる）

| 変数                     | 内容           |
| ---------------------- | ------------ |
| VITE_SUPABASE_URL      | Supabase URL |
| VITE_SUPABASE_ANON_KEY | Anon Key     |
| VITE_BASE_PATH         | 配信ベースパス      |

`VITE_` 接頭辞の変数はビルド成果物に含まれ、公開される。**秘密情報を設定してはならない。**

環境ごとの値は GitHub Actions の Environment Secrets / Variables で管理する。

## 4.2 バックエンド（Edge Functions）

| 変数                        | 内容                                    |
| ------------------------- | ------------------------------------- |
| SUPABASE_URL              | Project URL                           |
| SUPABASE_SERVICE_ROLE_KEY | Service Role Key                      |
| **SUPABASE_DB_URL**       | Connection Pooler 経由のDB接続文字列          |
| AUTH_PROVIDER_CLIENT_ID   | 外部OAuthプロバイダのクライアントID                 |
| AUTH_PROVIDER_SECRET      | 外部OAuthプロバイダのシークレット                   |

`SUPABASE_DB_URL` は、Edge Functions がPostgreSQLへ直接接続してトランザクションを制御するために必要である（ADR-016）。

認証プロバイダ関連の変数名はプロバイダに依存しない名称とする（ADR-015）。プロバイダ確定後も変数名を変更しない。

---

# 5. データベース接続

## 5.1 接続方式

Edge Functions は Connection Pooler（Supavisor）経由で接続する。

| 項目            | 設定                                    |
| ------------- | ------------------------------------- |
| モード           | Transaction mode                      |
| Prepared Statement | 無効化する                                 |
| 接続数           | Edge Function の同時実行数に合わせて上限を設定する      |

Transaction mode の Pooler では prepared statement がセッションをまたいで再利用できないため、クライアントライブラリの設定で無効化する。

## 5.2 RLSの扱い

直接接続はRLSを迂回する。Edge Function 内での認可チェックが必須である（`04_BackendInterface.md` 2.1）。

---

# 6. ビルド

## フロントエンド

```bash
bun install
bun run build
```

成果物は `dist/` へ出力される。

### ベースパスの設定

GitHub Pages がサブパス（`https://<user>.github.io/<repo>/`）で配信される場合、Vite の `base` を該当パスに設定する。

設定を誤ると、本番でのみアセットが404になる。

## Edge Functions

```bash
supabase functions deploy
```

## Migration

```bash
supabase db push
```

---

# 7. SPAのルーティング対応

GitHub Pages は静的ファイルサーバーであり、`/matches/:id` のようなクライアント側ルートに対応するファイルが存在しない。

そのままでは**直リンクおよびリロードが404になる。**

## 対応

ビルド後に `dist/index.html` を `dist/404.html` として複製する。

```bash
cp dist/index.html dist/404.html
```

GitHub Pages は存在しないパスへのアクセス時に `404.html` を返すため、SPAが起動してクライアント側でルーティングされる。

この対応は特に重要である。ランキングを未認証で公開しており（ADR-018）、外部から直リンクで参照される可能性が高いためである。

検証は `10_TestSpecification_Part10_E2E.md` の TC-E2E-038 で行う。

---

# 8. デプロイ

## フロントエンド

1. `main` ブランチへマージする
2. GitHub Actions が起動する
3. ビルドする
4. `404.html` を生成する
5. GitHub Pages へ公開する

## バックエンド

| 対象             | 方法                        |
| -------------- | ------------------------- |
| Migration      | Supabase CLI（追加方式）        |
| Edge Functions | `supabase functions deploy` |
| RLS Policy     | Migration に含める            |
| Seed           | Migration に含める            |

---

# 9. リリース手順

**順序が重要である。** 新しいフロントエンドが旧スキーマを参照する時間帯を作らないため、バックエンドを先に適用する。

```text
1. CI（Lint / Format / Type Check / 全テスト）が成功していること
2. Migration を適用する
3. Edge Functions をデプロイする
4. フロントエンドをビルドして GitHub Pages へ公開する
5. 動作確認
6. Changelog とバージョンを更新する
```

フロントエンドを先に公開してはならない。

## 9.1 後方互換性

Migration は既存スキーマを破壊しない形で追加する。列の削除・改名を行う場合は、以下の2段階で実施する。

1. 新しい列を追加し、両方を書き込む
2. 旧フロントエンドが十分に置き換わってから旧列を削除する

---

# 10. Migration方針

Migration は Supabase CLI を利用し、Git管理する。

## 10.1 追加方式

適用済みの Migration を編集しない。変更が必要な場合は新しい Migration を追加する。

## 10.2 ロールバック

**down migration は作成しない。** 追加方式と両立しないためである。

障害時は「打ち消す新しい Migration を追加する」ことで復旧する（forward fix）。

データ破損を伴う場合のみ、Supabase のバックアップから復元する。

## 10.3 適用順序

`03_Database.md` 18章に定義した順序に従う。

---

# 11. CI/CD

## 11.1 Pull Request 時

```text
Install
  ↓
Lint（oxlint）
  ↓
Format Check（oxfmt）
  ↓
Type Check（tsc --noEmit ＋ deno check）
  ↓
Supabase Local 起動
  ↓
Migration 適用
  ↓
Unit Test（Vitest）
  ↓
Integration Test（Deno Test）
  ↓
Database Test（pgTAP）
  ↓
Frontend Test（Vitest ＋ RTL）
  ↓
Build
  ↓
E2E Test（Playwright）
```

Project Constitution 第18条の品質ゲートを満たすため、Integration Test と E2E Test を **CIで実行する**。手動実行に依存しない。

## 11.2 main ブランチへのマージ時

上記に加えてデプロイを実行する。

デプロイは `main` ブランチのみで行う。

## 11.3 テスト実行環境

| テスト             | 実行環境                     |
| --------------- | ------------------------ |
| Unit / Frontend | Bun ＋ Vitest             |
| Integration     | Deno ＋ Supabase Local    |
| Database        | pgTAP ＋ Supabase Local   |
| E2E             | Playwright ＋ Supabase Local |

CI では Supabase Local（Docker）を起動して実行する。本番環境に対してテストを実行してはならない。

## 11.3.1 スクリプト

パッケージ管理は Bun に一本化してある（ADR-025）。`bun.lock` が正本であり `package-lock.json` は存在しない。

| スクリプト                     | 内容                                          |
| ------------------------- | ------------------------------------------- |
| `bun run dev`             | Vite 開発サーバー                                 |
| `bun run build`           | `vite build` ＋ `404.html` の生成               |
| `bun test` / `bun run test` | `test:unit` → `test:integration` を順に実行する   |
| `bun run test:unit`       | `vitest run`（`tests/unit/` と `src/**/*.test.tsx`） |
| `bun run test:integration` | `deno test`（`tests/integration/` のみ）        |
| `bun run typecheck`       | `tsc --noEmit`（Node側）＋ `deno check`（Deno側）  |
| `bun run lint`            | `oxlint`                                    |
| `bun run format:check`    | `oxfmt --check`                             |

型検査が2本に分かれるのは、`supabase/functions/**` が Deno コード（`Deno` グローバル、`https:` の import）であり Node の解決規則では扱えないためである。`tsconfig.json` の `include` は Node 側（`src/`・`tests/unit/`）のみを対象とし、Deno 側は `deno check` が担う。**どちらか一方だけでは全コードを検査できない。**

`404.html` の生成は `build` スクリプトに含めてある。CI とローカルで生成方法が分かれないようにするためである。

**`oxfmt` の対象から `docs/` を除外している。** 設計書は正本であり、整形ツールで一括変更してはならない。

## 11.3.2 CI のステップ

11.1 の順序のうち予約状態だったステップは、S5 / S6 でテストを追加したためすべて有効化済みである。

| ステップ                    | 状態     | 備考                                     |
| ----------------------- | ------ | -------------------------------------- |
| Supabase Local 起動・Migration 適用 | 有効  | `supabase start` ＋ `supabase db reset`  |
| Database Test（pgTAP）    | 有効     | `supabase/tests/database/`（制約・RLS）      |
| E2E Test（Playwright）    | 有効     | `tests/e2e/`。Edge Functions を起動してから実行する |

E2E は Edge Functions を実際に呼ぶため、CI では `supabase functions serve` を起動してから実行する。
`SUPABASE_DB_URL` にはコンテナ名を使う（`127.0.0.1` はコンテナ自身を指すため DB へ届かない）。

**E2E のログインは Discord の認可画面を経由しない。** Supabase Admin API で作成した利用者を
Discord 利用者として振る舞わせ、アプリ自身のクライアントにログインさせる（`tests/e2e/fixtures.ts`）。
OAuth の往復そのものは自動化の対象外であり、`SetupRunbook.md` 作業3の手動確認が担う。

Frontend Test は Unit Test と同じ Vitest 実行に含めている（`src/**/*.test.tsx`）。分離が必要になった時点でステップを分ける。

---

# 11.4 管理者の付与

管理者はSupabaseプロジェクトの運用者が指定する（ADR-020）。アプリケーションに管理者を登録・昇格させる機能は存在しない。

## 手順

1. 対象の利用者に一度ログインしてもらい、`auth.users` にレコードを作成させる
2. 以下のいずれかで `app_metadata` にロールを設定する

```sql
UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
 WHERE id = '<user-uuid>';
```

Supabaseダッシュボードの Authentication → Users からも編集できる。Admin API（service_role）でも同じ操作を行える。

## 反映タイミング

**付与は即座に反映されない。** `app_metadata` はJWTへ埋め込まれるため、対象利用者のトークンが更新されるまで有効にならない。

| 反映される契機     | 所要                       |
| ----------- | ------------------------ |
| 再ログイン       | 即時                       |
| トークンの自動リフレッシュ | Supabaseのトークン有効期限に依存     |

付与後は対象利用者へ再ログインを案内する。

## 剥奪

```sql
UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data - 'role'
 WHERE id = '<user-uuid>';
```

剥奪も同様に、対象利用者のトークンが更新されるまで有効にならない。即座に無効化する必要がある場合は、対象利用者のセッションを失効させる。

## 確認

```sql
SELECT id, email, raw_app_meta_data ->> 'role' AS role
  FROM auth.users
 WHERE raw_app_meta_data ->> 'role' = 'admin';
```

---

# 12. バックアップ

| 対象         | 方法                                   |
| ---------- | ------------------------------------ |
| PostgreSQL（データ） | Supabase Backup（ダッシュボードで有効化する） |
| PostgreSQL（スキーマ） | デプロイ前に CI が取得し、成果物として30日保持する |

`audit_logs` は追記専用であり削除しないため、保持期間の監視対象とする。

## 12.1 デプロイ前のスキーマ取得

`deploy.yml` は `supabase db push` の前に `supabase db dump` でスキーマを保存する。

down migration を作らない方針（10.2）のため復旧は forward fix で行うが、そのとき
「適用前がどうだったか」が要る。差分の基準として残す。

## 12.2 データをCIの成果物に置かない

**本番データのダンプを GitHub の成果物へ置いてはならない。**

成果物はリポジトリを参照できる者が誰でも取得でき、保持期間中は残り続ける。
個人情報を含むダンプをそこへ置くことは、漏洩経路を自ら作ることに等しい。

データの復旧は Supabase 側のバックアップ／PITR を使う。手順は `SetupRunbook.md` 10章にある。

---

# 13. 監視

| 対象             | 監視内容                     |
| -------------- | ------------------------ |
| Edge Functions | エラー率、実行時間、失敗ログ           |
| PostgreSQL     | 接続数、スロークエリ、ディスク使用量       |
| Authentication | 認証失敗率                    |
| Realtime       | 接続数、送信失敗                 |
| Cron           | `auto-resolve-matches` の実行結果 |

## 13.1 重点監視項目

| 項目                              | 異常の兆候                      |
| ------------------------------- | -------------------------- |
| `auto-resolve-matches` の失敗      | 試合が確定せず滞留する                |
| `cleanup-matching-queue` の削除件数  | 継続的に0でない場合、キュー削除の不具合を示唆    |
| Connection Pooler の接続枯渇         | Edge Functions が同時実行で失敗する  |
| `DRAWN` の発生率                    | 急増した場合、期限設定が短すぎる可能性        |

自動解決バッチが停止すると、試合が確定せず両チームが次の試合に参加できなくなるため、最優先で監視する。

## 13.2 健全性確認スクリプト

`scripts/health-check.sql` が上記の項目を機械で確かめられる形にしてある。
デプロイ直後に `deploy.yml` が実行し、運用中は手動でも実行する。

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/health-check.sql
```

| 確認 | 失敗時の扱い |
| -- | ------ |
| 9テーブル・4ビューの存在 | 異常終了（Migration の適用漏れ） |
| `system_settings` の初期行 | 異常終了（Seed の適用漏れ） |
| 全テーブルで RLS が有効 | 異常終了 |
| Cron ジョブ4件の登録 | 異常終了 |
| Vault の登録 | 警告のみ（ローカルでは未登録が正常） |
| 滞留・期限超過・接続数 | 表示のみ |

### ★Cron の「成功」を信用してはならない

`cron.job_run_details` の `status = succeeded` は **SQL が実行できたこと**しか意味しない。
`invoke_edge_function` は Vault が未登録なら何もせずに戻るため（0015_cron.sql）、
呼び出しが一度も起きていなくてもジョブは成功と記録される。

したがって Cron の成否ではなく、**期限を過ぎたまま残る試合の件数**で自動解決の生死を判断する。
本スクリプトが `overdue_report` / `overdue_approve` を出しているのはこのためである。

---

# 14. セキュリティ

* Secret を Git へコミットしない
* Service Role Key と DB接続文字列はバックエンドのみで利用する
* フロントエンドでは Anon Key のみ利用する
* `VITE_` 接頭辞の変数に秘密情報を設定しない
* HTTPS通信を前提とする
* RLS を有効化する
* ログへ個人情報・トークン・招待コードの平文を出力しない

---

# 15. AI実装ルール

* デプロイ可能な状態を維持しながら実装する。
* Migration は追加方式とし、既存 Migration を編集しない。
* down migration を作成しない。復旧は forward fix で行う。
* `main` ブランチへ直接コミットしない。
* CI が成功した変更のみデプロイする。
* リリースは Migration → Edge Functions → フロントエンドの順で行う。
* 環境変数をコードへハードコードしない。
* ビルド時に `404.html` を生成する。
