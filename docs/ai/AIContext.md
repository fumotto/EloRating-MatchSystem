# AIContext.md

# AI Context Specification

Version: 1.0
Status: Approved

---

# 1. 目的

本書は、AIへ作業を依頼する際の共通コンテキストフォーマットを定義する。

AIへの依頼は、原則として本書で定義するテンプレートを使用する。

---

# 2. 基本原則

AIへ依頼する際は、以下を明確にすること。

* 何を行うか
* どこまで変更してよいか
* 何を変更してはいけないか
* 何を根拠に実装するか
* 完了条件は何か

AIは、テンプレートに記載されていない内容を推測してはならない。

---

# 3. AIContext テンプレート

```xml
<AIContext>

  <Project>
    プロジェクト名
  </Project>

  <Mode>
    Implement | Review | Refactor | Fix | Test | Design | Document
  </Mode>

  <Task>
    今回AIへ依頼する作業内容
  </Task>

  <Scope>
    変更を許可するファイル・ディレクトリ・モジュール
  </Scope>

  <Constraints>
    今回の作業だけに適用する制約事項
  </Constraints>

  <Facts>
    不変の情報
  </Facts>

  <State>
    現在の実装状況
  </State>

  <References>
    参照すべき設計書
  </References>

  <AcceptanceCriteria>
    完了条件
  </AcceptanceCriteria>

  <Output>
    AIへ期待する出力内容
  </Output>

</AIContext>
```

---

# 4. 各タグの説明

| タグ                 | 内容          |
| ------------------ | ----------- |
| Project            | 対象プロジェクト    |
| Mode               | 作業種別        |
| Task               | 今回の依頼内容     |
| Scope              | 変更可能範囲      |
| Constraints        | 今回だけの制約事項   |
| Facts              | 変更されない前提条件  |
| State              | 現在の状況・進捗    |
| References         | 参照すべき設計書    |
| AcceptanceCriteria | 完了条件・受け入れ条件 |
| Output             | AIへ期待する成果物  |

---

# 5. Mode一覧

| Mode      | 説明          |
| --------- | ----------- |
| Implement | 新規実装        |
| Review    | レビュー        |
| Fix       | 不具合修正       |
| Refactor  | リファクタリング    |
| Test      | テスト作成・修正    |
| Design    | 設計          |
| Document  | ドキュメント作成・更新 |

---

# 6. Output標準

AIは、特別な指示がない限り、Outputに以下を含める。

* 変更したファイル
* 実施内容
* 設計との整合性
* テスト内容
* 残課題（存在する場合）

---

# 7. 記入例

```xml
<AIContext>

  <Project>
    Team Rating Battle
  </Project>

  <Mode>
    Implement
  </Mode>

  <Task>
    チーム作成APIを実装する。
  </Task>

  <Scope>
    src/functions/team/*
    tests/*
  </Scope>

  <Constraints>
    DBスキーマを変更しない。
    新規ライブラリを追加しない。
  </Constraints>

  <Facts>
    Teamは固定メンバー制である。
  </Facts>

  <State>
    DatabaseおよびAPI仕様は確定済み。
  </State>

  <References>
    03_Database.md
    04_BackendInterface.md
    07_APISequence.md
    10_TestSpecification.md
  </References>

  <AcceptanceCriteria>
    API仕様どおりに動作する。
    Unit Testが成功する。
    Lintエラーがない。
  </AcceptanceCriteria>

  <Output>
    実装コード
    テストコード
    変更ファイル一覧
    残課題
  </Output>

</AIContext>
```

---

# 8. 運用ルール

* AIへ依頼する際は、本テンプレートを使用する。
* 必要なタグのみ省略可能とする。ただし、Project・Mode・Task・Scope・Referencesは原則必須とする。
* Scope外の変更が必要になった場合は、AIは作業を継続せず、変更提案を行う。

---

# 9. AI実装ルール

AIは本書を作業開始時の入力仕様として扱う。

本書と Project Rules または Project Constitution が矛盾する場合は、それらを優先する。
