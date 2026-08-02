# DevelopmentGuide.md

# Development Guide

Version: 1.0
Status: Approved

---

# 1. 目的

本書は、本プロジェクトの開発時に参照すべき文書、参照順序、および実施手順を定義する。

AIおよび開発者は、本書を開発時のナビゲーションとして利用する。

---

# 2. 基本原則

開発を開始する前に、以下を確認する。

1. Project Constitution
2. Project Rules
3. AIContext（AI利用時）
4. DecisionLog
5. 関連設計書

設計書を読まずに実装を開始してはならない。

---

# 3. 文書参照順序

## システム全体を理解する場合

1. ReferenceIndex.md
2. 01_Requirements.md
3. 02_BasicDesign.md
4. 12_TechnologyStack.md
5. 14_Glossary.md

---

## データベースを変更する場合

1. 15_DecisionLog.md
2. 03_Database.md
3. 04_BackendInterface.md
4. 07_APISequence.md
5. 10_TestSpecification.md

---

## APIを実装する場合

1. 01_Requirements.md
2. 03_Database.md
3. 04_BackendInterface.md
4. 06_ErrorCode.md
5. 07_APISequence.md
6. 10_TestSpecification.md

---

## フロントエンドを実装する場合

1. 01_Requirements.md
2. 05_Frontend.md
3. 12_TechnologyStack.md
4. 10_TestSpecification.md

---

## レーティングを変更する場合

1. 15_DecisionLog.md
2. 08_RatingSpecification.md
3. 09_MatchmakingSpecification.md
4. 10_TestSpecification.md

---

## テストを追加する場合

1. 対象設計書
2. 10_TestSpecification.md
3. 06_ErrorCode.md

---

# 4. 作業別ガイド

## 新機能追加

実施順序

1. 要件確認
2. DecisionLog確認
3. 設計確認
4. 実装
5. テスト
6. レビュー

---

## バグ修正

実施順序

1. 現象確認
2. 原因調査
3. DecisionLog確認（設計変更が必要か）
4. 修正
5. 回帰テスト
6. レビュー

---

## リファクタリング

実施順序

1. 設計確認
2. 実装変更
3. テスト実施
4. レビュー

機能変更を伴ってはならない。

---

## ドキュメント更新

実施順序

1. DecisionLog
2. 設計書
3. DevelopmentGuide（必要時）
4. Changelog

---

# 5. 設計変更時の影響確認

| 変更内容     | 確認・更新対象                                                           |
| -------- | ----------------------------------------------------------------- |
| DB変更     | Database、Backend Interface、API Sequence、Test Specification        |
| API変更    | Backend Interface、Frontend、ErrorCode、Test Specification           |
| UI変更     | Frontend、Test Specification                                       |
| レーティング変更 | Rating Specification、Matchmaking Specification、Test Specification |
| 技術選定変更   | Technology Stack、DecisionLog                                      |

---

# 6. AI向け開発フロー

AIは以下の順序で処理を行う。

1. AIContextを読む。
2. Scopeを確認する。
3. Constraintsを確認する。
4. DevelopmentGuideを参照する。
5. 必要な設計書のみ読む。
6. 実装する。
7. テストを追加・更新する。
8. Outputを作成する。

---

# 7. 文書更新マトリクス

| 変更対象              | 更新を検討する文書                                         |
| ----------------- | ------------------------------------------------- |
| Requirements      | DecisionLog、Test Specification                    |
| Database          | Backend Interface、API Sequence、Test Specification |
| Backend Interface | Frontend、ErrorCode、API Sequence                   |
| Technology Stack  | Project Rules、AIImplementationRule                |
| Glossary          | Database、Backend Interface、Frontend               |

---

# 8. 完了チェックリスト

実装完了前に以下を確認する。

* 設計書を確認した。
* Scope外を変更していない。
* Constraintsを満たしている。
* テストを更新した。
* ドキュメントを更新した。
* Outputを作成した。

---

# 9. AI実装ルール

AIは本書を開発ナビゲーションとして利用する。

参照する文書は必要最小限とし、Scope外の設計書を前提とした推測実装を行ってはならない。
