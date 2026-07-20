# 05_Frontend.md

# Frontend Design Specification

Version 1.0

---

# 1. 目的

本書はフロントエンドの設計方針を定義する。

対象は以下とする。

* React SPA
* GitHub Pages
* Supabase Backend

フロントエンドは Backend Interface を唯一のバックエンド接続点とする。

---

# 2. 技術スタック

| カテゴリ                      | 採用技術                    |
| ------------------------- | ----------------------- |
| Runtime / Package Manager | Bun                     |
| Language                  | TypeScript              |
| Framework                 | React（最新安定版）            |
| Build                     | Vite                    |
| Router                    | React Router            |
| Server State              | TanStack Query          |
| Client State              | Zustand                 |
| Form                      | React Hook Form         |
| Validation                | Zod                     |
| CSS                       | Tailwind CSS            |
| Backend SDK               | Supabase JavaScript SDK |
| Formatter                 | oxfmt                   |
| Linter                    | oxlint                  |
| Unit Test                 | Vitest                  |
| Component Test            | React Testing Library   |
| E2E Test                  | Playwright              |

---

# 3. アーキテクチャ

Feature First Architecture を採用する。

```text
UI

↓

Feature

↓

Hooks

↓

Client

↓

Backend Interface

↓

Supabase
```

責務を明確に分離する。

---

# 4. ディレクトリ構成

```text
src/

app/
├── router/
├── providers/
├── layouts/

features/
├── auth/
├── profile/
├── team/
├── matchmaking/
├── match/
├── ranking/
├── admin/

shared/
├── components/
├── hooks/
├── lib/
├── services/
├── types/
├── utils/

assets/

styles/
```

---

# 5. Feature構成

各Featureは以下の構造を持つ。

```text
feature/

components/

hooks/

client/

schemas/

types/

pages/

index.ts
```

Feature間の依存は禁止する。

共通化が必要な場合は shared へ移動する。

---

# 6. レイヤ責務

## Components

UIのみ。

ロジックを書かない。

---

## Hooks

画面ロジックを担当する。

例

* useRanking
* useMatch
* useProfile

---

## Client

Backend Interface を呼び出す。

Supabase SDK は Client のみ利用可能。

---

## Shared

複数Featureから利用される共通処理。

---

# 7. 状態管理

## TanStack Query

サーバーデータを管理する。

対象

* ランキング
* チーム
* 試合
* プロフィール

---

## Zustand

UI状態を管理する。

対象

* Dialog
* Drawer
* Theme
* Notification
* Loading

サーバーデータは保持しない。

---

# 8. データフロー

```text
Page

↓

Hook

↓

Client

↓

Edge Function / Query

↓

DTO

↓

Hook

↓

Component
```

Componentは DTO を直接加工しない。

---

# 9. DTO

Backend Interface の DTO をそのまま利用する。

フロント独自 DTO は原則作成しない。

必要な場合は ViewModel を定義する。

---

# 10. エラー処理

エラーは共通ハンドラーで処理する。

種類

* Validation
* Authorization
* Business
* Internal

表示方法

* Toast
* Dialog
* Error Page

---

# 11. AI実装ルール

AIは以下を遵守する。

* Featureを跨いで実装しない。
* Hooks以外へ状態管理を書かない。
* Componentsに業務ロジックを書かない。
* Client以外からSupabase SDKを利用しない。
* DTOを直接変更しない。
* Backend Interface以外へアクセスしない。

---

# 12. 命名規則

Components

PascalCase

例

```text
TeamCard
```

---

Hooks

camelCase

```text
useMatch()
```

---

Client

camelCase

```text
teamClient
```

---

型

PascalCase

```text
TeamDto
```

---

定数

UPPER_SNAKE_CASE

```text
MAX_TEAM_SIZE
```

# 05_Frontend.md

## Part2

# Router Design

---

# 1. Router

React Router Data Router を採用する。

すべての画面は Router 管理下で動作する。

---

## Router構成

```text
RootLayout

├── PublicLayout
│      ├── /
│      └── /login
│
├── AppLayout
│      ├── /dashboard
│      ├── /team
│      ├── /ranking
│      ├── /matches
│      ├── /matches/:id
│      └── /profile
│
└── AdminLayout
       ├── /admin
       ├── /admin/settings
       └── /admin/teams
```

---

# 2. Layout責務

## RootLayout

責務

* Theme
* Provider
* Error Boundary
* Suspense
* Toast

