# ProjectStatus.md

# Project Status

Version: 1.1
Status: Active

Last Updated: 2026-08-04

---

# 1. 目的

本書は、本プロジェクトの現在の進捗状況および実施中の作業を管理する。

本書は履歴管理を目的とせず、常に最新の状態のみを保持する。

---

# 2. プロジェクト概要

| 項目         | 内容       |
| ---------- | -------- |
| 現在フェーズ     | Implementation |
| 現在のマイルストーン | M1       |
| 現在のスライス    | S0.5     |
| 全体進捗       | 15%      |
| 状態         | S0 完了。Supabase Local で全Migrationが適用でき、公開範囲の検証も通っている |
| ブロッカー      | なし（R-001 は ADR-022 により解消） |

現在フェーズの候補は Design / Implementation / Test / Release とする。

実装の進行単位はスライス S0 〜 S6 である（ADR-023 / `ImplementationRoadmap.md` 3章）。

---

# 3. スライス進捗

| Slice | 内容                      | 状態            |
| ----- | ----------------------- | ------------- |
| S0    | Supabase Local を起動可能にする | ✅ Completed   |
| S0.5  | テスト基盤の整合                | ⬜ Not Started |
| S1    | 認証（Discord）             | ⬜ Not Started |
| S2    | チーム作成                   | ⬜ Not Started |
| S3    | フロントエンド最小構成             | ⬜ Not Started |
| S4    | クラウドへPush・公開            | ⬜ Not Started |
| S5    | 残機能の横展開                 | ⬜ Not Started |
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
| Edge Functions | 仕様20本のうち `ensure-profile` / `create-team` の2本。共通JWT検証の不具合により現状はいずれも 401 を返す（B-008） |
| `_shared/`     | `auth.ts` / `db.ts` / `response.ts` を配置済み（ADR-021準拠）      |
| Frontend       | **未着手。`src/` が存在しない**                                    |
| CI             | **未着手。`.github/` が存在しない**                                |
| テスト            | 6ファイル。すべて Deno Test 形式だが `npm test` は Vitest を起動する（B-007） |

---

# 4. 現在作業中

* S0.5 テスト基盤の整合（B-007）

---

# 5. 次に実施するタスク

優先順位順に記載する。

1. **S0.5** テスト実行基盤の整合（B-007）。Deno の導入と `tests/` の再配置
2. **S1** Discord 認証の実装。JWT検証の修正（B-008、B-009）
3. **S2** `create-team` の監査ログ列の修正（B-010）と DB直結トランザクションの実地検証（R-002 / ADR-016）
4. **S3** フロントエンド最小構成の新設（B-011）
5. **S4** クラウドへの Push と公開経路の確立

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
| M1      | ⬜  |
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
