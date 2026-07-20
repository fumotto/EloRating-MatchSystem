# Backlog.md

# Project Backlog

Version: 1.0
Status: Active

---

# 1. 目的

本書は、本プロジェクトにおいて今後実施を検討するタスクを管理する。

Backlogは未着手の候補一覧であり、Implementation RoadmapおよびProject Statusとは役割を分離する。

---

# 2. 運用方針

* Backlogには着手前のタスクを登録する。
* 優先順位は定期的に見直す。
* 実装を開始するタスクはMilestoneへ移動する。
* 完了したタスクはBacklogから削除し、履歴はChangelogおよびGitで管理する。

---

# 3. タスク状態

| 状態       | 説明    |
| -------- | ----- |
| Proposed | 提案済み  |
| Ready    | 着手可能  |
| Deferred | 延期    |
| Rejected | 採用しない |

---

# 4. 優先度

| 優先度 | 説明  |
| --- | --- |
| P0  | 最優先 |
| P1  | 高   |
| P2  | 中   |
| P3  | 低   |

---

# 5. Backlog一覧

| ID    | タイトル | カテゴリ | 優先度 | 状態 | 依存タスク | 備考 |
| ----- | ---- | ---- | --- | -- | ----- | -- |
| B-001 |      |      |     |    |       |    |
| B-002 |      |      |     |    |       |    |

---

# 6. カテゴリ

タスクは以下のカテゴリで管理する。

* Feature
* Enhancement
* Refactor
* Bug
* Test
* Documentation
* Infrastructure
* Security
* Performance

---

# 7. 登録ルール

新しいBacklogを登録する際は、以下を記載する。

* タイトル
* 背景
* 期待する成果
* 優先度
* 依存タスク
* 関連設計書

---

# 8. Backlogレビュー

定期的に以下を確認する。

* 優先順位
* 重複タスク
* 不要タスク
* 依存関係

不要になったタスクはRejectedへ変更する。

---

# 9. Milestoneへの移行

以下を満たしたタスクはMilestoneへ移行できる。

* 要件が明確である。
* 設計書が存在する。
* 依存タスクが解消されている。
* 実装可能と判断された。

---

# 10. AI運用

AIはBacklogを直接実装対象としない。

AIが実装を行う対象は、MilestoneまたはImplementation Roadmapへ登録されたタスクとする。

Backlogに対しては、設計支援・調査・見積り・実現性の提案のみを行う。
