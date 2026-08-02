# Milestones.md

# Project Milestones

Version: 1.0
Status: Active

---

# 1. 目的

本書は、本プロジェクトの開発目標（マイルストーン）を管理する。

各マイルストーンは、達成すべき成果物、対象タスク、および完了条件を定義する。

---

# 2. 運用方針

* Backlogから実施対象を選定し、Milestoneを作成する。
* Milestoneごとに達成目標を定義する。
* 完了したMilestoneは履歴として保持する。
* 実装順序はImplementation Roadmapで管理する。

---

# 3. ステータス

| 状態        | 説明  |
| --------- | --- |
| Planned   | 計画中 |
| Active    | 実施中 |
| Completed | 完了  |
| Cancelled | 中止  |

---

# 4. マイルストーン一覧

| ID | 名称      | 状態      | 目標日 | 達成率 |
| -- | ------- | ------- | --- | --- |
| M1 | 開発基盤構築  | Planned |     | 0%  |
| M2 | チーム管理機能 | Planned |     | 0%  |
| M3 | マッチング機能 | Planned |     | 0%  |
| M4 | ランキング機能 | Planned |     | 0%  |
| M5 | MVPリリース | Planned |     | 0%  |

---

# 5. マイルストーン詳細

## M1 開発基盤構築

### 目的

開発を継続できる基盤を整備する。

### 対象

* Bun環境
* React / Vite / TanStack Router
* Supabase（Local含む）
* GitHub Actions
* Vitest / Deno Test / pgTAP / Playwright
* 認証プロバイダのPoC（ADR-015）

### 関連設計書

* 12_TechnologyStack.md
* 11_Deployment.md

### 完了条件

* 開発環境が構築されている。
* CIが正常に動作する。
* テスト基盤が利用可能である。

---

## M2 チーム管理機能

### 目的

チーム管理機能を提供する。

### 対象

* Team
* Team Members
* Team Invite

### 関連設計書

* 03_Database.md
* 04_BackendInterface.md
* 05_Frontend.md

### 完了条件

* チーム作成・招待発行・招待参加・脱退・リーダー移譲が利用可能である。
* 関連テストが成功する。

チーム名変更・チーム削除はMVP対象外である（`13_FutureFeatures.md`）。

---

## M3 マッチング機能

### 目的

対戦待機から試合成立までを実装する。

### 対象

* Matching Queue
* Match（申告・承認・拒否）
* 自動解決（タイムアウト）

### 関連設計書

* 04_BackendInterface.md
* 07_APISequence.md
* 09_MatchmakingSpecification.md

### 完了条件

* マッチングが成立し、試合が `PLAYING` で作成される。
* 勝利申告・承認・拒否が利用可能である。
* 期限切れの試合が自動的に解決される。

---

## M4 ランキング機能

### 目的

レート計算およびランキングを提供する。

### 対象

* Rating
* Ranking
* Rating History

### 関連設計書

* 08_RatingSpecification.md
* 03_Database.md

### 完了条件

* レート更新が正しく行われる。
* ランキングが表示される。

---

## M5 MVPリリース

### 目的

MVPを一般公開する。

### 対象

* 本番環境
* デプロイ
* リリースノート

### 関連設計書

* 11_Deployment.md

### 完了条件

* 本番環境で利用可能である。
* Changelogが更新されている。

---

# 6. Backlogとの関係

* Backlogは実施候補を管理する。
* Milestoneは実施対象を管理する。
* Backlogから選定されたタスクのみをMilestoneへ登録する。

---

# 7. Roadmapとの関係

Implementation Roadmapは、Milestone内のタスク実行順序を管理する。

---

# 8. 更新ルール

マイルストーンは以下の場合に更新する。

* 新しい目標を設定した場合
* 完了条件を変更した場合
* 状態が変更した場合

---

# 9. AI運用

AIはMilestoneを現在の開発目標として扱う。

Milestoneに含まれない機能を実装する場合は、提案として提示し、独断で実装を開始してはならない。
