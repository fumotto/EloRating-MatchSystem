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
* React / Vite / TanStack Router
* Supabase（Local 含む）
* GitHub Actions
* Vitest / Deno Test / pgTAP / Playwright

完了条件

* 開発環境が構築できる。
* CIが正常に動作する（Migration適用と全テスト種別を含む）。

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

* 認証プロバイダのPoC（ADR-015）
* 外部OAuthログイン
* `ensure-profile` によるプロフィール生成
* Session確認

参照

* 04_BackendInterface.md（4章）
* 15_DecisionLog.md（ADR-015）

完了条件

* ログインできる
* プロフィールが自動作成される

本Phaseの冒頭でPoCを実施し、採用するプロバイダを確定する。Supabase Auth はSteamを標準プロバイダとして提供していないため、実現可否の検証が必要である。

PoCの結論はADRとして記録する。データベーススキーマは既にプロバイダ非依存としているため、結論によらずスキーマ変更は発生しない。

---

## Phase 4 Backend API

対象

* Team API（作成・招待・参加・脱退・リーダー移譲）
* Queue API（登録・解除・マッチング）
* Match API（申告・承認・拒否）
* 内部Function（自動解決・クリーンアップ）
* Admin API（BAN・設定変更・レートリセット）
* Query（ランキング・チーム・試合・監査ログ）

参照

* 04_BackendInterface.md
* 07_APISequence.md

完了条件

* API仕様を満たす。
* Edge Functions のトランザクション基盤（DB直結）が動作する。

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

1. Database（スキーマ・RLS・View・Seed）
2. トランザクション基盤（DB直結・共通処理）
3. Rating（純粋関数・単体テスト）
4. Authentication（PoC → 実装）
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
