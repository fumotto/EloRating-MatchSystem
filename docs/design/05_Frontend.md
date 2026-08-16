# 05_Frontend.md

# Frontend Design Specification

Version: 2.0
Status: Active
Last Updated: 2026-08-03
準拠ADR: ADR-006, ADR-011, ADR-012, ADR-018, ADR-019

---

# 1. 目的

本書はフロントエンドの設計方針を定義する。

対象は React SPA（GitHub Pages 配信、Supabase Backend）とする。

フロントエンドは `04_BackendInterface.md` に定義されたインターフェースを唯一のバックエンド接続点とする。

本書は以下の正本である。

* 画面構成とルーティング
* レイヤ責務
* 状態管理方針
* UIガイドライン

---

# 2. 技術スタック

技術選定の正本は `12_TechnologyStack.md` である。本表は参照用の抜粋とする。

| カテゴリ                      | 採用技術                    |
| ------------------------- | ----------------------- |
| Runtime / Package Manager | Bun                     |
| Language                  | TypeScript              |
| Framework                 | React（最新安定版）            |
| Build                     | Vite                    |
| Router                    | **TanStack Router**     |
| Server State              | TanStack Query          |
| Client State              | Zustand                 |
| Form                      | React Hook Form         |
| Validation                | Zod                     |
| UI Components             | shadcn/ui               |
| CSS                       | Tailwind CSS            |
| Icons                     | Lucide React            |
| Backend SDK               | Supabase JavaScript SDK |
| Formatter                 | oxfmt                   |
| Linter                    | oxlint                  |
| Unit / Component Test     | Vitest ＋ React Testing Library |
| E2E Test                  | Playwright              |

ルーターは **TanStack Router** である（ADR-006）。React Router は採用しない。

---

# 3. アーキテクチャ

Feature First Architecture を採用する。

## 3.1 レイヤ構成

```text
Route（ルート定義・Guard）
  ↓
Page（画面構成）
  ↓
ViewModel Hook（画面表示ロジック・UIイベント）
  ↓
Feature Hook（データ取得・更新／TanStack Query）
  ↓
Backend Client（Supabase SDK 呼び出し）
  ↓
Backend Interface（Edge Function / Query / Realtime）
```

各レイヤは1つ下のレイヤのみを呼び出す。レイヤを飛び越えてはならない。

## 3.2 レイヤ責務

| レイヤ            | 責務                              | 禁止事項                    |
| -------------- | ------------------------------- | ----------------------- |
| Route          | パス定義、認証・権限ガード                   | 業務ロジック                  |
| Page           | 画面の構成（コンポーネントの配置）               | データ取得、業務ロジック            |
| ViewModel Hook | UIイベント処理、表示データ整形、フィルタ・ソート・ダイアログ制御 | API呼び出し、業務ルールの判定        |
| Feature Hook   | Query / Mutation、キャッシュ制御、Realtime購読 | UI状態の保持                 |
| Backend Client | Backend Interface の呼び出し、DTO変換   | UI処理、状態管理、画面用データ加工      |
| Component      | 描画、イベント通知                       | API呼び出し、業務ロジック          |

「Client」「Backend Client」は同一のものを指す。本書では **Backend Client** に統一する。

---

# 4. ディレクトリ構成

ADR-019により、構成は `00_DirectoryStructure.md`・`12_TechnologyStack.md` と一致させる。

```text
src/
├── app/            # アプリケーション初期化・Provider・エラー境界
├── routes/         # ルート定義（TanStack Router）
├── features/       # 機能単位のモジュール
│   ├── auth/
│   ├── profile/
│   ├── team/
│   ├── matchmaking/
│   ├── match/
│   ├── ranking/
│   └── admin/
├── components/     # 共通UIコンポーネント
│   ├── ui/         # shadcn/ui のコンポーネント
│   ├── form/
│   ├── feedback/
│   ├── layout/
│   └── navigation/
├── hooks/          # 共通フック
├── stores/         # Zustand ストア
├── services/       # Backend Client
├── lib/            # 外部ライブラリのラッパー（supabase クライアント等）
├── types/          # 共通型定義（Backend Interface の DTO）
├── utils/          # 純粋関数ユーティリティ
└── assets/
```

