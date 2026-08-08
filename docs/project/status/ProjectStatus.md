# ProjectStatus.md

# Project Status

Version: 1.2
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
| 現在のマイルストーン | M2 / M3（S5） |
| 現在のスライス    | S5（残機能の横展開） |
| 全体進捗       | 45%      |
| 状態         | **M1 完了。** `SetupRunbook.md` 作業1〜4を実施し、実 Discord ログインによる縦貫通と GitHub Actions の CI 成功を実証した。S1〜S3 を完了とし、S5 に着手する |
| ブロッカー      | なし      |

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
| S4    | クラウドへPush・公開            | 🟨 In Progress（CI のみ） |
| S5    | 残機能の横展開                 | 🟨 In Progress |
| S6    | 統合テスト・MVPリリース           | ⬜ Not Started |

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
| Migration      | `0001`〜`0014`。Supabase Local へ適用済みで `supabase db reset` が完走する。**クラウドへは未適用**（ADR-024 の直接修正はS4まで有効） |
| Supabase Local | `config.toml` を作成し起動可能。Discord プロバイダを有効化済み（Client ID / Secret は各自の `.env` で設定する） |
| Edge Functions | 仕様20本のうち `ensure-profile` / `create-team` の2本。既知の欠陥（B-008〜B-010）は解消済み。Supabase Local に対する実地検証済み（2026-08-08、実 Discord ログインで `auth_provider=discord` / `provider_user_id` が Discord ユーザーIDであることを確認） |
| `_shared/`     | `auth.ts` / `db.ts` / `response.ts` / `rating.ts` を配置済み（ADR-021準拠）。JWT検証は `supabase-js` の `auth.getUser` による。`rating.ts` は Elo 計算の純粋関数（ADR-016 / 08_RatingSpecification.md 10章）で、`approve-match` / `auto-resolve-matches` の共通実装となる |
| Frontend       | `src/` を新設。画面は `/login`・`/ranking`・`/dashboard` の3枚。`bun run dev` で起動し `bun run build` が通る |
| CI             | `.github/workflows/ci.yml` を新設。Lint → Format → Type Check → Unit → Integration → Build を実行する。pgTAP / E2E は予約（11_Deployment.md 11.3.2） |
| テスト            | Unit / Frontend 4ファイル28件（Vitest、うち Rating 18件＝TC-RATING-001〜018）、Integration 5ファイル26件（Deno Test）。`bun run test` で双方が成功する。**Rating を除きモック検証であり、DBには接続していない** |
| ランタイム          | Bun 1.3.14（フロントエンド・Unit）、Deno 2.9.5（Edge Functions・Integration）。パッケージ管理は Bun へ一本化（ADR-025） |

---

# 4. 現在作業中

* S5 残機能の横展開。着手順は `ImplementationRoadmap.md` 4章 S5 に従い、Rating（純粋関数・単体テスト）から始める

---

# 5. 次に実施するタスク

優先順位順に記載する。

**Backlog に未着手の項目は存在しない。** 残るのは実地検証と、まだ着手していない機能である。

1. **S5** 残機能の横展開（レート計算・招待・脱退・移譲・マッチング・試合・自動処理・Realtime・Admin・画面拡張）。
   pgTAP を追加し CI の該当ステップを有効化する
2. **S4 / M5** クラウドへの公開。手順は `SetupRunbook.md` の作業5〜7。デプロイ用ワークフローの新設が別途必要である

`SetupRunbook.md` の作業1〜4（Discord クレデンシャル取得から CI の実行確認まで）は 2026-08-08 に完了した。

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
| M2      | ⬜  |
| M3      | ⬜  |

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
