# 11_Deployment.md

# Deployment Specification

---

# 1. 目的

本書は、本システムの開発環境・本番環境・デプロイ方法・運用方法を定義する。

本書に従うことで、同一の実行環境を再現できることを目的とする。

---

# 2. システム構成

## フロントエンド

* GitHub Pages
* React
* Bun
* TypeScript

配信

```
GitHub Pages
        │
        ▼
Static Files
```

---

## バックエンド

* Supabase

構成

* PostgreSQL
* Authentication
* Storage
* Realtime
* Edge Functions

---

# 3. 環境

本システムは以下の環境を持つ。

| 環境          | 用途     |
| ----------- | ------ |
| Local       | ローカル開発 |
| Development | 開発環境   |
| Production  | 本番環境   |

---

# 4. 環境変数

## Frontend

| 変数                     | 内容           |
| ---------------------- | ------------ |
| VITE_SUPABASE_URL      | Supabase URL |
| VITE_SUPABASE_ANON_KEY | Anon Key     |

---

## Backend

| 変数                        | 内容               |
| ------------------------- | ---------------- |
| SUPABASE_URL              | Project URL      |
| SUPABASE_SERVICE_ROLE_KEY | Service Role Key |
| STEAM_API_KEY             | Steam API Key    |

---

# 5. ビルド

## Frontend

```
bun install

bun run build
```

成果物

```
dist/
```

---

## Edge Functions

```
supabase functions deploy
```

---

# 6. デプロイ

## Frontend

デプロイ先

GitHub Pages

手順

1. mainブランチへマージ
2. GitHub Actions実行
3. Reactをビルド
4. GitHub Pagesへ公開

---

## Backend

デプロイ先

Supabase

対象

* Database Migration
* Edge Functions
* Realtime設定
* RLS Policy

---

# 7. Database Migration

MigrationはSupabase CLIを利用する。

適用順

```
Schema

↓

Tables

↓

Indexes

↓

Constraints

↓

RLS

↓

Seed
```

MigrationはGit管理する。

---

# 8. GitHub Actions

Push

↓

Install

↓

Lint

↓

Format Check

↓

Unit Test

↓

Build

↓

Deploy

mainブランチのみデプロイを実施する。

---

# 9. リリース

リリース手順

1. Unit Test成功
2. Integration Test成功
3. E2E成功
4. mainへMerge
5. GitHub Actions実行
6. GitHub Pages公開
7. Supabase Migration適用
8. Edge Functions更新
9. 動作確認

---

# 10. ロールバック

障害発生時は以下を実施する。

Frontend

* 前回リリースへ戻す。

Database

* Migrationをロールバックする。

Edge Functions

* 前回バージョンへ戻す。

---

# 11. バックアップ

対象

* PostgreSQL
* Storage

取得

* Supabase Backup

---

# 12. 監視

対象

* Edge Functions
* PostgreSQL
* Authentication
* Realtime

監視内容

* Error Log
* Performance
* API Error Rate

---

# 13. セキュリティ

* SecretはGitへコミットしない。
* Service Role Keyはバックエンドのみで利用する。
* FrontendではAnon Keyのみ利用する。
* HTTPS通信を前提とする。
* RLSを有効化する。

---

# 14. AI実装ルール

* デプロイ可能な状態を維持しながら実装する。
* Migrationは必ず追加方式とし、既存Migrationを編集しない。
* mainブランチへ直接コミットしない。
* CIが成功した変更のみデプロイする。
* 環境変数はコードへハードコードしない。