## 4.1 Feature の内部構成

```text
features/<name>/
├── components/   # Feature固有のUI
├── hooks/        # Feature Hook・ViewModel Hook
├── schemas/      # Zod スキーマ
└── index.ts      # 公開インターフェース
```

Feature間の直接依存を禁止する。共通化が必要な場合は `components/`・`hooks/`・`utils/` へ移動する。

Backend Client は Feature 配下ではなく `services/` へ集約する。

```text
services/
├── profileClient.ts
├── teamClient.ts
├── matchClient.ts
├── rankingClient.ts
└── adminClient.ts
```

---

# 5. ルーティング

TanStack Router を採用する。すべての画面はRouter管理下で動作する。

## 5.1 ルート構成

```text
RootLayout
│
├── PublicLayout（認証不要）
│      ├── /                 Top（サイト名・背景・3つの導線 / Issue #8）
│      ├── /login            Login
│      ├── /rules            Rules（Markdown表示 / Issue #8）
│      └── /ranking          Ranking
│
├── AppLayout（認証必須）
│      ├── /dashboard        Dashboard
│      ├── /team             My Team
│      ├── /team/:teamId     Team Detail
│      ├── /matchmaking      Matchmaking（待機画面）
│      ├── /matches          Match List
│      ├── /matches/:matchId Match Detail
│      ├── /profile          Profile
│      └── /settings         Settings
│
├── AdminLayout（管理者のみ）
│      ├── /admin            Admin Dashboard
│      ├── /admin/teams      Team Management
│      ├── /admin/settings   System Settings
│      └── /admin/audit      Audit Log
│
└── /*                       Not Found（404）
```

トップページとルールページは未認証で表示する。設定値は `public_settings` ビューから取得する。
基表 `system_settings` は認証済みにしか公開しない（03_Database.md 10.8）。

## 5.2 ランキングを公開ルートへ配置する理由

ADR-018により、ランキングは未認証でも閲覧できる。したがって `/ranking` は `PublicLayout` 配下に置く。

認証済みユーザーにも同一のルートを使用する。`AppLayout` 側に重複したランキング画面を作らない。

## 5.3 Route Guard

TanStack Router の `beforeLoad` で実装する。

| 種別        | 条件      | 未充足時の動作            |
| --------- | ------- | ------------------ |
| Public    | なし      | －                  |
| Protected | ログイン済み  | `/login` へリダイレクト   |
| Admin     | JWTの `app_metadata.role` が `admin` | 403画面を表示     |

管理者判定は**セッションJWTの `app_metadata.role`** で行う（ADR-020）。

```typescript
const { data: { session } } = await supabase.auth.getSession();
const isAdmin = session?.user.app_metadata.role === "admin";
```

Profile Query には管理者情報を含めない。DBとJWTの二重管理による齟齬を避けるためである。

管理者権限の付与は Supabase 側で行うため、付与直後は反映されない。対象利用者が再ログインするかトークンがリフレッシュされるまで、画面上は一般利用者として扱われる。

画面側のガードは利便性のためのものであり、認可の保証はバックエンドが行う。

---

# 6. レイアウト責務

| Layout       | 責務                                          |
| ------------ | ------------------------------------------- |
| RootLayout   | Provider、Theme、Error Boundary、Suspense、Toast |
| PublicLayout | 未ログイン向けヘッダー、ログイン導線、認証済み時は AppLayout と同一のナビゲーション。トップページ（`/`）とルールページ（`/rules`）を配下に持つ |
| AppLayout    | 共通ヘッダー、ナビゲーション、通知、**Realtime購読の一括管理**       |
| AdminLayout  | 管理画面のナビゲーション                                |

