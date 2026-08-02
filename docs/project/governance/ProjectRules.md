# ProjectRules.md

# Project Rules

Version: 1.0
Status: Approved

---

# 1. 目的

本書は、本プロジェクトの日常的な運用ルールを定義する。

Project Constitution に定める原則を実務へ適用するための運用規則とし、開発者およびAIは本書に従うものとする。

---

# 2. 適用範囲

本書は以下を対象とする。

* 設計書
* ソースコード
* テストコード
* Git運用
* Pull Request
* AIによる実装・レビュー
* リリース作業

---

# 3. 開発フロー

すべての開発は、以下の順序で実施する。

1. 要件を確認する。
2. DecisionLog を確認する。
3. 関連設計書を確認する。
4. AIContext を作成する（AIを利用する場合）。
5. 実装する。
6. テストを実施する。
7. レビューを実施する。
8. マージする。

設計変更を伴う場合は、本手順の前に DecisionLog を更新すること。

---

# 4. 設計変更ルール

設計変更を行う場合は、以下の順序で更新する。

1. DecisionLog
2. 関連設計書
3. DevelopmentGuide
4. テスト仕様
5. 実装

設計書より先に実装を変更してはならない。

---

# 5. ドキュメント管理

## 新規文書

* 必要性を確認する。
* 重複する内容を作成しない。
* Single Source of Truth を維持する。

## 更新

* 関連文書への影響を確認する。
* 更新漏れがないことを確認する。
* 更新内容が DecisionLog と一致することを確認する。

## 削除

* 原則として削除しない。
* 廃止する場合は履歴を残す。

---

# 6. AI利用ルール

AIを利用する場合は、以下を必須とする。

* AIContext を利用する。
* DevelopmentGuide を参照する。
* 推測による仕様追加を禁止する。
* 出力内容をレビューする。

AIが仕様不足を検出した場合は、人間へ確認を求める。

---

# 7. Git運用

## ブランチ

| 種類       | 命名例                    |
| -------- | ---------------------- |
| Feature  | feature/team-create    |
| Fix      | fix/login-error        |
| Docs     | docs/update-api        |
| Refactor | refactor/match-service |
| Release  | release/v1.0.0         |

---

## コミット

Conventional Commits を採用する。

例

* feat:
* fix:
* docs:
* refactor:
* test:
* chore:
* ci:

コミットメッセージは変更内容を簡潔に表現すること。

---

# 8. Pull Request

Pull Request には以下を記載する。

* 目的
* 変更内容
* 関連Issue
* 関連ADR
* 更新した設計書
* テスト結果
* 残課題（存在する場合）

---

# 9. レビュー

レビューは以下の順序で実施する。

1. AIレビュー
2. 人間によるレビュー
3. 修正
4. 再レビュー
5. 承認

レビューでは、設計書との整合性を最優先で確認する。

---

# 10. テスト

変更内容に応じて、以下を実施する。

* Unit Test
* Integration Test
* E2E Test

テスト未実施のコードは完了とみなさない。

---

# 11. リリース

リリース前に以下を確認する。

* Formatter 成功
* Linter 成功
* Type Check 成功
* テスト成功
* レビュー完了
* Changelog 更新
* バージョン更新

---

# 12. 文書更新チェックリスト

設計変更時は、必要に応じて以下を更新する。

* DecisionLog（**最初に更新する**）
* ReferenceIndex（正本の変更を伴う場合）
* Project Constitution
* Requirements
* Database
* Backend Interface
* Error Code
* API Sequence
* Frontend
* Rating / Matchmaking Specification
* Technology Stack
* Test Specification（Part1〜Part10）
* Deployment
* Glossary
* DevelopmentGuide
* AIContext テンプレート
* Changelog

影響範囲の判断には `ReferenceIndex.md` 8章の対応表を利用する。

更新対象がないことを確認した場合は、その旨をレビューに記録する。

---

# 13. 完了条件

タスクは以下をすべて満たした時点で完了とする。

* 設計書との整合性を確認した。
* コードレビューが完了した。
* 必要なテストが成功した。
* 関連文書を更新した。
* DecisionLog が必要な場合は更新した。

---

# 14. 例外対応

緊急対応など、本書の手順を省略した場合は、事後に以下を実施する。

* DecisionLog の追記
* 設計書の更新
* テストの追加
* Changelog の更新

---

# 15. AI実装ルール

AIは本書を日常運用の基準として扱う。

本書と Project Constitution が矛盾する場合は、Project Constitution を優先する。
