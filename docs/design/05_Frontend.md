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
│      ├── /team/:teamId     Team Detail  （メンバー一覧。ランキング・試合の各画面から辿る）
│      ├── /seasons          Season Archive（過去のシーズン別ランキング。未認証可）
│      ├── /admin/season      Admin Season  （シーズンの終了・持ち出し・削除）
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
│      ├── /admin/audit      Audit Log
│      ├── /admin/matches    Prepared Matches（対戦カードの作成 / ADR-039）
│      ├── /admin/reports    Abuse Reports（通報の未処理一覧と累積 / ADR-033）
│      └── /admin/integrity  Integrity Signals（対戦の偏り / ADR-036 ④）
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
useEndSeason()
useCancelSeasonEnd()
usePurgeSeasonData()
useResumeSeason()
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

`report-match`・`approve-match`・`concede-match`・`extend-match-deadline`・
`request-no-contest`・`respond-no-contest` は `version` を送信する必要がある（`04_BackendInterface.md`）。

**通報（14.9）は `version` を送らない。** 試合を更新しないためである。

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

| 用途          | 確認内容                                   |
| ----------- | -------------------------------------- |
| チーム作成       | －（フォーム）                                |
| 招待コード表示     | －（表示のみ）                                |
| 脱退          | 確認                                     |
| **投了**      | **相手チーム名を明示した二段階確認（省略不可）**             |
| 勝利申告        | 勝者の確認                                  |
| 承認          | 結果の確認                                  |
| 反対申告        | 自チームの勝利を主張することと、記録・公開される旨の確認           |
| 不成立の申請      | 理由区分の選択と、相手の応答で結末が変わる旨の説明              |
| 報告期限の延長     | 残り延長回数の表示                              |
| 通報          | －（フォーム。14.9）                           |
| BAN         | 確認と理由入力                                |
| 試合の無効化（管理者） | 確認と理由入力。一括版は対象件数と `PLAYING` のみである旨を明示   |
| シーズンの終了     | 確認（影響範囲の明示）                            |

### 投了の二段階確認（ADR-032 ① / 必須）

**投了は押下で即座に確定させてはならない。** 相手チーム名を明示した確認ダイアログを挟む。

```text
［投了する］を押す
   ↓
「〇〇（相手チーム名）の勝利として確定します。
  確定後は取り消せません。」
   ↓
［確定する］／［やめる］
```

**「次回から表示しない」を設けてはならない。** 投了は基本の導線であり（ADR-032 ①）、慣れるほど誤押下の
機会が増える。**確定した結果は訂正できず**（ADR-033 ①）、押し間違いに対する防御はこの確認だけである。

勝者申告の押し間違えは反対申告で解決できるが、**投了の押し間違えは解決できない。** 両者の確認の重さを
同じにしてはならない。

### 投了と承認の出し分け

`WINNER_REPORTED` では投了と承認は同じ結果になる（`04_BackendInterface.md` 21.1）。**両方を並べない。**

| 状態                              | 表示するボタン           |
| ------------------------------- | ----------------- |
| `PLAYING`                       | 投了する／勝利を申告する      |
| `WINNER_REPORTED`（自チームが申告した側）   | 取り消せない旨の表示のみ      |
| `WINNER_REPORTED`（相手が申告した側）     | 承認する／自チームの勝利を申告する |
| 反対申告により競合中                      | 投了する（＝相手の主張を認める）  |

## 14.7 期限の表示

試合詳細画面では以下を表示する。

| 状態                | 表示内容                                                     |
| ----------------- | -------------------------------------------------------- |
| `PLAYING`         | 申告期限（`reportDeadlineAt`）までの残り時間、残り延長回数                   |
| `PLAYING`（申請の保留中） | 応答期限までの残り時間、申請者、理由区分                                     |
| `WINNER_REPORTED` | 承認期限（`approveDeadlineAt`）までの残り時間                         |
| `WINNER_REPORTED`（競合中） | **自動承認されない旨**と、投了でのみ決着する旨                            |
| `COMPLETED`       | 確定の経路（投了／承認／**自動承認**）                                    |
| `DRAWN`           | `no_contest_reason` に応じた説明（下表）                           |

期限を過ぎた試合は自動的に解決されるため、残り時間の表示は利用者にとって重要である。

### DRAWN の表示（ADR-034 ①）

**`DRAWN` を一律に「引き分け」と表示してはならない。** 帰結が異なる。

| `no_contest_reason` | 表示                                            |
| ------------------- | --------------------------------------------- |
| `REPORT_TIMEOUT`    | 期限までに申告がなかったため解散しました。両チームがしばらく待機できません          |
| `NO_SHOW`           | 相手の応答がなかったため解散しました（申請側）／応答しなかったためしばらく待機できません（相手側） |
| `CONFLICT`          | 双方が勝利を主張したまま期限を過ぎたため解散しました。レートは変わっていません       |
| `MUTUAL`            | 対戦不成立として合意しました。**記録に影響せず、すぐ次の試合へ進めます**         |
| `ADMIN_VOID`        | 運営により無効となりました。**不利益はありません**                    |
| `SEASON_END`        | シーズンの終了により打ち切られました。**不利益はありません**               |