Layout に業務ロジックを実装しない。

ナビゲーション項目の定義は `components/layout/MainNav.tsx` に集約する。PublicLayout と AppLayout はこれを共有し、
セッションの有無による分岐も同コンポーネントが持つ。レイアウトごとに項目を列挙してはならない。
`/ranking` は PublicLayout 配下にあるため（5.2）、項目を二重に持つと認証済み利用者がランキングを開いた時点で
他画面への導線を失う。

---

# 7. 認証フロー

```text
Login 画面
  ↓
外部OAuthプロバイダ（Discord）
  ↓
Supabase Auth がセッションを確立
  ↓
ensure-profile を呼び出す（プロフィール作成・同期）
  ↓
所属チーム・進行中の試合を取得
  ↓
Realtime購読を開始
  ↓
Dashboard へ遷移
```

MVPの認証プロバイダは Discord とする（ADR-022）。

ただし画面はプロバイダ名をハードコードしない。プロバイダ非依存の設計（ADR-015）を維持し、
表示するプロバイダ名は `authProvider` から取得する。

## 7.1 Session

Session は Supabase Auth が保持する。フロントエンドで JWT を保存しない。

---

# 8. 状態管理

| 種類      | 管理方法           | 対象                              |
| ------- | -------------- | ------------------------------- |
| サーバーデータ | TanStack Query | プロフィール、チーム、ランキング、試合、待機状態、システム設定 |
| UI状態    | Zustand        | Dialog、Drawer、Toast、Theme、一時的な画面状態 |

**Zustand にサーバーデータを保持しない。**

`02_BasicDesign.md` の「画面側は状態を保持しない」は**サーバーデータ**に関する方針である。UI状態の保持はこれに反しない。

## 8.1 Query Hook

```text
useProfile()
useMyTeam()
useTeamDetail(teamId)
useRanking()
useMatchList()
useMatchDetail(matchId)
useQueueStatus()
useSystemSettings()
useAuditLogs()      // 管理者のみ
```

## 8.2 Mutation Hook

```text
useCreateTeam()
useCreateInvite()
useAcceptInvite()
useLeaveTeam()
useTransferLeader()
useQueueMatch()
useCancelQueue()
useReportMatch()
useApproveMatch()
useRejectMatch()
useAdminBanTeam()
useAdminUnbanTeam()
useAdminUpdateSettings()
useAdminResetRatings()
```

Mutation 完了後は必要な Query のみ invalidate する。

## 8.3 Query Key

Query Key は Feature ごとに専用モジュールで定義する。文字列を直接記述しない。

```typescript
profileKeys.me()
teamKeys.my()
teamKeys.detail(teamId)
rankingKeys.list()
matchKeys.list(filter)
matchKeys.detail(matchId)
queueKeys.status(teamId)
settingsKeys.current()
```

---

# 9. 楽観ロックの扱い

`report-match`・`approve-match`・`reject-match` は `version` を送信する必要がある（`04_BackendInterface.md`）。

`version` は Match Detail Query（`match_detail_view`）から取得する。

`MATCH-008`（競合）を受信した場合は、Match Detail を再取得して画面を更新し、ユーザーへ操作のやり直しを促す。楽観ロック値を自動で再送してはならない。

---

# 10. Realtime

## 10.1 購読

AppLayout の初期化時に開始し、ログアウト時に解除する。

| Channel   | 購読する画面      |
| --------- | ----------- |
| `ranking` | 全画面（バッジ更新用） |
| `match`   | 全画面         |
| `team`    | 全画面         |
| `system`  | 全画面         |

`/ranking` は未認証でも表示されるため、未認証時は `ranking` チャンネルのみ購読する。

## 10.2 受信時の動作

Realtime イベント受信時は該当 Query を invalidate して再取得する。