Root Provider を配置する。

---

## PublicLayout

責務

未ログイン画面。

認証不要。

対象

* Top
* Login

---

## AppLayout

責務

ログイン必須画面。

共通ヘッダー

共通サイドバー

通知

Realtime購読

---

## AdminLayout

責務

管理画面。

管理者のみアクセス可能。

---

# 3. Route Guard

## Public

認証不要

---

## Protected

ログイン必須

未認証

↓

Loginへリダイレクト

---

## Admin

管理者のみ

権限不足

↓

403画面

---

# 4. 認証フロー

Steam OAuth を利用する。

フロー

```text
Login

↓

Steam OAuth

↓

Supabase Auth

↓

JWT取得

↓

Profile取得

↓

Dashboard
```

---

# 5. Session

Session は

Supabase Auth が保持する。

フロントで JWT を保存しない。

---

# 6. Profile Loading

ログイン後

以下を取得する。

```text
Profile

↓

所属チーム

↓

未完了試合

↓

Realtime開始
```

---

# 7. Error Boundary

配置

RootLayout

エラー時

共通エラーページ表示

---

# 8. Suspense

以下を対象とする。

* Ranking
* Match List
* Team Detail

画面単位で利用する。

---

# 9. Navigation

画面遷移は

React Router

のみ利用する。

window.location は利用しない。

---

# 10. Scroll Restoration

ページ遷移時

スクロール位置を復元する。

---

# 11. Breadcrumb

AppLayout が生成する。

例

```text
Dashboard

↓

Team

↓

Match Detail
```

---

# 12. Page一覧

## Public

Top

Login

---

## Player

Dashboard

Ranking

Team

Match List

Match Detail

Profile

---

## Admin

Dashboard

Teams

Settings

---

# 13. Realtime開始タイミング

AppLayout の初期化時に開始する。

購読対象

* ranking
* match
* team

ログアウト時に購読解除する。

---

# 14. AI実装ルール

* Route は Data Router を利用する。
* Layout に業務ロジックを書かない。
* Route Guard は Loader または共通認証コンポーネントで実装する。
* Realtime は AppLayout で一括管理する。
* Error Boundary は RootLayout のみ配置する。
* ページから直接 Supabase SDK を呼び出さない。

# 05_Frontend.md

## Part3

# Data Access & State Management

---

# 1. 基本方針

フロントエンドの状態は以下の2種類に分類する。

| 種類      | 管理方法           |
| ------- | -------------- |
| サーバーデータ | TanStack Query |
| UI状態    | Zustand        |

責務を明確に分離する。

---

# 2. TanStack Query

## 対象

以下のデータを管理する。

* プロフィール
* チーム情報
* ランキング
* 試合一覧
* 試合詳細
* マッチング待機状態

---

## Query Hook

Query取得は Feature ごとに実装する。

例

```text
useProfile()

useMyTeam()

useRanking()

useMatchList()

useMatchDetail()
```

---

## Mutation Hook

更新処理は Mutation とする。

例

```text
useCreateTeam()

useCreateInvite()

useAcceptInvite()

useQueueMatch()

useCancelQueue()

useReportMatch()

useApproveMatch()
```

Mutation 完了後は Query を invalidate する。

---

# 3. Query Key

Query Key は Feature ごとに定義する。

例

```typescript
profileKeys.me()

teamKeys.my()

teamKeys.detail(teamId)

rankingKeys.list()

matchKeys.list()

matchKeys.detail(matchId)
```

Query Key の文字列を直接記述しない。

---

# 4. Backend Client

Supabase SDK を直接利用するのは Client 層のみとする。

構成例

```text
clients/

profileClient.ts

teamClient.ts

matchClient.ts

adminClient.ts
```

責務

* Query
* Edge Function 呼び出し
* DTO 変換（必要最小限）

---

# 5. Client 利用ルール

Page および Component から Supabase SDK を直接利用しない。

Hook を経由して Client を呼び出す。

```text
Page

↓

Hook

↓

Client

↓

Backend Interface
```

---

# 6. Zustand

Zustand は UI 状態のみ保持する。

管理対象

* Dialog
* Drawer
* Toast
* Theme
* Notification
* 一時的な画面状態

サーバーデータは保持しない。

---

# 7. Cache Policy

## ランキング

キャッシュ可。

Realtime 通知で再取得。

---

## チーム情報

キャッシュ可。

