# 10_TestSpecification.md

# Test Specification

Version 1.0

---

# 1. 目的

本書は固定チームレート戦システムの品質保証を目的として、テスト方針・テストケース・自動化対象を定義する。

本仕様書は AI 実装仕様書を兼ねる。

---

# 2. テスト方針

本システムでは以下のレイヤでテストを実施する。

| レイヤ              | 目的                    | ツール                            |
| ---------------- | --------------------- | ------------------------------ |
| Unit Test        | 純粋ロジックの検証             | pytest                         |
| Integration Test | DB・API・Edge Functions | pytest                         |
| Security Test    | RLS・認可                | pytest                         |
| Frontend Test    | React Component・Hook  | Vitest + React Testing Library |
| E2E Test         | ユーザー操作                | Playwright                     |

---

# 3. テスト環境

| 項目       | 内容                      |
| -------- | ----------------------- |
| Database | Supabase Local          |
| Backend  | Supabase Edge Functions |
| Frontend | Vite Development Server |
| Browser  | Chromium                |
| Runtime  | Bun                     |
| Language | Python / TypeScript     |

---

# 4. テストデータ

基本データ

| 名称     | 内容        |
| ------ | --------- |
| TEAM_A | 初期レート1500 |
| TEAM_B | 初期レート1500 |
| TEAM_C | 初期レート1800 |
| TEAM_D | 初期レート1100 |

ユーザー

| 名称         | 内容     |
| ---------- | ------ |
| PLAYER_A1  | TEAM_A |
| PLAYER_A2  | TEAM_A |
| PLAYER_B1  | TEAM_B |
| ADMIN_USER | 管理者    |

---

# 5. テスト実行順

以下の順序で実施する。

1. Unit
2. Integration
3. Security
4. Frontend
5. E2E

前段階が成功していることを前提とする。

---

# 6. テストID規則

| Prefix | 対象      |
| ------ | ------- |
| RATING | レーティング  |
| TEAM   | チーム     |
| QUEUE  | マッチング   |
| MATCH  | 試合      |
| RANK   | ランキング   |
| ADMIN  | 管理者     |
| SEC    | セキュリティ  |
| UI     | フロントエンド |
| E2E    | E2E     |

例

RATING-001

MATCH-018

SEC-005

---

# 7. テストメソッド命名規則

Unit

```python
test_should_xxx()
```

Integration

```python
test_api_should_xxx()
```

Security

```python
test_rls_should_xxx()
```

Frontend

```text
test_ui_should_xxx()
```

E2E

```text
test_e2e_should_xxx()
```

---

# 8. 判定基準

テストは以下の条件をすべて満たした場合に成功とする。

* HTTP Status が仕様どおり
* Error Code が仕様どおり
* Database 更新内容が一致
* Realtime 通知が送信される
* UI 表示が仕様どおり

---

# 9. 自動化区分

| 区分          | 説明         |
| ----------- | ---------- |
| Unit        | pytest     |
| Integration | pytest     |
| Security    | pytest     |
| Frontend    | Vitest     |
| E2E         | Playwright |
| Manual      | 手動確認       |

MVPでは Manual を極力作成しない。

---

# 10. テストケース一覧

以降の章では以下の形式で管理する。

| ID | 観点 | 前提条件 | 確認方法 | 期待結果 | 自動化 | テストメソッド名 |
| -- | -- | ---- | ---- | ---- | --- | -------- |

---

# 11. テスト品質方針

すべての重要機能について以下を網羅する。

* 正常系
* 異常系
* 境界値
* 権限
* 同時実行
* 回帰テスト

---

# 12. AI実装ルール

AI は以下を遵守する。

* すべての API に正常系・異常系テストを作成する。
* すべての RLS ポリシーに許可・拒否テストを作成する。
* レーティング計算は境界値テストを作成する。
* E2E は主要ユーザーフローを網羅する。
* テストメソッド名は本仕様書の命名規則に従う。
