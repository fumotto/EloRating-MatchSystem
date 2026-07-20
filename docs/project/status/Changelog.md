# Changelog.md

# Changelog

本プロジェクトの主要な変更履歴を記録する。

この文書は、ユーザーおよび開発者が各バージョンで何が変更されたかを把握するためのものである。

設計判断は **DecisionLog.md**、詳細な変更履歴は **Git履歴** を参照すること。

本書は **Keep a Changelog** の考え方を参考に運用する。

---

# バージョン管理方針

本プロジェクトは Semantic Versioning（SemVer）を採用する。

```
MAJOR.MINOR.PATCH
```

* **MAJOR**：互換性のない変更
* **MINOR**：後方互換性のある機能追加
* **PATCH**：後方互換性のある不具合修正

---

# 更新ルール

以下の場合、本書を更新する。

* 新機能を追加した場合
* 既存機能を変更した場合
* 不具合を修正した場合
* セキュリティ修正を行った場合
* 廃止・削除を行った場合

軽微なリファクタリングやコメント修正など、利用者への影響がない変更は記載しない。

---

# 変更区分

各リリースでは、必要に応じて以下の区分を使用する。

* Added（追加）
* Changed（変更）
* Fixed（修正）
* Deprecated（非推奨）
* Removed（削除）
* Security（セキュリティ）

---

# テンプレート

```markdown
## [1.0.0] - YYYY-MM-DD

### Added
- 新機能

### Changed
- 仕様変更

### Fixed
- 不具合修正

### Deprecated
- 非推奨となった機能

### Removed
- 削除した機能

### Security
- セキュリティ対応
```

---

# リリース一覧

## [Unreleased]

### Added

*

### Changed

*

### Fixed

*

---

## [0.1.0] - Initial Development

### Added

* プロジェクト作成
* 基本設計書作成
* AI開発ドキュメント整備

---

# 関連文書

| 文書                       | 役割       |
| ------------------------ | -------- |
| DecisionLog.md           | 設計判断の履歴  |
| ProjectStatus.md         | 現在の進捗状況  |
| ImplementationRoadmap.md | 実装計画     |
| Milestones.md            | 開発目標     |
| Git履歴                    | すべての変更履歴 |

---

# AI運用ルール

AIは以下の場合のみ Changelog の更新を提案する。

* 新しいリリースを作成する場合
* 利用者に影響する変更を実装した場合
* セキュリティ修正を実施した場合

AIはコミット単位ではなく、**リリース単位**で変更履歴をまとめるものとする。
