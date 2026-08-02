# 10_TestSpecification.md

# Test Specification — Part 1: 方針

Version: 2.0
Status: Active
Last Updated: 2026-08-03
準拠ADR: ADR-007, ADR-008, ADR-009, ADR-010, ADR-012, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017, ADR-018

---

# 1. 目的

本書は本システムの品質保証を目的として、テスト方針・テストケース・自動化対象を定義する。

本書はテストの正本である。**仕様の正本ではない。**

本書と設計書の内容が矛盾する場合は、Project Constitution 第9条の優先順位に従い、設計書を正とする。矛盾を発見した場合は本書を修正する。

---

# 2. 文書構成

本仕様は以下のファイルに分割される。参照時は全ファイルを対象とする。

| ファイル                                     | 内容            |
| ---------------------------------------- | ------------- |
| 10_TestSpecification.md                  | Part1：方針（本書）  |
| 10_TestSpecification_Part2_Rating.md     | Part2：レーティング  |
| 10_TestSpecification_Part3_Team.md       | Part3：チーム     |
| 10_TestSpecification_Part4_Matchmaking.md | Part4：マッチング   |
| 10_TestSpecification_Part5_Match.md      | Part5：試合      |
| 10_TestSpecification_Part6_Ranking.md    | Part6：ランキング   |
| 10_TestSpecification_Part7_Admin.md      | Part7：管理機能    |
| 10_TestSpecification_Part8_Security.md   | Part8：セキュリティ  |
| 10_TestSpecification_Part9_Frontend.md   | Part9：フロントエンド |
| 10_TestSpecification_Part10_E2E.md       | Part10：E2E    |

---

# 3. テスト方針

ADR-012により、テストはすべて TypeScript で記述する。Python および pytest は採用しない。

| レイヤ              | 目的                     | ツール                            |
| ---------------- | ---------------------- | ------------------------------ |
| Unit Test        | 純粋ロジックの検証（Elo計算・バリデーション等） | Vitest                         |
| Integration Test | Edge Functions・DB更新の検証 | Deno Test                      |
| Database Test    | RLSポリシー・制約の検証          | pgTAP                          |
| Frontend Test    | React Component・Hook   | Vitest ＋ React Testing Library |
| E2E Test         | ユーザー操作                 | Playwright                     |

## 3.1 テスト種別の使い分け

| 検証対象                    | 種別          | 理由                                       |
| ----------------------- | ----------- | ---------------------------------------- |
| Eloレート計算                | Unit        | 純粋関数として実装されるため（ADR-016）                  |
| Edge Function の業務ルール・認可 | Integration | Edge Functions はDB直結でRLSを迂回するため、実装内の認可を検証する必要がある |
| RLSポリシー                 | Database    | クライアント経路（PostgREST）での挙動を検証する              |
| 制約・トリガ                  | Database    | CHECK制約・部分UNIQUEインデックスの動作を検証する           |

**Edge Function の認可チェックを「RLSのテスト」として扱ってはならない。** Edge Functions はDB直結でRLSを迂回するため、両者は別の防御層である（ADR-016）。

---

# 4. テスト環境

| 項目       | 内容                            |
| -------- | ----------------------------- |
| Database | Supabase Local（`supabase start`） |
| Backend  | Supabase Edge Functions（Deno） |
| Frontend | Vite Development Server       |
| Browser  | Chromium                      |
| Runtime  | Bun（フロントエンド）、Deno（Edge Functions） |
| Language | TypeScript                    |

各テストは独立して実行でき、実行順に依存しないこと。

---

# 5. テストデータ

## 5.1 チーム

| 名称     | 初期レート | 備考         |
| ------ | ----: | ---------- |
| TEAM_A |  1500 | 標準         |
| TEAM_B |  1500 | 標準（同レート検証） |
| TEAM_C |  1800 | レート差検証     |
| TEAM_D |  1100 | レート差検証     |
| TEAM_E |  1900 | レート差400の境界検証（対 TEAM_A） |

## 5.2 利用者

テストデータの名称は全Partで統一する。

| 名称         | 所属     | 役割     |
| ---------- | ------ | ------ |
| PLAYER_A1  | TEAM_A | LEADER |
| PLAYER_A2  | TEAM_A | MEMBER |
| PLAYER_B1  | TEAM_B | LEADER |
| PLAYER_B2  | TEAM_B | MEMBER |
| PLAYER_C1  | TEAM_C | LEADER |
| PLAYER_X   | 未所属    | －      |
| ADMIN_USER | 未所属    | 管理者    |

E2Eテストでも同一の名称を使用する。

## 5.3 認証

認証プロバイダは固定しない（ADR-015）。テスト環境ではモック認証またはテスト用プロバイダを使用する。

`profiles.auth_provider` および `provider_user_id` はテストフィクスチャで設定する。

---

# 6. テストID規則

```text
TC-<カテゴリ>-<3桁連番>
```

例

```text
TC-RATING-001
TC-MATCH-018
TC-SEC-005
```

## 6.1 エラーコードとの区別

`06_ErrorCode.md` のエラーコードは `TEAM-004` のように接頭辞を持たない。

