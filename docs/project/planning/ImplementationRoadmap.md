# ImplementationRoadmap.md

# Implementation Roadmap

Version: 1.0
Status: Active

---

# 1. 目的

本書は、本プロジェクトの実装計画を定義する。

設計書をもとに、実装順序・依存関係・完了条件を管理する。

---

# 2. 基本方針

実装は以下の原則に従う。

* 設計書が完成したものから実装する。
* 下位レイヤーから順に実装する。
* 各フェーズでテストを完了させる。
* フェーズ完了後にレビューを実施する。

---

# 3. 実装フェーズ

| Phase   | 内容          | 状態          |
| ------- | ----------- | ----------- |
| Phase 1 | 開発環境構築      | Not Started |
| Phase 2 | Database実装  | Not Started |
| Phase 3 | 認証基盤        | Not Started |
| Phase 4 | Backend API | Not Started |
| Phase 5 | Frontend    | Not Started |
| Phase 6 | 統合テスト       | Not Started |
| Phase 7 | MVPリリース     | Not Started |

---

# 4. Phase詳細

## Phase 1 開発環境構築

対象

* Bun
* React
* Vite
* Supabase
* GitHub Actions
* Vitest
* Playwright

完了条件

* 開発環境が構築できる。
* CIが正常に動作する。

---

## Phase 2 Database

対象

* Migration
* RLS
* Seed
* Index

参照

* 03_Database.md

完了条件

* 全Migrationが適用できる。
* Seed投入が成功する。

---

## Phase 3 認証

対象

* Steam Login
* Profile生成
* Session確認

参照

* Backend Interface

完了条件

* ログイン可能
* Profile自動作成

---

## Phase 4 Backend API

対象

* Team API
* Invite API
* Queue API
* Match API
* Ranking API

参照

* 04_BackendInterface.md

完了条件

* API仕様を満たす。

---

## Phase 5 Frontend

対象

* Login
* Team
* Queue
* Match
* Ranking

参照

* 05_Frontend.md

完了条件

* MVP画面が動作する。

---

## Phase 6 Test

対象

* Unit Test
* Integration Test
* E2E Test

完了条件

* 全テスト成功

---

## Phase 7 Release

対象

* GitHub Pages
* Supabase

完了条件

* MVP公開

---

# 5. 実装順序

実装は以下の順序を推奨する。

1. Database
2. Authentication
3. Team
4. Invite
5. Queue
6. Match
7. Rating
8. Ranking
9. Frontend
10. Test
11. Release

---

# 6. フェーズ完了条件

各フェーズは以下を満たした場合に完了とする。

* 設計書との整合性確認
* Unit Test成功
* Integration Test成功（対象がある場合）
* レビュー完了
* ドキュメント更新完了

---

# 7. ブロッカー管理

ブロッカーが発生した場合は、以下を記録する。

* 発生日
* 内容
* 影響範囲
* 対応方針
* 解決日

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

AIはRoadmapを参照し、現在のフェーズを逸脱した実装を行ってはならない。

未着手フェーズの実装を提案する場合は、提案として区別して提示する。