**★`SEASON_END` と `ADMIN_VOID` を同じ文言にしてはならない**（ADR-038 ①）。
管理者が個別に無効化したのではなく、シーズンの終了に伴って打ち切られた試合である。
何が起きたのかを言い分ける。

### 自動承認の明示

`auto_approved = true` の試合は、試合一覧と試合詳細で**自動承認であることを明示する**。
敗者が結果を確認する機会を持てなかったケースであり、当事者が後から気付けるようにする必要がある。

### クールダウンの表示

クールダウン中は Matchmaking 画面で残り時間と理由を示す（`QUEUE-006`）。

**「ペナルティ」という語を使わない。** 誤魔化す経路を通ると次の試合が遅くなる、という事実を淡々と示す。
正直な確定（投了・承認）にはクールダウンが無いことを併記し、**最短の道がどれかを毎回伝える。**

## 14.8 アクセシビリティ

* キーボード操作対応
* フォーカス表示
* 適切な `aria-*` 属性
* コントラスト比の確保
* アイコンのみで意味を伝えず、必要に応じてラベルを併記する

## 14.9 通報フォーム（ADR-033）

`/admin/reports` は管理者用である。**通報の入力は試合詳細とチーム詳細から開く。**

| 入力項目   | UI                | 必須 | 備考                       |
| ------ | ----------------- | -- | ------------------------ |
| 対象チーム  | 開いた文脈から自動設定（変更不可） | ✓  | 自チームは選べない                |
| 理由区分   | ラジオ（5種）           | ✓  | 虚偽申告／無応答／迷惑行為／ゲーム内不正／その他 |
| 自由記述   | テキストエリア           | ✓  | 10〜1000文字。**残り文字数を常に表示** |
| 関連する試合 | 開いた文脈から自動設定       |    | チーム詳細から開いた場合はNULL        |
| 証拠URL  | テキスト入力 ×3         |    | `https://` のみ。空欄可        |

**★証拠URLを必須にしない。** 録画やスクリーンショットを残していない利用者が通報できなくなり、
累積による判断（ADR-033 ④）の材料も集まらない。フォームには「**証拠が無くても通報できます**」と明記する。

**★送信後の表示に注意する。** 「調査します」「対応します」と書かない。単発の通報では措置しないためである
（ADR-033 ④）。「受け付けました。内容は運営が確認します」に留める。

**★通報の一覧を一般利用者へ見せない。** 自分が出した通報のみ、状態とともに参照できる。
取り下げ（`withdraw-abuse-report`）はここから行う。

**★通報された側へ通知しない。** 通報の存在は本人にも他人にも見えない（`03_Database.md` 10.10）。

### 証拠URLの扱い

**自動リンクしない。** 文字列として表示し、明示の操作（「開く」ボタン）で新規タブへ遷移させる。
`rel="noopener noreferrer"` を付ける。許可ドメインで絞らないため、任意の外部URLが入りうる。

## 14.10 マッチング画面の停止案内（`/matchmaking`）

**押してからエラーにしない。** 停止していることと、その理由をボタンの前に見せる。

| 停止の種類                        | 判定                       | 待つ相手      |
| ---------------------------- | ------------------------ | --------- |
| シーズンの切り替え（`SEASON-002`）      | `matchmaking_paused`     | 運営の作業     |
| 保守による停止（`QUEUE-007`）         | `maintenance_paused`     | ゲーム側の復旧   |

**★両方を見る**（ADR-038 ③）。シーズンの停止だけを見ていると、保守停止の間は案内が出ないまま
ボタンが押せてしまい、`QUEUE-007` で弾かれる。上の原則に反する。実際にその状態だった。

**★文言を共通化しない。** どちらも「一時停止」だが、待つ相手が違う。両方立っている場合は
**保守を先に伝える。** 復旧しない限り、シーズンを再開しても対戦できないためである。

### 進行中の試合は複数持ちうる（ADR-039 ⑧）

管理者が用意した試合は待機列を経由しないため、1チームへ同時に割り当てられる（ADR-035 ⑤）。
**進行中の試合を単数として扱ってはならない。** 先頭の1件だけを案内すると、残りが画面から消える。

**★1件でも一覧として出す。** 件数で表示の形を変えると、2件目が現れたときに画面の意味が変わる。
自動マッチングだけを使う運用では常に0件か1件であり、見た目は実質変わらない。

## 14.11 管理画面：対戦カードの作成（`/admin/matches`）

管理者が2チームを指定して試合を用意する（ADR-035 ⑤ / ADR-039）。大会・イベント運用である。

| 要素        | 内容                                          |
| --------- | ------------------------------------------- |
| 候補の表示     | チーム名・レート・**人数**。BANとメンバー0人は選択肢から除く          |
| 不揃いの警告    | 人数が異なる組み合わせを選んだとき。**止めない。知らせる**             |
| 確認        | 作成前に一段階。相手チーム名と「取り消せない」旨を示す                 |

**★人数を必ず出す**（ADR-039 ④）。必須人数を要求しない以上、不揃いに気付ける手がかりは
画面にしか無い。

