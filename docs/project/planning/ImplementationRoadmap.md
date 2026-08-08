# ImplementationRoadmap.md

# Implementation Roadmap

Version: 2.0
Status: Active
Last Updated: 2026-08-04
準拠ADR: ADR-016, ADR-018, ADR-020, ADR-021, ADR-022, ADR-023, ADR-024

---

# 1. 目的

本書は、本プロジェクトの実装計画を定義する。

設計書をもとに、実装順序・依存関係・完了条件を管理する。

---

# 2. 基本方針

実装は以下の原則に従う。

* 設計書が完成したものから実装する。
* 機能を**縦に貫通する薄いスライス**の連続として実装する（ADR-023）。
* クラウドの Supabase へ push する前に、Supabase Local（Docker）で完走を確認する（ADR-023）。
* 各スライスでテストを完了させる。
* スライス完了後にレビューを実施する。

Version 1.0 の Phase 1〜7（層ごとの横切り）は本改訂でスライス S0〜S6 へ置き換えた。
置き換えの理由は ADR-023 に記録する。5章の実装順序原則は変更していない。

---

# 3. 実装スライス

| Slice | 内容                       | 状態          |
| ----- | ------------------------ | ----------- |
| S0    | Supabase Local を起動可能にする  | ✅ Completed |
| S0.5  | テスト基盤の整合                 | ✅ Completed |
| S1    | 認証（Discord）              | ✅ Completed |
| S2    | チーム作成                    | ✅ Completed |
| S3    | フロントエンド最小構成              | ✅ Completed |
| S4    | クラウドへPush・公開             | 🟨 In Progress（CI・deploy.yml は完了。クラウド適用が人手作業） |
| S5    | 残機能の横展開                  | ✅ Completed |
| S6    | 統合テスト・MVPリリース            | 🟨 In Progress（テストは完了。MVP公開が残る） |

S0 〜 S3 が「ログイン → プロフィール生成 → チーム作成 → ランキング表示」を貫通する最初のスライスである。

**状態の正本は `ProjectStatus.md` である。**本表は概観であり、詳細はそちらを参照する。

S1 〜 S3 は 2026-08-08 に Supabase Local ＋ 実 Discord ログインによる縦貫通確認
（`SetupRunbook.md` 作業1〜3）を実施し、完了条件を満たしたため Completed とした。

S4 は CI（`.github/workflows/ci.yml`）を先行して実施し、S6 で公開用の `deploy.yml` を新設した。
**クラウドへの push と GitHub Pages 公開は人手作業であり**（`SetupRunbook.md` 作業5〜7）、
Supabase プロジェクトの作成と資格情報の登録が済むまで実行できない。

---

# 4. スライス詳細

## S0 Supabase Local を起動可能にする

**すべての前提となるスライスである。** 現時点で `supabase/config.toml` が存在せず、
Migration は `supabase db push` の途中で必ず停止するため、他のどの作業も開始できない。

対象

* `supabase init`（`config.toml` 生成、`[auth.external.discord]` 有効化、リダイレクトURL設定）
* Migration の欠陥修正（B-001 〜 B-006、B-013 / 未適用のため直接修正する・ADR-024）
* `supabase start` によるローカル環境の起動

参照

* 03_Database.md
* 11_Deployment.md（3章・5章）
* Backlog.md（B-001 〜 B-006、B-013）

完了条件

* `supabase db reset` がエラーなく完走する。
* 9テーブル・4Viewが作成され、`system_settings` に初期行が1件存在する。
* `team_ranking_view` を anon キーで参照できる（ADR-018）。
* `team_detail_view` を未認証で参照できない。

### 実施結果（2026-08-04 完了）

`supabase db reset` が全14 Migration を適用して完走することを確認した。
公開範囲は `03_Database.md` 15章のとおりであることを PostgREST 経由で検証した。