テストIDは必ず **`TC-`** で始める。両者は接頭辞の有無で機械的に判別できる。

接頭辞を省略してはならない。省略するとエラーコードと同一の文字列になり、文書検索・ログ解析・AIへの指示が曖昧になる。

## 6.2 カテゴリ

| カテゴリ   | 対象      |
| ------ | ------- |
| RATING | レーティング  |
| TEAM   | チーム     |
| QUEUE  | マッチング   |
| MATCH  | 試合      |
| RANK   | ランキング   |
| ADMIN  | 管理機能    |
| SEC    | セキュリティ  |
| UI     | フロントエンド |
| E2E    | E2E     |

---

# 7. テスト命名規則

`describe` / `it` 形式で記述する。

```typescript
describe("approve-match", () => {
  it("updates ratings for both teams when the loser approves", async () => {
    // TC-MATCH-004
  });
});
```

## 7.1 規則

* `describe` には対象（Edge Function名・コンポーネント名・モジュール名）を書く
* `it` は動詞から始まる英語の平叙文とする（`should` は省略してよい）
* テストIDをコメントまたは `it` の引数へ含め、本書との対応を明示する

`test_api_should_xxx()` のようなsnake_case形式は使用しない（ADR-012）。

---

# 8. 判定基準

テストは、その種別に応じて以下を満たした場合に成功とする。

| 種別          | 判定項目                                    |
| ----------- | --------------------------------------- |
| Unit        | 戻り値が期待値と一致する                            |
| Integration | HTTPステータス・`result`・`error.code`・DB更新内容が仕様どおり |
| Database    | ポリシー・制約が期待どおり許可／拒否する                    |
| Frontend    | 表示・操作結果が仕様どおり                           |
| E2E         | 画面遷移とデータ状態が仕様どおり                        |

Realtime通知の検証は、通知を伴う処理のIntegration TestおよびE2E Testでのみ行う。すべてのテストに一律で課さない。

---

# 9. テストケースの記載形式

| 列     | 内容                                   |
| ----- | ------------------------------------ |
| ID    | `TC-` 接頭辞つきのテストID                    |
| 観点    | 何を確認するか                              |
| 前提条件  | テスト開始時の状態                            |
| 操作    | 実行する処理                               |
| 期待結果  | 期待される状態・応答（エラーコードを含む）                |
| 種別    | Unit / Integration / Database / Frontend / E2E |
| テスト名  | `it` に記述する文言                         |

---

# 10. テスト品質方針

重要機能について以下を網羅する。

* 正常系
* 異常系
* 境界値
* 権限
* 同時実行
* 冪等性
* 回帰テスト

## 10.1 期待値の扱い

Elo計算などの数値検証では、**仕様書から手計算した固定値をテストへ記述する。**

実装と同じ計算式をテストコード内で再実装してはならない。式そのものの誤りを検出できなくなるためである。

例

```typescript
// 正: 仕様から導出した固定値を使う
expect(result.winnerAfter).toBe(1516);

// 誤: 実装と同じ式を再計算している
expect(result.winnerAfter).toBe(1500 + Math.round(32 * (1 - expected)));
```

---

# 11. 冪等性の定義

`06_ErrorCode.md` 15章に従う。

| 操作の種類          | 再送時の期待             |
| -------------- | ------------------ |
| 管理操作（BAN・設定変更） | 成功（`OK`）を返し、状態は変化しない |
| 状態遷移（申告・承認・拒否） | 業務エラーを返し、状態は変化しない  |

状態遷移を伴う操作について「再送しても同じ応答が返る」ことを期待してはならない。2回目は `MATCH-002` / `MATCH-003` / `MATCH-004` / `MATCH-008` のいずれかを返す。

いずれの場合も**副作用が二重に発生しないこと**を検証する。

---

# 12. 完了条件

以下を満たした場合、MVPの品質基準を満たしたものとする。

* Unit Test：100%成功
* Integration Test：100%成功
* Database Test：100%成功
* Frontend Test：100%成功
* E2E Test：100%成功
* 重大・高優先度の未解決不具合が存在しないこと

## 12.1 不具合の優先度

| 優先度 | 定義                            |
| --- | ----------------------------- |
| 重大  | データ破損・レート不整合・認可の突破・主要フローの停止   |
| 高   | 主要機能が特定条件で失敗する                |
| 中   | 代替手段のある不具合、表示の誤り              |
| 低   | 軽微な表示崩れ、文言の誤り                 |

---

# 13. AI実装ルール

* すべての Edge Function に正常系・異常系テストを作成する。
* すべての RLS ポリシーに許可・拒否テストを作成する（pgTAP）。
* Edge Function の認可チェックは Integration Test で検証する。RLSテストで代用しない。
* レーティング計算は境界値テストを作成する。
* 期待値は仕様書から導出した固定値を使用し、実装式を再実装しない。
* E2E は主要ユーザーフローを網羅する。
* テストIDは `TC-` 接頭辞を付与する。
* テスト名は `describe` / `it` 形式で記述する。
* テストは互いに独立させ、実行順に依存させない。