**★確認を省略可能にしてはならない。** 用意した試合は相手チームを報告期限まで拘束する。
「次回から表示しない」に相当する要素を設けない（ADR-032 ① と同じ考え）。

**★「作成した試合を消す」導線を置かない。** 誤って用意した試合は、当事者の不成立の申請か、
`admin-void-matches`（ADR-034 ④）で終わらせる。既存の手段で足りるものに新しい経路を作らない。

## 14.12 管理画面：シーズン（`/admin/season`）

**★「マッチング」の状態は2つの列の論理和で表示する**（ADR-038 ③）。
`matchmaking_paused` だけを見て「受付中」と表示してはならない。保守停止はシーズンを
再開しても解除されず（ADR-034 ⑤）、片方だけを見ると、再開したのにマッチングが動かない状態を
「受付中」と表示することになる。停止中はどちらが原因かも併記する。

**★「通常営業に戻す」の前に、保守停止が残っていることを伝える。** 押した後に「動かない」と
気付く形にしてはならない。障害が続いているなら意図どおりであり、復旧済みなら
システム設定から解除する必要がある、という判断材料を先に出す。

## 14.13 管理画面：システム設定（`/admin/settings`）

数値・文字列・真偽値で入力の性質が異なるため、フォームを3つに分ける。

| 区画            | 対象                                  | 形式                |
| ------------- | ----------------------------------- | ----------------- |
| 現在値の一覧        | `SystemSettingsTable`               | 参照専用              |
| 保守による一時停止     | `maintenance_paused`（ADR-034 ⑤）     | **専用のトグル**        |
| 表示設定・お知らせ     | `PresentationSettingsForm`（Issue #7・#8） | 文字列と選択肢           |
| その他の設定        | 数値項目                                | 入力のあった項目のみ送信      |

数値項目は意味のまとまり（チームとレート／勝敗報告の期限／対戦の不成立／サブアカウント対策／シーズン）で
区切る。**一列に並べない。** 20項目近くを平坦に並べると、どれが何に効くのか読めない。

**★廃止した設定（`max_reject_count` / ADR-032 ③）を並べてはならない**（ADR-037 ③）。
入力欄にも一覧表示にも出さない。効かない設定を運営が調整できる状態は、設定が足りないのと同じくらい悪い。

**★シーズンの状態（`matchmaking_paused` / `updates_locked` / `current_season`）を本画面へ出さない**
（ADR-037 ②）。本画面は「運営が調整する設定」の一覧であり、進行中の状態はシーズン画面が示す。

**★`0` が無効を意味する設定は、一覧で「無効」と表示する**（ADR-037 ④）。
`rematch_cooldown_hours` と `ranking_min_opponents` が該当する。数値のまま出すと
「0時間だけ抑止する」と読めてしまう。

**★保守の一時停止は、それが障害時手順の手順1であることを画面に明記する**（ADR-034 ⑥ / ADR-037 ⑤）。
先に停止を立ててから試合を無効化する。逆順にすると、無効化した直後に新しい試合が成立する。

## 14.14 管理画面：通報（`/admin/reports`）

| 表示       | 内容                                             |
| -------- | ---------------------------------------------- |
| 未処理一覧    | `status = 'OPEN'` を古い順。理由区分・対象・通報元・関連試合        |
| チームごとの累積 | **通報元チーム数 `m` を先に、通報件数 `n` を後に表示する**           |
| 措置       | `NO_ACTION` / `WARNED` / `COOLDOWN` / `BANNED` |

**★`m` を先に置く。** `n` は1チームから何度でも増やせるため単独では信号にならない。
並び順が判断を誘導する。1件の告発は雑音であり、異なるチームからの一致した告発が信号である（ADR-033 ④）。

**★「結果を訂正する」導線を置かない。** 確定した試合は覆らない（ADR-033 ①）。
存在しない操作を画面に示唆してはならない。

## 14.15 管理画面：対戦の偏り（`/admin/integrity`）

| 表示            | 内容                                                       |
| ------------- | -------------------------------------------------------- |
| 繰り返し当たっている組み合わせ | 対戦数・戦績・一方向性・投了数・平均決着時間・**同時在席の有無**・最終対戦日時               |
| 稼ぎ先が偏っているチーム   | 試合数・異なる対戦相手数・獲得レート・最大の稼ぎ先・**集中の割合**                     |

**★措置の導線を置かない**（ADR-036 ④）。BAN とクールダウンは `/admin/reports` と
`/admin/teams` から行う。ここに措置ボタンを置くと、機械の疑いがそのまま処分に化ける。

**★「疑いであって証拠ではない」旨を画面に明記する。** 仲の良い常連どうしも同じ形になり、
片方が新参で他の対戦を持たない場合も「同時在席なし」になる。この但し書きを消してはならない。

**★指標の意味を画面で説明する。** 「一方向性 100%」「同時在席なし」が何を意味するかを
表の外に添える。数値だけを並べると、読み手が独自の基準で断定する。

チーム名は解決せず、チームIDの先頭8桁で示す。名前の解決には `team_detail_view` が要り、
本画面の目的（偏りの発見）には過剰である。

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
