# 00_DirectoryStructure.md

# ディレクトリ構成

Version: 1.0
Status: Active

---

# 1. 目的

本書は、本プロジェクトのディレクトリ構成、および各ディレクトリの責務を定義する。

すべてのソースコード、ドキュメント、設定ファイルは、本書のルールに従って配置する。

---

# 2. 基本方針

ディレクトリ構成は以下の原則に従う。

* 責務ごとに分離する。
* 同じ責務のファイルを異なる場所へ配置しない。
* ディレクトリ名は役割を表す名前とする。
* 実装より先に構成を決定する。
* 迷った場合は共通領域へ置かず、責務を見直す。

---

# 3. リポジトリ構成

```text
/
├── docs/                  # ドキュメント
│   ├── project/           # プロジェクト運営
│   │   ├── governance/
│   │   ├── planning/
│   │   └── status/
│   │
│   ├── design/            # 設計書
│   │
│   └── ai/                # AI関連文書
│
├── src/                   # アプリケーション
│
├── tests/                 # テスト
│
├── scripts/               # 補助スクリプト
│
├── public/                # 静的ファイル
│
└── .github/               # GitHub設定
```

---

# 4. docs/

設計・運営・AI利用に関する文書を配置する。

ソースコードは配置しない。

---

## project/

プロジェクト運営文書を管理する。

### governance/

プロジェクトの基本ルールを管理する。

例

* ProjectConstitution
* ProjectRules
* RiskManagement

原則として変更頻度は低い。

---

### planning/

計画を管理する。

例

* ImplementationRoadmap
* Milestones
* Backlog

必要に応じて更新する。

---

### status/

現在の状態を管理する。

例

* ProjectStatus
* Changelog

更新頻度が高い文書を配置する。

---

## design/

システム設計書を配置する。

例

* Requirements
* Database
* Backend Interface
* Frontend
* Rating Specification
* Deployment

設計書は設計内容のみを記載し、運用ルールは記載しない。

---

## ai/

AI利用に関する文書を配置する。

例

* AIContext
* AIImplementationRule
* DevelopmentGuide
* PromptGuide

AIへの入力仕様・運用ルールを管理する。

---

# 5. src/

アプリケーション本体を配置する。

責務ごとにディレクトリを分割する。

例

```text
src/
├── app/
├── features/
├── components/
├── shared/
├── hooks/
├── services/
├── lib/
├── types/
└── assets/
```

各ディレクトリの責務は別途設計書で定義する。

---

# 6. tests/

テストコードを配置する。

例

```text
tests/
├── unit/
├── integration/
├── e2e/
├── fixtures/
└── mocks/
```

テスト種別ごとに分類する。

---

# 7. scripts/

開発支援スクリプトを配置する。

例

* セットアップ
* データ投入
* 開発補助
* CI補助

アプリケーションロジックは配置しない。

---

# 8. public/

静的リソースを配置する。

例

* favicon
* 画像
* manifest
* robots.txt

---

# 9. .github/

GitHub運用に関する設定を配置する。

例

* Actions
* Issue Template
* Pull Request Template
* CODEOWNERS

---

# 10. 配置ルール

新しいファイルを追加する際は、以下を確認する。

* 配置先の責務と一致しているか。
* 同じ責務のディレクトリが既に存在しないか。
* 共通化できるものはないか。

責務が不明確な場合は、新しいディレクトリを作成する前に設計を見直す。

---

# 11. 命名規則

## ディレクトリ

* 小文字
* 英単語
* ケバブケースまたは複数形を基本とする

例

```text
components
services
features
tests
scripts
```

---

## ファイル

ドキュメント

```text
ProjectRules.md
RiskManagement.md
```

ソースコード

プロジェクトのコーディング規約に従う。

---

# 12. 更新ルール

ディレクトリ構成を変更する場合は、以下の文書も確認する。

* TechnologyStack
* DevelopmentGuide
* ProjectRules
* DecisionLog

大きな構成変更はDecisionLogへ記録する。

---

# 13. AI運用ルール

AIは新しいディレクトリを作成する前に、既存の責務を確認する。

責務が重複する場合は、新しいディレクトリを追加してはならない。

ディレクトリ構成の変更が必要と判断した場合は、変更案を提示し、人間の承認を得てから実施する。
