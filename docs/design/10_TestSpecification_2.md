# 10_TestSpecification.md

## Part2

# Rating Tests

---

# 1. 対象

本章では Elo レーティング機能のテストケースを定義する。

対象

- 初期レート
- Elo計算
- K値
- 丸め処理
- rating_history
- トランザクション
- レート更新

---

# 2. テストケース

| ID         | 観点                 | 前提条件         | 確認方法            | 期待結果                          | 自動化      | テストメソッド名                                       |
| ---------- | -------------------- | ---------------- | ------------------- | --------------------------------- | ----------- | ------------------------------------------------------ |
| RATING-001 | 初期レート           | 新規チーム作成   | teams取得           | rating=1500                       | Integration | `test_api_should_initialize_team_rating_to_1500`       |
| RATING-002 | 勝者レート増加       | 試合承認済み     | approve-match実行   | 勝者レートが増加する              | Unit        | `test_should_increase_winner_rating`                   |
| RATING-003 | 敗者レート減少       | 試合承認済み     | approve-match実行   | 敗者レートが減少する              | Unit        | `test_should_decrease_loser_rating`                    |
| RATING-004 | レート保存           | 試合承認済み     | teams取得           | 新レートが保存される              | Integration | `test_api_should_save_updated_team_rating`             |
| RATING-005 | 勝敗反映             | 試合承認済み     | rating_history取得  | 勝敗が正しく記録される            | Integration | `test_api_should_store_match_result_in_rating_history` |
| RATING-006 | K値32                | 設定値32         | レート計算          | K=32で計算される                  | Unit        | `test_should_apply_default_k_factor`                   |
| RATING-007 | K値変更              | K値64へ変更      | レート計算          | 変更後K値を利用する               | Integration | `test_api_should_use_updated_k_factor`                 |
| RATING-008 | 丸め処理(切り捨て側) | 計算結果1512.4   | 保存処理            | 1512になる                        | Unit        | `test_should_round_rating_down_below_half`             |
| RATING-009 | 丸め処理(0.5)        | 計算結果1512.5   | 保存処理            | 1513になる                        | Unit        | `test_should_round_rating_half_up`                     |
| RATING-010 | 丸め処理(切り上げ側) | 計算結果1512.9   | 保存処理            | 1513になる                        | Unit        | `test_should_round_rating_up_above_half`               |
| RATING-011 | レート差0            | 両チーム1500     | 計算実行            | 期待値どおり更新される            | Unit        | `test_should_calculate_rating_with_equal_rating`       |
| RATING-012 | レート差400          | 1500対1900       | 計算実行            | 期待値どおり更新される            | Unit        | `test_should_calculate_rating_with_400_rating_gap`     |
| RATING-013 | 大きなレート差       | 1000対2500       | 計算実行            | 期待値どおり更新される            | Unit        | `test_should_calculate_rating_with_large_rating_gap`   |
| RATING-014 | 格上勝利             | 低レート敗北     | 計算実行            | 変動量が小さい                    | Unit        | `test_should_apply_small_change_when_favorite_wins`    |
| RATING-015 | 格下勝利             | 高レート敗北     | 計算実行            | 変動量が大きい                    | Unit        | `test_should_apply_large_change_when_underdog_wins`    |
| RATING-016 | 引き分け             | 引き分け登録     | approve-match実行   | レート変動なし                    | Integration | `test_api_should_not_update_rating_on_draw`            |
| RATING-017 | rating_history件数   | 試合終了         | rating_history取得  | 2件登録される                     | Integration | `test_api_should_create_two_rating_history_records`    |
| RATING-018 | 更新前レート         | 試合終了         | rating_history取得  | before_ratingが正しい             | Integration | `test_api_should_store_previous_rating`                |
| RATING-019 | 更新後レート         | 試合終了         | rating_history取得  | after_ratingが正しい              | Integration | `test_api_should_store_new_rating`                     |
| RATING-020 | 増減値               | 試合終了         | rating_history取得  | delta_ratingが正しい              | Integration | `test_api_should_store_rating_delta`                   |
| RATING-021 | トランザクション成功 | 正常終了         | DB確認              | teams・history・matchが更新される | Integration | `test_api_should_commit_rating_transaction`            |
| RATING-022 | トランザクション失敗 | 更新途中で例外   | DB確認              | 全更新がロールバックされる        | Integration | `test_api_should_rollback_rating_transaction`          |
| RATING-023 | 二重承認防止         | COMPLETED状態    | approve-match再実行 | レートが再更新されない            | Integration | `test_api_should_prevent_duplicate_rating_update`      |
| RATING-024 | K値履歴              | K値変更後試合    | rating_history取得  | 試合時点のK値が保存される         | Integration | `test_api_should_store_applied_k_factor`               |
| RATING-025 | 負値防止仕様         | 極端なレート条件 | 計算実行            | 仕様どおりのレートになる          | Unit        | `test_should_apply_rating_lower_bound_rule`            |

---

# 3. 境界値テスト

重点的に確認する。

| 対象       |                             値 |
| ---------- | -----------------------------: |
| 初期レート |                           1500 |
| K値        |          0 / 1 / 32 / 64 / 128 |
| レート差   | 0 / 1 / 399 / 400 / 401 / 1000 |
| 丸め       |                   .4 / .5 / .6 |

---

# 4. 異常系テスト

以下を必ず実施する。

- 試合が存在しない
- Match Status が不正
- K値取得失敗
- teams更新失敗
- rating_history登録失敗
- completed_at が未設定
- 既にCOMPLETEDの試合
- 権限のないユーザーによる承認

---

# 5. AI実装ルール

- Elo計算ロジックはUnit Testを最優先で実装する。
- 期待勝率・レート更新式・丸め処理は個別テストを作成する。
- Integration TestではDB更新と`rating_history`登録を必ず検証する。
- トランザクションのコミット・ロールバックを確認する。
- 同一試合でレートが二重更新されないことを検証する。
- 期待値はテスト内でハードコードせず、仕様書の計算式から導出する。