| 検証                        | 結果                          |
| ------------------------- | --------------------------- |
| 未認証 → `teams`、`team_ranking_view` | 200                         |
| 未認証 → その他のテーブル・View       | 401                         |
| 認証済み → 全テーブル・View         | 200（`audit_logs` はRLSにより0件） |
| 未認証・認証済み → `teams` へのPOST | 401 / 403                   |
| `team_members` の UPDATE    | 成功（B-003 の回帰確認）             |

S0 の実施中に B-013（クライアントロールへのGRANT欠落）を新たに発見し、併せて解消した。
Supabase の既定ではテーブルへ SELECT が付与されないため、RLSポリシーだけでは参照できない。

---

## S0.5 テスト基盤の整合

S0 と並行して実施してよい。

対象

* Deno の導入
* `tests/` の再配置（`tests/unit/` = Vitest、`tests/integration/` = Deno Test）
* `package.json` のテストスクリプト分離

参照

* 00_DirectoryStructure.md
* 10_TestSpecification.md
* Backlog.md（B-007）

完了条件

* `npm test` が Unit / Integration の双方を実行し、成功する。

---

## S1 認証（Discord）

認証プロバイダは ADR-022 により Discord で確定した。**PoC は実施しない。**
本スライスは通常実装として扱う。

対象

* Discord アプリ登録と `config.toml` への設定（Secret は環境変数経由・直書き禁止）
* `_shared/auth.ts` のJWT検証の実装（B-008）
* `ensure-profile` の `provider_user_id` / `auth_provider` 取得の修正（B-009）

参照

* 04_BackendInterface.md（4章）
* 15_DecisionLog.md（ADR-015、ADR-022）
* Backlog.md（B-008、B-009）

完了条件

* ローカルで Discord ログインが成功し、セッションが確立する。
* `ensure-profile` により `profiles` へ行が作成される。
* 再ログインしてもプロフィールが重複しない。
* 認証済みリクエストが 401 にならない。

---

## S2 チーム作成

対象

* `create-team` の `audit_logs` INSERT 修正（B-010）
* トランザクション基盤（DB直結）の実地確認（ADR-016 / R-002）

参照

* 04_BackendInterface.md（9.2）
* 07_APISequence.md
* Backlog.md（B-010）

完了条件

* `create-team` が `teams` / `team_members`（LEADER）/ `audit_logs` を単一トランザクションで更新する。
* 既にチームへ所属している場合に `TEAM-003` を返す。
* 異常時に ROLLBACK され、部分更新が残らない。

---

## S3 フロントエンド最小構成

対象

* Bun の導入（B-011）
* Vite / React / TanStack Router / TanStack Query / Tailwind / shadcn/ui の初期化
* `src/` の新設（構成は 05_Frontend.md 4章および 00_DirectoryStructure.md に厳密準拠）
* 画面は3枚に限定する。`/login`、`/ranking`（未認証可）、`/dashboard`（チーム作成ダイアログを含む）
* `utils/errorMessage.ts`（エラーコード → 表示文言の変換を1箇所へ集約）

参照

* 05_Frontend.md
* 00_DirectoryStructure.md
* 12_TechnologyStack.md
* Backlog.md（B-011）

完了条件

* 開発サーバーで `/ranking` が未ログインのまま表示される。
* Discord ログイン → `ensure-profile` 実行 → `/dashboard` へ遷移する。
* 画面からチーム作成を行い、ランキングへ反映される。

本スライスの完了をもって、DB・Edge Function・フロントエンドの縦貫通が成立する。

---

## S4 クラウドへPush・公開

対象

* Supabase クラウドプロジェクトの作成（Staging / Production を分離する）
* `supabase link` → `supabase db push`
* Discord OAuth のリダイレクトURL登録
* `supabase secrets set`（`SUPABASE_DB_URL` は Connection Pooler の Transaction mode・prepared statement 無効）
* `supabase functions deploy`
* GitHub Actions の新設（`.github/` は未作成）
* ビルド後の `404.html` 生成（R-005）
* `.env.example` の追加（B-012）

参照

