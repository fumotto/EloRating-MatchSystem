# 10_TestSpecification.md

## Part6

# Ranking Tests

---

# 1. 対象

本章ではランキング機能のテストケースを定義する。

対象

* Team Ranking
* Rating Sort
* Pagination
* Ranking API

---

# 2. テストケース

| ID       | 観点         | 前提条件     | 確認方法         | 期待結果         | 自動化         | テストメソッド名                                             |
| -------- | ---------- | -------- | ------------ | ------------ | ----------- | ---------------------------------------------------- |
| RANK-001 | ランキング取得    | チームが存在する | ランキング取得API実行 | 一覧取得成功       | Integration | `test_api_should_return_team_rankings`               |
| RANK-002 | レート降順      | 複数チーム存在  | ランキング取得      | レート降順で並ぶ     | Integration | `test_api_should_sort_rankings_by_rating_desc`       |
| RANK-003 | 同レート順位     | 同一レートチーム | ランキング取得      | 順位付けが仕様どおり   | Integration | `test_api_should_handle_equal_rating_rankings`       |
| RANK-004 | 勝率表示       | 試合終了済み   | ランキング取得      | 勝率が正しく表示される  | Integration | `test_api_should_return_win_rate`                    |
| RANK-005 | 試合数表示      | 試合終了済み   | ランキング取得      | 試合数が正しい      | Integration | `test_api_should_return_match_count`                 |
| RANK-006 | ページング      | 大量データ    | ページ切替        | 指定件数取得       | Integration | `test_api_should_paginate_rankings`                  |
| RANK-007 | 空ランキング     | チームなし    | ランキング取得      | 空配列を返す       | Integration | `test_api_should_return_empty_rankings`              |
| RANK-008 | BANチーム     | BANチーム存在 | ランキング取得      | BANチームを表示しない | Integration | `test_api_should_exclude_banned_teams_from_rankings` |
| RANK-009 | Realtime更新 | 試合終了     | ランキング取得      | 更新後順位が反映される  | Integration | `test_api_should_refresh_rankings_after_match`       |
| RANK-010 | レスポンスDTO   | ランキング取得  | レスポンス確認      | API仕様どおり     | Integration | `test_api_should_return_ranking_response_dto`        |

---

# 3. 境界値テスト

| 対象     | 境界値    |
| ------ | ------ |
| 順位     | 1位・最下位 |
| ページサイズ | 1・最大件数 |
| チーム数   | 0・1・多数 |

---

# 4. 異常系テスト

以下を必ず実施する。

* 存在しないページ番号
* 不正なページサイズ
* DB取得失敗
* レスポンス生成失敗

---

# 5. AI実装ルール

* ランキングはレート降順で取得する。
* BANチームはランキング対象外とする。
* レスポンスDTOはAPI仕様書に準拠する。
* Realtime更新後はランキング再取得で整合性を確認する。
