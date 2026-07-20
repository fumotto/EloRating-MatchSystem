# 02_BasicDesign.md

# 固定チームレート戦 戦績管理システム

## 基本設計書

Version 1.0 (MVP)

---

# 1. 目的

本書は「固定チームレート戦 戦績管理システム」の基本設計を定義する。

本設計は、画面・データ・API・状態管理・権限管理の全体構造を示し、実装者およびAIコーディングエージェントが同一の設計思想に基づいて実装できることを目的とする。

---

# 2. システム構成

```
+----------------------+
|     GitHub Pages     |
| React + TypeScript   |
+----------+-----------+
           |
           | HTTPS
           |
+----------v-----------+
|      Supabase        |
|----------------------|
| Auth                 |
| PostgreSQL           |
| Realtime             |
| Storage              |
| Edge Functions       |
+----------+-----------+
           |
           |
+----------v-----------+
| PostgreSQL Database  |
+----------------------+
```

---

# 3. 採用技術

## Frontend

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* Zustand
* Tailwind CSS

---

## Backend

* Supabase Auth
* PostgreSQL
* Realtime
* Edge Functions
* Row Level Security (RLS)

---

# 4. アーキテクチャ

SPA + BaaS 構成を採用する。

フロントエンドは画面表示およびユーザー操作を担当する。

Supabaseは認証・データ保存・リアルタイム通知を担当する。

Edge Functionsは複雑なビジネスロジックを実行する。

---

# 5. 設計方針

## 単一責務

各機能は一つの責務のみを持つ。

例

* チーム管理
* マッチング
* 試合管理
* レーティング

は互いに独立したモジュールとして設計する。

---

## 状態管理

状態はデータベースを唯一の正とする。

画面側は状態を保持せず、Supabaseから取得したデータを表示する。

リアルタイム更新は Supabase Realtime を利用する。

---

## 権限管理

権限はRow Level Securityによって制御する。

画面側のみで制御を行わない。

---

# 6. 機能構成

```
認証
│
├─ Steamログイン
└─ ログアウト

チーム
│
├─ 作成
├─ 参加
└─ メンバー管理

マッチング
│
├─ キュー参加
├─ キュー離脱
└─ マッチ成立

試合
│
├─ 開始
├─ 勝利申告
├─ 敗者承認
└─ レート更新

ランキング
│
└─ ランキング表示

管理
│
├─ BAN
├─ K値変更
└─ レートリセット
```

---

# 7. 画面構成

```
ログイン

↓

ホーム

├── チーム

├── マッチング

├── 試合

├── ランキング

└── 設定
```

管理者

```
管理画面

├── チーム管理

├── レーティング設定

└── システム設定
```

---

# 8. モジュール構成

```
Auth

Team

Matching

Match

Rating

Ranking

Admin

Notification
```

各モジュールは他モジュールへ直接アクセスしない。

必要な情報はAPIを介して取得する。

---

# 9. 試合フロー

```
キュー参加

↓

マッチ成立

↓

試合開始

↓

勝利申告

↓

敗者承認

↓

レート更新

↓

ランキング更新
```

---

# 10. 状態遷移

## Team

```
ACTIVE

↓

MATCHING

↓

PLAYING

↓

ACTIVE
```

BANされた場合

```
ACTIVE

↓

BANNED
```

---

## Match

```
MATCHING

↓

MATCHED

↓

PLAYING

↓

WINNER_REPORTED

↓

COMPLETED
```

---

# 11. 権限設計

## プレイヤー

可能

* チーム作成
* チーム参加
* キュー参加
* ランキング閲覧

不可

* BAN
* レート変更
* K値変更

---

## チームオーナー

追加権限

* 勝利申告
* メンバー管理

---

## 敗者チームオーナー

追加権限

* 勝敗承認

---

## 管理者

全操作可能

---

# 12. 通知

Realtimeを利用する。

対象

* マッチ成立
* 試合開始
* 勝利申告
* 承認待ち
* 試合完了

---

# 13. エラー設計

共通エラーコードを利用する。

例

```
AUTH_REQUIRED

TEAM_NOT_FOUND

TEAM_FULL

MATCH_NOT_FOUND

ALREADY_MATCHING

ALREADY_PLAYING

NOT_TEAM_OWNER

PERMISSION_DENIED

INVALID_MATCH_STATE
```

画面ではエラーメッセージへ変換して表示する。

---

# 14. セキュリティ

認証

Supabase Auth

認可

Row Level Security

通信

HTTPS

管理機能

管理者ロールのみ

---

# 15. ログ

MVPでは以下を保存する。

* ログイン
* チーム作成
* マッチ開始
* 勝利申告
* 承認
* レート更新

詳細な監査ログは将来機能とする。

---

# 16. パフォーマンス

一覧画面はページング可能な構造とする。

ランキングはレート降順で取得する。

Realtimeを利用する画面ではポーリングを行わない。

---

# 17. 将来拡張を考慮した設計

本設計では以下の機能追加を想定している。

* Discord Bot
* シーズン管理
* リプレイ管理
* チームチャット
* API公開
* 統計画面
* 大会モード

これらの機能は既存モジュールを変更せず、新規モジュールとして追加できる構成とする。
