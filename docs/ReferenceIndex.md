# ReferenceIndex.md

# Reference Index

Version: 1.0
Status: Active
Last Updated: 2026-08-03

---

# 1. 目的

本書は、本プロジェクトのすべての文書について、責務・正本範囲・相互参照を一覧化する。

Project Constitution 第10条（設計変更手順）および第13条（AIの参照順序）が前提とする索引文書である。

ある情報を「どの文書で定義するか」に迷った場合は、本書の**正本範囲**を参照する。

---

# 2. 正本の原則

Project Constitution 第4条により、同一の仕様を複数の文書へ重複して定義してはならない。

各情報には正本となる文書が1つだけ存在し、他の文書はそれを**参照**する。

文書間に矛盾が生じた場合は、Project Constitution 第9条の優先順位に従う。

---

# 3. 文書間の優先順位

Project Constitution 第9条に定める優先順位を唯一の基準とする。

| 順位 | 文書                            |
| -- | ----------------------------- |
| 1  | ProjectConstitution.md        |
| 2  | 15_DecisionLog.md             |
| 3  | 01_Requirements.md            |
| 4  | 設計書（00・02〜11・13〜14）           |
| 5  | 12_TechnologyStack.md         |
| 6  | AI文書（docs/ai/ 配下）             |
| 7  | ImplementationRoadmap.md      |
| 8  | ProjectStatus.md              |

個別の文書が「本書を最優先とする」旨を記載してはならない。

---

# 4. Design 文書

| 文書                              | 責務                | 正本範囲                                                       |
| ------------------------------- | ----------------- | ---------------------------------------------------------- |
| 00_DirectoryStructure.md        | ディレクトリ構成と配置ルール    | ディレクトリの責務、ファイル配置ルール、文書の命名規則                                |
| 01_Requirements.md              | 要件定義              | MVPの対象機能・対象外機能、利用者と権限の種類、非機能要件、システム制約                      |
| 02_BasicDesign.md               | 全体構成              | システム構成図、モジュール構成、全体の設計方針                                    |
| 03_Database.md                  | データベース設計          | **テーブル・列・制約・インデックス・View・RLS・状態遷移表・トランザクション境界**             |
| 04_BackendInterface.md          | バックエンドIF          | **Edge Function定義、Query定義、DTO、Realtimeイベント一覧**             |
| 05_Frontend.md                  | フロントエンド設計         | **画面構成・ルーティング・レイヤ責務・状態管理・UIガイドライン**                        |
| 06_ErrorCode.md                 | エラーコード            | **共通レスポンス形式、全エラーコードとHTTPステータスの対応**                         |
| 07_APISequence.md               | 処理シーケンス           | 各ユースケースの実行順序（What ではなく How の順序）                             |
| 08_RatingSpecification.md       | レーティング仕様          | **Elo計算式、K値、丸め規則、レート更新の契機**                                |
| 09_MatchmakingSpecification.md  | マッチング仕様           | **マッチング条件、優先順位、許容レート差、キュー運用**                              |
| 10_TestSpecification.md（Part1〜） | テスト仕様             | **テスト方針、テストケース、テストID、自動化区分**                               |
| 11_Deployment.md                | デプロイ・運用           | **環境定義、環境変数、CI/CD、リリース手順、監視**                              |
| 12_TechnologyStack.md           | 技術選定              | **採用ライブラリと採用理由、採用しない技術**                                   |
| 13_FutureFeatures.md            | 将来機能              | MVP対象外機能の一覧と優先度                                            |
| 14_Glossary.md                  | 用語                | **正式名称、非推奨表現、状態名、命名規則**                                    |
| 15_DecisionLog.md               | 設計判断              | **すべての設計判断（ADR）の記録**                                       |

---

# 5. Project 文書

| 文書                                  | 責務            | 正本範囲                          |
| ----------------------------------- | ------------- | ----------------------------- |
| governance/ProjectConstitution.md   | 最高規範          | **開発理念、基本原則、文書優先順位、品質ゲート**    |
| governance/ProjectRules.md          | 日常運用ルール       | **Git運用、Pull Request、レビュー手順** |
| governance/RiskManagement.md        | リスク管理         | **リスク一覧、評価基準、エスカレーション基準**     |
| planning/ImplementationRoadmap.md   | 実装計画          | **実装フェーズと順序**                 |
| planning/Milestones.md              | 開発目標          | **マイルストーンと完了条件**              |
| planning/Backlog.md                 | 実施候補          | 未着手タスクの一覧                     |
| status/ProjectStatus.md             | 現在の状態         | **現在のフェーズ、作業中タスク、ブロッカー**      |
| status/Changelog.md                 | 変更履歴          | **リリース単位の変更履歴**               |