* 11_Deployment.md（**9章のリリース順序を厳守する：Migration → Edge Functions → フロントエンド**）
* Backlog.md（B-012）

完了条件

* CI が成功する。
* GitHub Pages で `/ranking` へ直リンクしても 404 にならない。
* 本スライスの `supabase db push` 完了をもって Migration `0001`〜`0014` を確定し、以後は追加方式へ戻る（ADR-024）。

---

## S5 残機能の横展開

S0 〜 S4 で基盤の欠陥が出尽くした後、5章の順序に従い残りの Edge Function を実装する。

対象

1. Rating（純粋関数・単体テスト）— `approve-match` が依存するため最優先
2. Team / Invite（`create-team-invite` / `accept-team-invite` / `leave-team` / `transfer-leader`）
3. Queue / Matchmaking（`queue-match` / `cancel-match-queue` / `matchmaker`）
4. Match（`report-match` / `approve-match` / `reject-match`）
5. 自動処理（`auto-resolve-matches` / `cleanup-expired-invites` / `cleanup-matching-queue`）と Cron 設定
6. Realtime（Migration に Realtime 設定が未定義であるため併せて整備する）
7. Admin / 監査ログ
8. 画面を 05_Frontend.md 5.1 の全ルートへ拡張

参照

* 04_BackendInterface.md
* 07_APISequence.md
* 08_RatingSpecification.md
* 09_MatchmakingSpecification.md

完了条件

* API仕様を満たす。
* 自動解決バッチが定期実行される（R-004）。

---

## S6 統合テスト・MVPリリース

対象

* Unit Test / Integration Test / Database Test（pgTAP）/ E2E Test（Playwright）
* CI への全テスト種別の組み込み（11_Deployment.md 11.1）
* MVP公開

完了条件

* 全テスト成功
* MVP公開

---

# 5. 実装順序

実装は以下の順序を推奨する。本節は ADR-023 による改訂後も変更しない。

1. Database（スキーマ・RLS・View・Seed）
2. トランザクション基盤（DB直結・共通処理）
3. Rating（純粋関数・単体テスト）
4. Authentication（Discord・ADR-022）
5. Team / Invite
6. Queue / Matchmaking
7. Match（申告・承認・拒否）
8. 自動解決（Cron）
9. Ranking
10. Admin / 監査ログ
11. Frontend
12. Test（結合・E2E）
13. Release

Rating をMatchより先に実装するのは、`approve-match` がレート計算に依存するためである。

トランザクション基盤を先に整えるのは、すべての更新系Functionがこれを前提とするためである。

スライス方式では上記の順序を機能単位で部分適用する。S3 でフロントエンドへ着手するのは本順序への例外ではなく、
S3 が扱う機能（認証・チーム作成・ランキング）について 1〜4 および 9 が S0 〜 S2 で完了しているためである。

---

# 6. スライス完了条件

各スライスは以下を満たした場合に完了とする。

* 設計書との整合性確認
* Unit Test成功
* Integration Test成功（対象がある場合）
* レビュー完了
* ドキュメント更新完了

Project Constitution 第18条の品質ゲートは、スライス方式においても緩和しない。

---

# 7. ブロッカー管理

ブロッカーが発生した場合は、以下を記録する。

* 発生日
* 内容
* 影響範囲
* 対応方針
* 解決日

既知の実装欠陥は Backlog.md（B-001 〜 B-012）で管理する。

---

# 8. AI利用

AIへ実装を依頼する場合は、

* AIContext
* Development Guide
* AIImplementationRule

を併用すること。

---

# 9. 更新ルール

Roadmapは実装状況に応じて更新する。

設計変更のみでは更新しない。

---

# 10. AI実装ルール

AIはRoadmapを参照し、現在のスライスを逸脱した実装を行ってはならない。

未着手スライスの実装を提案する場合は、提案として区別して提示する。

S0 が未完了の状態で S1 以降の実装へ着手してはならない。Migration が適用できないため、動作を検証できないためである。
