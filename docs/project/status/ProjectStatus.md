# ProjectStatus.md

# Project Status

Version: 1.3
Status: Active

Last Updated: 2026-08-08

---

# 1. 目的

本書は、本プロジェクトの現在の進捗状況および実施中の作業を管理する。

本書は履歴管理を目的とせず、常に最新の状態のみを保持する。

---

# 2. プロジェクト概要

| 項目         | 内容       |
| ---------- | -------- |
| 現在フェーズ     | Implementation |
| 現在のマイルストーン | M5（クラウド公開） |
| 現在のスライス    | S6（完了）／ S4 はクラウド適用待ち |
| 全体進捗       | 85%      |
| 状態         | **S5・S6 完了。** 仕様の Edge Function 19本、全ルートの画面、pgTAP・E2E を実装し、CI が全テスト種別を実行する。デプロイ用ワークフローも新設した。**残るのはクラウドへの適用のみで、これは人手作業である**（`SetupRunbook.md` 作業5〜7） |
| ブロッカー      | なし（クラウド公開には Supabase プロジェクトの作成が必要） |

現在フェーズの候補は Design / Implementation / Test / Release とする。

実装の進行単位はスライス S0 〜 S6 である（ADR-023 / `ImplementationRoadmap.md` 3章）。

---

# 3. スライス進捗

| Slice | 内容                      | 状態            |
| ----- | ----------------------- | ------------- |
| S0    | Supabase Local を起動可能にする | ✅ Completed   |
| S0.5  | テスト基盤の整合                | ✅ Completed   |
| S1    | 認証（Discord）             | ✅ Completed   |
| S2    | チーム作成                   | ✅ Completed   |
| S3    | フロントエンド最小構成             | ✅ Completed   |
| S4    | クラウドへPush・公開            | 🟨 In Progress（CI・deploy.yml は完了。クラウド適用が人手作業として残る） |
| S5    | 残機能の横展開                 | ✅ Completed   |
| S6    | 統合テスト・MVPリリース           | 🟨 In Progress（テストは完了。MVP公開が残る） |

状態

* ⬜ Not Started
* 🟨 In Progress
* 🟦 Review
* ✅ Completed
* ⛔ Blocked

---

# 3.1 実装済み資産

| 対象             | 実態                                                       |
| -------------- | -------------------------------------------------------- |
| Migration      | `0001`〜`0016`（`0015` Cron、`0016` Realtime を追加）。Supabase Local へ適用済みで `supabase db reset` が完走する。**クラウドへは未適用**（ADR-024 の直接修正はS4まで有効） |
| Supabase Local | `config.toml` を作成し起動可能。Discord プロバイダを有効化済み（Client ID / Secret は各自の `.env` で設定する） |
| Edge Functions | `04_BackendInterface.md` 9〜12章の全19本を実装済み（Team 6・Match 5・内部処理4・Admin 4）。既知の欠陥（B-008〜B-010）は解消済み。実 Discord ログインでの縦貫通も確認済み（2026-08-08） |
| `_shared/`     | `auth.ts` / `db.ts` / `response.ts` / `rating.ts` / `invite.ts` / `realtime.ts` / `matchmaking.ts` / `match-completion.ts`（ADR-021準拠）。レート計算・マッチング・試合確定はいずれも共通モジュールに集約し、重複実装していない |
| Frontend       | `05_Frontend.md` 5.1 の全ルートを実装（Public 3・App 8・Admin 4・404）。Realtime購読はレイアウトで一括管理する |
| CI / CD        | `ci.yml` は Lint → Format → Type Check → Supabase起動 → Migration → Unit → Integration → pgTAP → Build → E2E を実行する。`deploy.yml` は手動実行で backend → frontend の順に公開する |
| テスト            | Unit / Frontend 52件（Vitest）、Integration 181ステップ（Deno Test・モック）、Database 49件（pgTAP・実DB）、E2E 10件（Playwright・実DBと実 Edge Functions）。すべて成功する |
| ランタイム          | Bun 1.3.14（フロントエンド・Unit）、Deno 2.9.5（Edge Functions・Integration）。パッケージ管理は Bun へ一本化（ADR-025） |

---

# 4. 現在作業中

* なし。実装作業は S6 まで完了しており、次は人手によるクラウド公開である

---

# 5. 次に実施するタスク

優先順位順に記載する。

**Backlog に未着手の項目は存在しない。** 実装作業も残っていない。残るのは人手による外部サービスの設定と公開である。

1. **人手作業（5〜7）** Supabase クラウドプロジェクトの作成、Vault へのシークレット登録、
   GitHub Pages 有効化と Variables / Secrets の登録。手順は `SetupRunbook.md` が正本である
2. **M5** 上記の完了後に `deploy.yml` を手動実行して公開し、本番で縦貫通を確認する

`SetupRunbook.md` の作業1〜4は 2026-08-08 に完了した。作業5〜7は未着手である。

人手でしか実施できない作業は `docs/project/SetupRunbook.md` に集約した。本書へ手順を書き写さない。

---

# 6. ブロッカー

現在存在するブロッカーを記載する。

なし

R-001（認証プロバイダの実現方式が未確定）は 2026-08-04 に ADR-022 で Discord を採用して解消した。

なお R-011（既存実装と設計書の乖離）はブロッカーではなく、S0 〜 S4 で解消する作業対象として扱う。

---

# 7. 完了済みマイルストーン

| マイルストーン | 状態 |
| ------- | -- |
| M1      | ✅（2026-08-08） |
| M2      | ✅（2026-08-08 / チーム管理機能） |
| M3      | ✅（2026-08-08 / マッチング機能） |
| M4      | ✅（2026-08-08 / ランキング機能） |
| M5      | 🟨 クラウド公開待ち（人手作業） |

---

# 8. AI向けサマリー

AIが最初に確認する情報をまとめる。

記載内容

* 現在のフェーズ
* 現在作業中
* ブロッカー
* 次の優先タスク
* 参照すべき設計書

---

# 9. 更新ルール

本書は現在の状態のみを管理する。

過去の履歴は保持しない。

履歴管理は以下の文書で行う。

* DecisionLog
* Changelog
* Git履歴

---

# 10. AI運用

AIは作業開始前に本書を確認し、

* 現在フェーズ
* ブロッカー
* 現在作業中

を把握してからAIContextに従って作業を開始する。