更新後に invalidate。

---

## 試合一覧

キャッシュ可。

Realtime 通知で再取得。

---

## 試合詳細

キャッシュ可。

状態変更時に invalidate。

---

## プロフィール

ログイン中は保持する。

ログアウト時に破棄する。

---

# 8. Realtime同期

Realtime イベント受信時は Query を invalidate する。

例

```text
MATCH_COMPLETED

↓

invalidate(matchList)

↓

invalidate(matchDetail)

↓

invalidate(ranking)
```

UI 状態は直接更新しない。

---

# 9. Error Handling

Query Error

↓

共通 Error Handler

↓

Toast 表示

Business Error は Backend の Error Code を利用する。

---

# 10. Loading

Loading 状態は TanStack Query を利用する。

独自 Loading Store は作成しない。

---

# 11. Retry

デフォルト

3回

Business Error は Retry しない。

Network Error のみ Retry を行う。

---

# 12. Pagination

ランキングおよび試合一覧は Limit / Offset を利用する。

Infinite Scroll は MVP の対象外とする。

---

# 13. AI実装ルール

* Query は Query Hook に実装する。
* 更新処理は Mutation Hook に実装する。
* Client 以外で Supabase SDK を利用しない。
* Query Key は専用モジュールで管理する。
* Mutation 成功後は必要な Query のみ invalidate する。
* Zustand にサーバーデータを保持しない。
* Realtime 受信時は Query の再取得を基本とし、手動でキャッシュを書き換えない。

# 05_Frontend.md

## Part4

# UI Design & Component Guidelines

---

# 1. 基本方針

UIは以下の原則に従う。

* シンプルで一貫したデザイン
* レスポンシブ対応
* アクセシビリティを考慮する
* ダークモード対応を前提とする
* コンポーネントの再利用性を重視する

---

# 2. コンポーネント構成

共通コンポーネントは `shared/components` に配置する。

```text
shared/
└── components/
    ├── ui/
    ├── form/
    ├── feedback/
    ├── layout/
    └── navigation/
```

---

## ui

汎用UI部品。

例

* Button
* Card
* Badge
* Avatar
* Icon
* Divider
* Spinner

---

## form

入力系コンポーネント。

例

* TextField
* NumberField
* Select
* Checkbox
* RadioGroup
* TextArea

React Hook Form に対応する。

---

## feedback

画面への通知。

例

* Toast
* Alert
* ConfirmDialog
* LoadingOverlay
* EmptyState

---

## layout

レイアウト部品。

例

* Header
* Sidebar
* Container
* PageTitle
* Section

---

## navigation

画面遷移関連。

例

* Breadcrumb
* Pagination
* Tabs
* NavigationMenu

---

# 3. Feature Components

Feature固有のコンポーネントは Feature 配下へ配置する。

例

```text
features/
└── team/
    └── components/
        ├── TeamCard.tsx
        ├── TeamMemberList.tsx
        └── InviteDialog.tsx
```

他Featureから直接参照しない。

---

# 4. フォーム設計

フォームは React Hook Form を利用する。

入力値検証は Zod によって実施する。

すべてのフォームで同一のエラー表示ルールを適用する。

---

# 5. バリデーション

## クライアント

入力形式の検証を行う。

例

* 必須
* 文字数
* 数値範囲

---

## サーバー

業務ルールを検証する。

例

* チーム名重複
* 人数上限
* 試合状態

---

# 6. ローディング

ローディング表示を統一する。

種類

* Spinner
* Skeleton
* LoadingOverlay

画面全体をブロックするのは必要最小限とする。

---

# 7. エラー表示

Business Error

→ Toast

Validation Error

→ フォーム下部

Network Error

→ Alert

Fatal Error

→ Error Page

---

# 8. ダイアログ

用途

* チーム作成
* 招待コード表示
* 勝敗確認
* BAN確認

ダイアログは ConfirmDialog を共通利用する。

---

# 9. 通知

Toast を利用する。

表示例

* チームを作成しました。
* 招待コードを発行しました。
* マッチングしました。
* 試合結果を登録しました。

---

# 10. 空状態（Empty State）

データが存在しない場合は専用UIを表示する。

例

* チーム未所属
* 試合履歴なし
* ランキングなし

空テーブルは表示しない。

---

# 11. Tailwind CSS 利用方針

* Utility Class を基本とする。
* インライン style は使用しない。
* 共通デザインはコンポーネントへ切り出す。
* 独自CSSは必要最小限とする。