```text
MATCH_COMPLETED / MATCH_DRAWN
  ↓
invalidate(matchKeys.list) / invalidate(matchKeys.detail)
  ↓
invalidate(rankingKeys.list)
```

**受信データでキャッシュを直接書き換えてはならない。** 必ず再取得する。

イベント名の正本は `04_BackendInterface.md` 7章である。

---

# 11. キャッシュ方針

| データ    | 方針                             |
| ------ | ------------------------------ |
| ランキング  | キャッシュ可。`RANKING_UPDATED` で再取得   |
| チーム情報  | キャッシュ可。更新後に invalidate         |
| 試合一覧   | キャッシュ可。`match` チャンネル受信で再取得     |
| 試合詳細   | キャッシュ可。状態変更時に invalidate       |
| プロフィール | ログイン中は保持。ログアウト時に破棄             |
| システム設定 | キャッシュ可。`SYSTEM_SETTINGS_UPDATED` で再取得 |

---

# 12. エラー処理

エラーコードの正本は `06_ErrorCode.md` である。

## 12.1 表示方針

| 種別                                | 表示方法       |
| --------------------------------- | ---------- |
| Validation Error（400番台の VALIDATION-*） | フォーム下部     |
| Authorization Error（401 / 403）    | Toast またはリダイレクト |
| Business Error（409）               | Toast      |
| Network Error                     | Alert（再試行導線つき） |
| System Error（500）                 | Error Page |

## 12.2 実装方針

* 画面は `error.code` から表示メッセージを生成する。バックエンドの `error.message` を直接表示しない。
* エラーコードから表示文言への変換は共通モジュール（`utils/errorMessage.ts`）へ集約する。個々の画面で分岐を実装しない。
* 共通 Error Handler を経由してToast等を表示する。

「画面ではError Codeを解釈しない」わけではない。**個々の画面ではなく、共通モジュールで解釈する**という意味である。

## 12.3 Retry

| 種別            | Retry     |
| ------------- | --------- |
| Network Error | 3回まで      |
| Business Error（409） | しない |
| Authorization Error | しない  |
| System Error（500） | しない   |

---

# 13. ページング

ランキングおよび試合一覧は Limit / Offset を利用する。

Infinite Scroll は MVP の対象外とする。

ランキングはレート更新により行の順序が変わるため、Offsetページングでは行の重複・欠落が起こりうる。`RANKING_UPDATED` を受信した場合は先頭ページから再取得する。

---

# 14. UI設計

## 14.1 基本方針

* シンプルで一貫したデザイン
* レスポンシブ対応（モバイルファースト）
* アクセシビリティを考慮する
* ダークモード対応
* コンポーネントの再利用性を重視する

ダークモードはMVPの対象である。Theme は Zustand で管理する。

## 14.2 コンポーネントライブラリ

**shadcn/ui** を標準コンポーネントライブラリとして採用する。

* 必要なコンポーネントのみ追加する。
* 追加したコンポーネントは `components/ui/` でプロジェクト内管理する。
* 共通デザインの変更は追加したコンポーネントを直接修正する。
* Feature 固有のUIは shadcn/ui を組み合わせて実装する。
* Atomic Design は採用しない。

## 14.3 コンポーネント分類

| ディレクトリ                  | 内容                                          |
| ----------------------- | ------------------------------------------- |
| `components/ui/`        | shadcn/ui 由来の汎用部品（Button、Card、Badge、Avatar 等） |
| `components/form/`      | 入力系（React Hook Form 対応）                     |
| `components/feedback/`  | Toast、Alert、ConfirmDialog、EmptyState、Skeleton |
| `components/layout/`    | Header、Sidebar、Container、PageTitle           |
| `components/navigation/` | Breadcrumb、Pagination、Tabs                   |

## 14.4 フォーム

React Hook Form と Zod を組み合わせる。

Zod スキーマは Feature 配下の `schemas/` に置く。