---

# 6. AI 文書

| 文書                        | 責務          | 正本範囲                    |
| ------------------------- | ----------- | ----------------------- |
| ai/AIContext.md           | AIへの入力仕様    | **AIContextテンプレートとタグ定義** |
| ai/AIImplementationRule.md | AIの行動規範     | **AIの実装原則・禁止事項・完了条件**   |
| ai/DevelopmentGuide.md    | 開発ナビゲーション   | **作業種別ごとの文書参照順序**       |
| ai/PromptGuide.md         | プロンプト作成方法   | **依頼テンプレートと出力形式**       |

---

# 7. 情報別の参照先

「この情報はどこを見ればよいか」の索引。

| 知りたいこと           | 参照先                                  |
| ---------------- | ------------------------------------ |
| テーブル定義・列・制約      | 03_Database.md                       |
| 試合の状態と遷移         | 03_Database.md（状態遷移表）                |
| RLSポリシー          | 03_Database.md                       |
| Edge Functionの仕様 | 04_BackendInterface.md               |
| DTOの構造           | 04_BackendInterface.md               |
| Realtimeイベント名    | 04_BackendInterface.md（イベント一覧）       |
| エラーコード           | 06_ErrorCode.md                      |
| APIレスポンス形式       | 06_ErrorCode.md                      |
| 処理の実行順序          | 07_APISequence.md                    |
| レート計算式・K値        | 08_RatingSpecification.md            |
| マッチング条件・優先順位     | 09_MatchmakingSpecification.md       |
| 画面とルーティング        | 05_Frontend.md                       |
| テストケース           | 10_TestSpecification.md（Part1〜Part10） |
| 環境変数             | 11_Deployment.md                     |
| 採用ライブラリ          | 12_TechnologyStack.md                |
| 用語・命名            | 14_Glossary.md                       |
| なぜその設計なのか        | 15_DecisionLog.md                    |

---

# 8. 設計変更時の影響確認

Project Constitution 第10条の手順に従い、DecisionLogを更新した後、以下の対応表で影響範囲を確認する。

| 変更内容        | 確認・更新対象                                                            |
| ----------- | ------------------------------------------------------------------ |
| テーブル・列の変更   | 03 → 04 → 07 → 10                                                  |
| Edge Functionの変更 | 04 → 05 → 06 → 07 → 10                                        |
| エラーコードの追加   | 06 → 04 → 05 → 10                                                  |
| 画面・ルーティングの変更 | 05 → 10                                                            |
| レーティング仕様の変更 | 08 → 03（rating_history）→ 10                                        |
| マッチング仕様の変更  | 09 → 04（matchmaker）→ 10                                            |
| 用語の変更       | 14 → 03 → 04 → 05 → 10（全文検索で残存を確認する）                               |
| 技術選定の変更     | 12 → 15 → 05 → 11 → 00                                             |
| ディレクトリ構成の変更 | 00 → 12 → 05 → ai/AIContext.md                                     |

---

# 9. 文書の分割について

以下の文書は複数ファイルに分割されている。参照時は全ファイルを対象とする。

| 論理文書                 | 実ファイル                                     |
| -------------------- | ----------------------------------------- |
| 10_TestSpecification | 10_TestSpecification.md（Part1：方針）          |
|                      | 10_TestSpecification_Part2_Rating.md      |
|                      | 10_TestSpecification_Part3_Team.md        |
|                      | 10_TestSpecification_Part4_Matchmaking.md |
|                      | 10_TestSpecification_Part5_Match.md       |
|                      | 10_TestSpecification_Part6_Ranking.md     |
|                      | 10_TestSpecification_Part7_Admin.md       |
|                      | 10_TestSpecification_Part8_Security.md    |
|                      | 10_TestSpecification_Part9_Frontend.md    |
|                      | 10_TestSpecification_Part10_E2E.md        |

ファイル名にPart番号と対象を含めることで、参照先を明示できるようにしている。

03・04・05・06・07 などその他の設計書は単一ファイルで完結する。

---

# 10. AI運用ルール

* AIは作業開始前に本書で正本を確認する。
* 同一情報を複数文書へ記載してはならない。記載が必要な場合は正本を参照する形とする。
* 新しい文書を追加した場合は、本書へ責務と正本範囲を追記する。
* 文書間の矛盾を発見した場合は、第3節の優先順位に従い、独断で解決せず報告する。