---

# 12. アクセシビリティ

以下を必須とする。

* キーボード操作対応
* フォーカス表示
* 適切な aria-* 属性
* コントラスト比の確保

---

# 13. レスポンシブ対応

ブレークポイント

* Mobile
* Tablet
* Desktop

モバイルファーストで設計する。

---

# 14. アイコン

Lucide React を利用する。

アイコンのみで意味を伝えず、必要に応じてラベルを併記する。

---

# 15. AI実装ルール

* 共通UIは `shared/components` に配置する。
* Feature固有UIは各 Feature 配下に配置する。
* Atomic Design は採用しない。
* フォームは React Hook Form と Zod を組み合わせる。
* 共通部品を優先し、重複実装を避ける。
* アクセシビリティを考慮した実装を行う。

## UI Component Library

本プロジェクトでは **shadcn/ui** を標準コンポーネントライブラリとして採用する。

採用方針は以下のとおりとする。

- 必要なコンポーネントのみ追加する。
- コンポーネントはプロジェクト内で管理する。
- 共通デザインの変更は追加したコンポーネントを直接修正する。
- Tailwind CSS を用いてデザインを調整する。
- Feature 固有のUIは shadcn/ui を組み合わせて実装する。


# 05_Frontend.md

## Part5

# Presentation Layer & Frontend Development Guidelines

---

# 1. プレゼンテーション層

画面固有の表示ロジックは Presentation Layer に実装する。

Presentation Layer は Backend Client を直接利用しない。

---

# 2. ViewModel Hook

画面ごとに ViewModel Hook を定義する。

例

```text
useHomePage()

useRankingPage()

useTeamPage()

useMatchDetailPage()

useAdminSettingsPage()
```

責務

* UIイベント処理
* 表示データ整形
* フィルタ
* ソート
* ページング
* ダイアログ制御

---

# 3. Data Hook

データ取得・更新は Feature Hook が担当する。

例

```text
useRanking()

useMyTeam()

useMatchList()

useApproveMatch()

useQueueMatch()
```

責務

* TanStack Query
* Mutation
* Backend Client 呼び出し

---

# 4. データフロー

```text
Page

↓

ViewModel Hook

↓

Feature Hook

↓

Backend Client

↓

Supabase
```

Page はデータ取得処理を持たない。

---

# 5. ViewModel の責務

ViewModel は以下を担当する。

* 画面初期化
* ボタンイベント
* ダイアログ制御
* 入力状態
* 表示用データ生成

業務ロジックは持たない。

---

# 6. Feature Hook の責務

Feature Hook は以下を担当する。

* Query
* Mutation
* Cache 更新
* Realtime 更新

UI状態は保持しない。

---

# 7. Backend Client の責務

Backend Client は Backend Interface の呼び出しのみを担当する。

以下は禁止する。

* UI処理
* 状態管理
* 画面用データ加工

---

# 8. Component の責務

Component は以下のみ担当する。

* 描画
* イベント通知
* Props 表示

API呼び出しは禁止する。

---

# 9. エラーハンドリング

画面では Error Code を解釈しない。

共通 Error Handler を利用する。

---

# 10. テスト方針

## Unit Test

対象

* ViewModel Hook
* Utility
* Zod Schema

---

## Component Test

対象

* 共通コンポーネント
* Feature コンポーネント

---

## Integration Test

対象

* Feature Hook
* Backend Client

---

## E2E Test

Playwright を利用する。

対象

* ログイン
* チーム作成
* マッチング
* 勝敗報告
* ランキング更新

---

# 11. AI実装ガイドライン

AI は以下を厳守する。

* Component に API 呼び出しを書かない。
* Page に業務ロジックを書かない。
* Backend Client を直接 Page から利用しない。
* Query は Feature Hook に集約する。
* 表示ロジックは ViewModel Hook に集約する。
* Feature を跨いだ依存を作らない。
* 共通UIを優先して利用する。

---

# 12. フロントエンド責務まとめ

| レイヤ            | 責務              |
| -------------- | --------------- |
| Page           | 画面構成            |
| ViewModel Hook | 画面表示ロジック・UIイベント |
| Feature Hook   | データ取得・更新        |
| Backend Client | バックエンド通信        |
| Component      | UI描画            |
| Shared         | 共通機能            |
| Supabase       | 認証・DB・Realtime  |