クライアント検証は入力形式（必須・文字数・数値範囲）を対象とし、業務ルール（チーム名重複・人数上限・試合状態）はサーバーが検証する。

## 14.5 空状態

データが存在しない場合は専用UIを表示する。空のテーブルを表示しない。

| 画面     | 空状態                     |
| ------ | ----------------------- |
| My Team | チーム未所属（作成・参加への導線を表示）    |
| 試合一覧   | 試合履歴なし                  |
| ランキング  | ランキングなし                 |
| 待機画面   | 待機していない（マッチング開始ボタンを表示）  |

## 14.6 ダイアログ

`ConfirmDialog` を共通利用する。

| 用途       | 確認内容              |
| -------- | ----------------- |
| チーム作成    | －（フォーム）           |
| 招待コード表示  | －（表示のみ）           |
| 脱退       | 確認                |
| 勝利申告     | 勝者の確認             |
| 承認       | 結果の確認             |
| **拒否**   | 拒否理由の注意喚起と残り回数の表示 |
| BAN      | 確認と理由入力           |
| レートリセット  | 確認（影響範囲の明示）       |

## 14.7 期限の表示

試合詳細画面では以下を表示する。

| 状態                | 表示内容                                     |
| ----------------- | ---------------------------------------- |
| `PLAYING`         | 申告期限（`reportDeadlineAt`）までの残り時間          |
| `WINNER_REPORTED` | 承認期限（`approveDeadlineAt`）までの残り時間、拒否の残り回数 |
| `DRAWN`           | 引き分け（時間切れまたは拒否上限）として解散した旨                |

期限を過ぎた試合は自動的に解決されるため、残り時間の表示は利用者にとって重要である。

## 14.8 アクセシビリティ

* キーボード操作対応
* フォーカス表示
* 適切な `aria-*` 属性
* コントラスト比の確保
* アイコンのみで意味を伝えず、必要に応じてラベルを併記する

---

# 15. 命名規則

| 対象             | 規則               | 例                 |
| -------------- | ---------------- | ----------------- |
| Component      | PascalCase       | `TeamCard`        |
| Hook           | camelCase        | `useMatchDetail`  |
| Backend Client | camelCase        | `teamClient`      |
| 型              | PascalCase       | `TeamDetail`      |
| 定数             | UPPER_SNAKE_CASE | `MAX_TEAM_SIZE`   |

DTO の型名は `04_BackendInterface.md` の定義をそのまま使用する。フロント独自のDTOを作成しない。表示専用の整形が必要な場合は ViewModel Hook 内で行う。

---

# 16. テスト方針

テスト仕様の正本は `10_TestSpecification.md` である。

| 種別             | 対象                             | ツール                            |
| -------------- | ------------------------------ | ------------------------------ |
| Unit Test      | ViewModel Hook、Utility、Zod スキーマ | Vitest                         |
| Component Test | 共通コンポーネント、Feature コンポーネント      | Vitest ＋ React Testing Library |
| E2E Test       | 主要ユーザーフロー                      | Playwright                     |

Backend Client はモック化し、UIロジックを独立して検証する。

---

# 17. AI実装ルール

* ルーターは TanStack Router を使用する。React Router を使用しない。
* Route Guard は `beforeLoad` で実装する。
* Component に API 呼び出しを書かない。
* Page にデータ取得処理・業務ロジックを書かない。
* Query は Feature Hook、表示ロジックは ViewModel Hook へ集約する。
* Supabase SDK は Backend Client（`services/`）のみが利用する。
* Zustand にサーバーデータを保持しない。
* Realtime 受信時は Query を再取得する。キャッシュを直接書き換えない。
* Feature を跨いだ依存を作らない。
* DTO を変更しない。`04_BackendInterface.md` の定義に従う。
* エラーコードから表示文言への変換は共通モジュールへ集約する。
* 更新系操作では `version` を送信する。
